import FFT from 'fft.js';

// shortcut: four-second contexts limit CPU RAM use; use a longer export when memory permits and quality needs it.
export const ROFORMER_CHUNK = 176400;
export const ROFORMER_FRAMES = 401;
const SIZE = 2048; const HOP = 441; const BINS = SIZE / 2 + 1;

// Match MSS_ONNX_TensorRT's BS_roformer_processor: time-major input, frequency-major complex masks.
export class RoformerSpectrogram {
  private fft = new FFT(SIZE);
  private frame = new Float64Array(SIZE);
  private spectrum = new Float64Array(SIZE * 2);
  private inverseFrame = new Float64Array(SIZE * 2);
  private window = Float64Array.from({ length: SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / SIZE));

  forward(channels: Float32Array[]): Float32Array {
    const result = new Float32Array(ROFORMER_FRAMES * BINS * 4);
    for (let ch = 0; ch < 2; ch++) for (let t = 0; t < ROFORMER_FRAMES; t++) {
      for (let i = 0; i < SIZE; i++) {
        let index = t * HOP + i - SIZE / 2;
        if (index < 0) index = -index;
        if (index >= ROFORMER_CHUNK) index = 2 * ROFORMER_CHUNK - 2 - index;
        this.frame[i] = channels[ch][index] * this.window[i];
      }
      this.fft.realTransform(this.spectrum, this.frame);
      for (let bin = 0; bin < BINS; bin++) {
        const offset = (t * BINS * 2 + bin * 2 + ch) * 2;
        result[offset] = this.spectrum[bin * 2]; result[offset + 1] = this.spectrum[bin * 2 + 1];
      }
    }
    return result;
  }

  inverse(input: Float32Array, mask: Float32Array): Float32Array[] {
    const count = ROFORMER_FRAMES * BINS * 4;
    if (input.length !== count || mask.length !== count || !mask.every(Number.isFinite)) throw new Error('Invalid BS-RoFormer output.');
    const result = [new Float32Array(ROFORMER_CHUNK), new Float32Array(ROFORMER_CHUNK)];
    const weights = new Float32Array(ROFORMER_CHUNK);
    for (let ch = 0; ch < 2; ch++) for (let t = 0; t < ROFORMER_FRAMES; t++) {
      for (let bin = 0; bin < BINS; bin++) {
        const offset = (t * BINS * 2 + bin * 2 + ch) * 2;
        const m = ((bin * 2 + ch) * ROFORMER_FRAMES + t) * 2;
        this.spectrum[bin * 2] = input[offset] * mask[m] - input[offset + 1] * mask[m + 1];
        this.spectrum[bin * 2 + 1] = input[offset] * mask[m + 1] + input[offset + 1] * mask[m];
      }
      this.fft.completeSpectrum(this.spectrum); this.fft.inverseTransform(this.inverseFrame, this.spectrum);
      for (let i = 0; i < SIZE; i++) {
        const index = t * HOP + i - SIZE / 2;
        if (index < 0 || index >= ROFORMER_CHUNK) continue;
        result[ch][index] += this.inverseFrame[i * 2] * this.window[i];
        if (ch === 0) weights[index] += this.window[i] ** 2;
      }
    }
    for (const channel of result) for (let i = 0; i < channel.length; i++) channel[i] /= weights[i] || 1;
    return result;
  }
}

export async function removeRoformerVocals(channels: Float32Array[], infer: (chunk: Float32Array[]) => Promise<Float32Array[]>, progress: (percent: number) => void) {
  const length = channels[0].length; const step = ROFORMER_CHUNK / 2;
  const border = length > ROFORMER_CHUNK ? step : 0;
  const paddedLength = length + border * 2; const fade = ROFORMER_CHUNK / 10;
  const result = [new Float32Array(length), new Float32Array(length)]; const weights = new Float32Array(length);
  const chunk = [new Float32Array(ROFORMER_CHUNK), new Float32Array(ROFORMER_CHUNK)];
  for (let start = 0; start < paddedLength; start += step) {
    const valid = Math.min(ROFORMER_CHUNK, paddedLength - start);
    for (let i = 0; i < ROFORMER_CHUNK; i++) {
      const local = i < valid ? i : valid > step ? 2 * valid - 2 - i : -1;
      let index = start + local - border;
      if (index < 0) index = -index;
      if (index >= length) index = 2 * length - 2 - index;
      for (let ch = 0; ch < 2; ch++) chunk[ch][i] = local < 0 ? 0 : channels[ch][index];
    }
    const vocals = await infer(chunk);
    if (vocals.length !== 2 || vocals.some(channel => channel.length !== ROFORMER_CHUNK || !channel.every(Number.isFinite))) throw new Error('Invalid BS-RoFormer audio.');
    for (let i = 0; i < valid; i++) {
      const index = start + i - border;
      if (index < 0 || index >= length) continue;
      const weight = i < fade && start > 0 ? i / (fade - 1) : i >= ROFORMER_CHUNK - fade && start + step < paddedLength ? (ROFORMER_CHUNK - 1 - i) / (fade - 1) : 1;
      weights[index] += weight;
      for (let ch = 0; ch < 2; ch++) result[ch][index] += vocals[ch][i] * weight;
    }
    progress(Math.round(Math.min(1, (start + step) / paddedLength) * 100));
  }
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < length; i++) result[ch][i] = channels[ch][i] - result[ch][i] / (weights[i] || 1);
  return result;
}

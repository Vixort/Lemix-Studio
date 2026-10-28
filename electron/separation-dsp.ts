import FFT from 'fft.js';

export const FFT_SIZE = 6144;
export const BINS = 3072;
export const FRAMES = 256;
export const HOP = 1024;
export const CHUNK = HOP * (FRAMES - 1);
export const VALID = CHUNK - FFT_SIZE;
export const MODEL_HASH = '317554b07fe1ea5279a77f2b1520a41ea4b93432560c4ffd08792c30fddf9adc';
export const MODEL_NAME = 'UVR-MDX-NET-Inst_HQ_3.onnx';

// MDX uses a 6144-point FFT: three 2048-point transforms preserve its trained frequency grid.
export class FFT6144 {
  private fft = new FFT(2048);
  private parts = Array.from({ length: 3 }, () => new Float64Array(4096));
  private transformed = Array.from({ length: 3 }, () => new Float64Array(4096));
  private cosine = Float64Array.from({ length: FFT_SIZE }, (_, k) => Math.cos(-2 * Math.PI * k / FFT_SIZE));
  private sine = Float64Array.from({ length: FFT_SIZE }, (_, k) => Math.sin(-2 * Math.PI * k / FFT_SIZE));

  transform(output: Float64Array, input: Float64Array, inverse = false) {
    for (let r = 0; r < 3; r++) {
      const part = this.parts[r];
      for (let m = 0; m < 2048; m++) {
        part[2 * m] = input[2 * (3 * m + r)];
        part[2 * m + 1] = input[2 * (3 * m + r) + 1] * (inverse ? -1 : 1);
      }
      this.fft.transform(this.transformed[r], part);
    }
    for (let k = 0; k < FFT_SIZE; k++) {
      const index = 2 * (k % 2048);
      let re = 0; let im = 0;
      for (let r = 0; r < 3; r++) {
        const angle = k * r % FFT_SIZE;
        const real = this.transformed[r][index]; const imaginary = this.transformed[r][index + 1];
        re += real * this.cosine[angle] - imaginary * this.sine[angle];
        im += real * this.sine[angle] + imaginary * this.cosine[angle];
      }
      output[2 * k] = re / (inverse ? FFT_SIZE : 1);
      output[2 * k + 1] = im / (inverse ? -FFT_SIZE : 1);
    }
  }
}

export class MDXSpectrogram {
  private fft = new FFT6144();
  private input = new Float64Array(FFT_SIZE * 2);
  private output = new Float64Array(FFT_SIZE * 2);
  private window = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT_SIZE));

  forward(channels: Float32Array[]): Float32Array {
    const tensor = new Float32Array(4 * BINS * FRAMES);
    for (let channel = 0; channel < 2; channel++) for (let frame = 0; frame < FRAMES; frame++) {
      for (let i = 0; i < FFT_SIZE; i++) {
        let index = frame * HOP + i - FFT_SIZE / 2;
        if (index < 0) index = -index;
        if (index >= CHUNK) index = 2 * CHUNK - 2 - index;
        this.input[2 * i] = channels[channel][index] * this.window[i]; this.input[2 * i + 1] = 0;
      }
      this.fft.transform(this.output, this.input);
      for (let bin = 0; bin < BINS; bin++) {
        tensor[((channel * 2) * BINS + bin) * FRAMES + frame] = this.output[bin * 2];
        tensor[((channel * 2 + 1) * BINS + bin) * FRAMES + frame] = this.output[bin * 2 + 1];
      }
    }
    return tensor;
  }

  inverse(tensor: Float32Array): Float32Array[] {
    if (tensor.length !== 4 * BINS * FRAMES) throw new Error('Unexpected model output shape.');
    const channels = [new Float32Array(CHUNK), new Float32Array(CHUNK)];
    const weights = new Float32Array(CHUNK);
    for (let channel = 0; channel < 2; channel++) for (let frame = 0; frame < FRAMES; frame++) {
      this.input.fill(0);
      for (let bin = 0; bin < BINS; bin++) {
        const re = tensor[((channel * 2) * BINS + bin) * FRAMES + frame];
        const im = tensor[((channel * 2 + 1) * BINS + bin) * FRAMES + frame];
        if (!Number.isFinite(re) || !Number.isFinite(im)) throw new Error('The model returned invalid audio.');
        this.input[bin * 2] = re; this.input[bin * 2 + 1] = im;
        if (bin > 0) { this.input[(FFT_SIZE - bin) * 2] = re; this.input[(FFT_SIZE - bin) * 2 + 1] = -im; }
      }
      this.fft.transform(this.output, this.input, true);
      for (let i = 0; i < FFT_SIZE; i++) {
        const index = frame * HOP + i - FFT_SIZE / 2;
        if (index < 0 || index >= CHUNK) continue;
        channels[channel][index] += this.output[i * 2] * this.window[i];
        if (channel === 0) weights[index] += this.window[i] ** 2;
      }
    }
    for (const channel of channels) for (let i = 0; i < CHUNK; i++) channel[i] /= weights[i] || 1;
    return channels;
  }
}

export function decodeSeparationInput(value: unknown): Float32Array[] {
  if (!(value instanceof Uint8Array) || value.length < 48 || value.length > 44 + 600 * 44100 * 4) throw new Error('Select a song up to 10 minutes long.');
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...value.subarray(offset, offset + length));
  if (text(0, 4) !== 'RIFF' || text(8, 8) !== 'WAVEfmt ' || text(36, 4) !== 'data' ||
      view.getUint32(4, true) !== value.length - 8 || view.getUint32(16, true) !== 16 ||
      view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 2 ||
      view.getUint32(24, true) !== 44100 || view.getUint32(28, true) !== 176400 ||
      view.getUint16(32, true) !== 4 || view.getUint16(34, true) !== 16 ||
      view.getUint32(40, true) !== value.length - 44 || (value.length - 44) % 4 !== 0) {
    throw new Error('Invalid separation input. Expected stereo 44.1 kHz PCM WAV.');
  }
  const frames = (value.length - 44) / 4;
  const channels = [new Float32Array(frames), new Float32Array(frames)];
  for (let i = 0; i < frames; i++) for (let ch = 0; ch < 2; ch++) channels[ch][i] = view.getInt16(44 + i * 4 + ch * 2, true) / 32768;
  return channels;
}

export function encodeSeparationOutput(original: Uint8Array, channels: Float32Array[]): Uint8Array {
  if (channels.length !== 2 || channels.some(ch => ch.length * 4 + 44 !== original.length)) throw new Error('Invalid separated audio length.');
  const result = new Uint8Array(original);
  const view = new DataView(result.buffer);
  for (let i = 0; i < channels[0].length; i++) for (let ch = 0; ch < 2; ch++) {
    const sample = channels[ch][i];
    if (!Number.isFinite(sample)) throw new Error('Invalid separated sample.');
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 4 + ch * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  }
  return result;
}

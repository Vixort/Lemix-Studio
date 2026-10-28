import FFT from 'fft.js';
import type { Cleanup } from './model.ts';

function repairClicks(input: Float32Array, sampleRate: number, amount: number) {
  const output = new Float32Array(input);
  if (!amount || input.length < 5) return output;
  const curve = new Float32Array(input.length);
  for (let i = 1; i < input.length - 1; i++) curve[i] = Math.abs(input[i] - (input[i - 1] + input[i + 1]) / 2);
  const detected: number[] = [];
  for (let i = 2; i < input.length - 2; i++) {
    let baseline = 0;
    for (let distance = 8; distance <= 32; distance += 8) baseline += curve[Math.max(1, i - distance)] + curve[Math.min(input.length - 2, i + distance)];
    if (curve[i] > Math.max(0.024 + (1 - amount) * 0.12, baseline / 8 * (6 - amount * 3))) detected.push(i);
  }
  const maxBurst = Math.max(3, Math.round(sampleRate * 0.003));
  for (let i = 0; i < detected.length; i++) {
    const first = detected[i]; let last = first;
    while (i + 1 < detected.length && detected[i + 1] - last <= maxBurst) last = detected[++i];
    if (last - first + 1 > maxBurst) continue;
    const from = Math.max(0, first - 2); const to = Math.min(input.length - 1, last + 2);
    for (let sample = from + 1; sample < to; sample++) {
      const interpolated = input[from] + (input[to] - input[from]) * (sample - from) / (to - from);
      output[sample] += (interpolated - output[sample]) * amount;
    }
  }
  return output;
}

function reduceNoise(channels: Float32Array[], settings: Cleanup) {
  const size = 1024; const hop = size / 4; const bins = size / 2 + 1;
  const fft = new FFT(size);
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));
  const spectra = channels.map(() => new Float64Array(size * 2));
  const output = channels.map(channel => new Float32Array(channel.length));
  const weights = new Float32Array(channels[0].length);
  const frame = new Float64Array(size); const inverse = new Float64Array(size * 2);
  const gains = new Float64Array(bins); const previous = new Float64Array(bins).fill(1);
  const noisePower = 10 ** (settings.floor / 10) * size * 0.375 * 1.5 ** 2;
  for (let start = -size / 2; start < channels[0].length; start += hop) {
    for (let ch = 0; ch < channels.length; ch++) {
      for (let i = 0; i < size; i++) frame[i] = (channels[ch][start + i] ?? 0) * window[i];
      fft.realTransform(spectra[ch], frame);
    }
    for (let bin = 0; bin < bins; bin++) {
      let power = 0;
      for (const spectrum of spectra) power = Math.max(power, spectrum[bin * 2] ** 2 + spectrum[bin * 2 + 1] ** 2);
      gains[bin] = 1 - settings.noise * (1 - Math.max(0.05, 1 - noisePower / (power + 1e-20)));
    }
    for (let bin = 0; bin < bins; bin++) {
      const smooth = Math.max(gains[bin], (gains[Math.max(0, bin - 1)] + gains[bin] * 2 + gains[Math.min(bins - 1, bin + 1)]) / 4);
      previous[bin] += (smooth - previous[bin]) * (smooth > previous[bin] ? 0.85 : 0.35);
      for (const spectrum of spectra) { spectrum[bin * 2] *= previous[bin]; spectrum[bin * 2 + 1] *= previous[bin]; }
    }
    for (let ch = 0; ch < channels.length; ch++) {
      fft.completeSpectrum(spectra[ch]); fft.inverseTransform(inverse, spectra[ch]);
      for (let i = 0; i < size; i++) {
        const index = start + i;
        if (index < 0 || index >= channels[ch].length) continue;
        output[ch][index] += inverse[i * 2] * window[i];
        if (ch === 0) weights[index] += window[i] ** 2;
      }
    }
  }
  for (const channel of output) for (let i = 0; i < channel.length; i++) channel[i] /= weights[i] || 1;
  return output;
}

export function cleanPcm(channels: Float32Array[], sampleRate: number, settings: Cleanup): Float32Array[] {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || channels.length < 1 || channels.length > 2 ||
      !channels[0].length || channels[0].length > Math.ceil(sampleRate * 613) ||
      channels.some(channel => !(channel instanceof Float32Array) || channel.length !== channels[0].length || !channel.every(Number.isFinite)) ||
      typeof settings.enabled !== 'boolean' || !Number.isFinite(settings.noise) || settings.noise < 0 || settings.noise > 1 ||
      !Number.isFinite(settings.declick) || settings.declick < 0 || settings.declick > 1 || !Number.isFinite(settings.floor) || settings.floor < -80 || settings.floor > -12) throw new Error('Invalid audio repair input. Mono or stereo audio is required.');
  if (!settings.enabled || !settings.noise && !settings.declick) return channels.map(channel => new Float32Array(channel));
  const repaired = channels.map(channel => repairClicks(channel, sampleRate, settings.declick));
  const output = settings.noise ? reduceNoise(repaired, settings) : repaired;
  if (output.some(channel => !channel.every(Number.isFinite))) throw new Error('Audio repair could not safely process this signal level.');
  return output;
}

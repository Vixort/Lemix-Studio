import test from 'node:test';
import assert from 'node:assert/strict';
import { FFT6144, FFT_SIZE, CHUNK, MDXSpectrogram, decodeSeparationInput, encodeSeparationOutput } from '../electron/separation-dsp.ts';
import { encodeWav } from '../src/model.ts';

test('6144-point mixed radix FFT round trips complex audio', () => {
  const fft = new FFT6144();
  const input = Float64Array.from({ length: FFT_SIZE * 2 }, (_, i) => Math.sin(i * 0.39) * 0.2);
  const spectrum = new Float64Array(input.length); const output = new Float64Array(input.length);
  fft.transform(spectrum, input); fft.transform(output, spectrum, true);
  assert.ok(output.every((value, i) => Math.abs(value - input[i]) < 1e-10));
});

test('MDX STFT uses stereo real/imaginary layout and preserves alignment and gain', () => {
  const stft = new MDXSpectrogram();
  const channels = [440, 660].map(hz => Float32Array.from({ length: CHUNK }, (_, i) => Math.sin(i / 44100 * hz * 2 * Math.PI) * 0.3));
  const spectrum = stft.forward(channels);
  assert.equal(spectrum.length, 4 * 3072 * 256);
  const reconstructed = stft.inverse(spectrum);
  for (let ch = 0; ch < 2; ch++) {
    let error = 0;
    for (let i = FFT_SIZE; i < CHUNK - FFT_SIZE; i++) error = Math.max(error, Math.abs(reconstructed[ch][i] - channels[ch][i]));
    assert.ok(error < 1e-5, `STFT reconstruction error ${error}`);
  }
  assert.throws(() => stft.inverse(new Float32Array(1)));
});

test('separation validates WAV boundaries and preserves original length and stereo channels', () => {
  const samples = [new Float32Array([0, -0.5, 0.25]), new Float32Array([0.5, 0, -0.25])];
  const wav = encodeWav(samples, 44100);
  const decoded = decodeSeparationInput(wav);
  assert.equal(decoded[0].length, 3); assert.equal(decoded[0][1], -0.5);
  const output = encodeSeparationOutput(wav, decoded);
  assert.equal(output.length, wav.length);
  assert.deepEqual(output.slice(0, 44), wav.slice(0, 44));
  for (const bad of [new Uint8Array(0), encodeWav([samples[0]], 44100), encodeWav(samples, 48000), wav.slice(0, -1)]) assert.throws(() => decodeSeparationInput(bad));
  const corrupt = new Uint8Array(wav); corrupt[40] = 0; assert.throws(() => decodeSeparationInput(corrupt));
  assert.throws(() => encodeSeparationOutput(wav, [new Float32Array(1)]));
});

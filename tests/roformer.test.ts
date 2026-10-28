import test from 'node:test';
import assert from 'node:assert/strict';
import { ROFORMER_CHUNK, ROFORMER_FRAMES, RoformerSpectrogram, removeRoformerVocals } from '../electron/roformer-dsp.ts';
import { LOCAL_MODELS, SEPARATION_MODELS, separationModel, separationContext, mvsepUrl } from '../electron/separation-models.ts';
import { existsSync } from 'node:fs';

test('separation model selection is allowlisted and the original API default stays compatible', () => {
  assert.equal(separationModel(), 'mdx');
  assert.equal(separationModel('bs-roformer'), 'bs-roformer');
  for (const id of ['__proto__', 'constructor', '../model.onnx', null, 1, {}]) assert.throws(() => separationModel(id));
  for (const info of Object.values(LOCAL_MODELS)) {
    for (const file of info.files) {
      assert.match(file.hash, /^[a-f0-9]{64}$/); assert.ok(file.bytes > 0);
      assert.equal(new URL(file.url).protocol, 'https:'); assert.ok(!file.file.includes('/'));
    }
    if ('graph4' in info) assert.ok(existsSync(`electron-assets/${info.graph4}.gz`));
    if ('graph8' in info) assert.ok(existsSync(`electron-assets/${info.graph8}.gz`));
  }
  for (const [id, info] of Object.entries(SEPARATION_MODELS)) { assert.equal(separationModel(id), id); assert.ok(info.members.every(member => Object.hasOwn(LOCAL_MODELS, member))); }
  assert.equal(separationContext(), 4); assert.equal(separationContext(8), 8);
  for (const value of [0, 100000, '8', null]) assert.throws(() => separationContext(value));
  assert.match(mvsepUrl('mvsep-bs-124'), /^https:\/\/www.mvsep.com\//);
  for (const id of ['__proto__', 'https://attacker.invalid', 'mdx']) assert.throws(() => mvsepUrl(id));
});

test('eight-second frequency-major RoFormer layout preserves stereo and supports the Mel-Band DC filter', () => {
  const input = [330, 990].map(hz => Float32Array.from({ length: 352800 }, (_, i) => Math.sin(i / 44100 * hz * 2 * Math.PI) * 0.2));
  const stft = new RoformerSpectrogram(8, true); const spectrum = stft.forward(input);
  const mask = Float32Array.from({ length: spectrum.length }, (_, i) => i % 2 === 0 ? 1 : 0);
  const output = stft.inverse(spectrum, mask);
  assert.equal(spectrum.length, 801 * 4100);
  for (let ch = 0; ch < 2; ch++) assert.ok(output[ch].every((value, i) => Math.abs(value - input[ch][i]) < 1e-6));
  const dc = new Float32Array(spectrum.length); for (let t = 0; t < 801; t++) dc[t * 2] = 100;
  assert.ok(stft.inverse(dc, mask)[0].some(value => value > 0));
  assert.ok(new RoformerSpectrogram(8, true, true).inverse(dc, mask).every(channel => channel.every(value => value === 0)));
});

test('RoFormer STFT identity mask preserves stereo, DC, Nyquist, alignment and gain', () => {
  const input = [330, 880].map(hz => Float32Array.from({ length: ROFORMER_CHUNK }, (_, i) => Math.sin(i / 44100 * hz * 2 * Math.PI) * 0.2 + 0.01 + (i % 2 ? -0.02 : 0.02)));
  input[0][12001] += 0.6;
  const stft = new RoformerSpectrogram(); const spectrum = stft.forward(input);
  assert.equal(spectrum.length, 4100 * ROFORMER_FRAMES);
  const mask = Float32Array.from({ length: spectrum.length }, (_, i) => i % 2 === 0 ? 1 : 0);
  const output = stft.inverse(spectrum, mask);
  for (let ch = 0; ch < 2; ch++) assert.ok(output[ch].every((value, i) => Math.abs(value - input[ch][i]) < 1e-6));
  for (let bin = 0; bin < 1025; bin++) for (let t = 0; t < ROFORMER_FRAMES; t++) mask[((bin * 2 + 1) * ROFORMER_FRAMES + t) * 2] = 0;
  const leftOnly = stft.inverse(spectrum, mask);
  assert.ok(leftOnly[0].every((value, i) => Math.abs(value - input[0][i]) < 1e-6));
  assert.ok(leftOnly[1].every(value => value === 0));
  mask[0] = NaN; assert.throws(() => stft.inverse(spectrum, mask));
  assert.throws(() => stft.inverse(spectrum, new Float32Array(1)));
});

test('RoFormer overlap-add and vocal subtraction preserve short tails and long chunk boundaries', async () => {
  for (const [length, seconds] of [[1, 4], [1000, 4], [ROFORMER_CHUNK - 1, 4], [ROFORMER_CHUNK, 4], [ROFORMER_CHUNK + 137, 4], [352937, 8]] as const) {
    const input = [0.1, 0.3].map(gain => Float32Array.from({ length }, (_, i) => Math.sin(i * 0.13) * gain));
    input[0][length - 1] = 0.7;
    const original = new Float32Array(input[0]); const progress: number[] = [];
    const output = await removeRoformerVocals(input, async chunk => chunk.map(channel => Float32Array.from(channel, value => value / 2)), percent => progress.push(percent), seconds);
    assert.equal(output[0].length, length); assert.deepEqual(input[0], original);
    for (let ch = 0; ch < 2; ch++) assert.ok(output[ch].every((value, i) => Math.abs(value - input[ch][i] / 2) < 1e-7), `Length ${length}, channel ${ch}`);
    assert.equal(progress.at(-1), 100); assert.ok(progress.every((value, i) => i === 0 || value >= progress[i - 1]));
  }
  await assert.rejects(removeRoformerVocals([new Float32Array(2), new Float32Array(2)], async () => [new Float32Array(1)], () => {}));
});

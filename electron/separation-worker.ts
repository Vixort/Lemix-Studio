import * as ort from 'onnxruntime-node';
import { readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { BINS, CHUNK, FFT_SIZE, FRAMES, VALID, MDXSpectrogram, decodeSeparationInput, encodeSeparationOutput } from './separation-dsp.js';

process.parentPort.once('message', async ({ data }: { data: { input: string; output: string; model: string } }) => {
  let session: ort.InferenceSession | undefined;
  try {
    const original = await readFile(data.input);
    const channels = decodeSeparationInput(original);
    process.parentPort.postMessage({ stage: 'loading', percent: 0 });
    session = await ort.InferenceSession.create(data.model, {
      executionProviders: ['cpu'], intraOpNumThreads: Math.min(4, Math.max(1, availableParallelism() - 1)), interOpNumThreads: 1,
    });
    const stft = new MDXSpectrogram();
    const length = channels[0].length;
    const result = [new Float32Array(length), new Float32Array(length)];
    const weights = new Float32Array(length);
    const chunk = [new Float32Array(CHUNK), new Float32Array(CHUNK)];
    const stride = VALID / 2;
    for (let start = 0; start < length; start += stride) {
      for (let ch = 0; ch < 2; ch++) for (let i = 0; i < CHUNK; i++) {
        const index = start + i - FFT_SIZE / 2;
        chunk[ch][i] = index >= 0 && index < length ? channels[ch][index] : 0;
      }
      const spectrum = stft.forward(chunk);
      for (let channel = 0; channel < 4; channel++) spectrum.fill(0, channel * BINS * FRAMES, (channel * BINS + 3) * FRAMES);
      const input = new ort.Tensor('float32', spectrum, [1, 4, BINS, FRAMES]);
      const predicted = await session.run({ [session.inputNames[0]]: input });
      const output = predicted[session.outputNames[0]];
      if (output.type !== 'float32' || output.dims.join(',') !== `1,4,${BINS},${FRAMES}`) throw new Error('Incompatible separation model.');
      const separated = stft.inverse(output.data as Float32Array);
      for (let i = 0; i < VALID && start + i < length; i++) {
        const weight = Math.sin(Math.PI * (i + 0.5) / VALID) ** 2;
        weights[start + i] += weight;
        for (let ch = 0; ch < 2; ch++) result[ch][start + i] += separated[ch][FFT_SIZE / 2 + i] * weight * 1.035;
      }
      input.dispose(); for (const tensor of Object.values(predicted)) tensor.dispose();
      process.parentPort.postMessage({ stage: 'separating', percent: Math.round(Math.min(1, (start + stride) / length) * 100) });
    }
    for (const channel of result) for (let i = 0; i < length; i++) channel[i] /= weights[i] || 1;
    await writeFile(data.output, encodeSeparationOutput(original, result));
    process.parentPort.postMessage({ done: true });
  } catch (error) { process.parentPort.postMessage({ error: error instanceof Error ? error.message : 'Separation failed.' }); }
  finally { await session?.release(); }
});

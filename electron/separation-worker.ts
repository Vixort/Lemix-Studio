import * as ort from 'onnxruntime-node';
import { readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { BINS, CHUNK, FFT_SIZE, FRAMES, VALID, MDXSpectrogram, decodeSeparationInput, encodeSeparationOutput } from './separation-dsp.js';
import { RoformerSpectrogram, removeRoformerVocals } from './roformer-dsp.js';
import { LOCAL_MODELS } from './separation-models.js';
import type { LocalModel, LocalModelId } from './separation-models.js';

async function separate(file: string, model: LocalModel, channels: Float32Array[], seconds: 4 | 8, progress: (percent: number) => void) {
  let session: ort.InferenceSession | undefined;
  try {
    session = await ort.InferenceSession.create(file, {
      executionProviders: ['cpu'], intraOpNumThreads: Math.min(4, Math.max(1, availableParallelism() - 1)), interOpNumThreads: 1,
      ...(model.format !== 'mdx' ? { enableCpuMemArena: false, enableMemPattern: false } : {}),
    });
    let result: Float32Array[];
    if (model.format !== 'mdx') {
      const frames = seconds * 100 + 1;
      const frequencyMajor = model.format === 'roformer-frequency';
      const stft = new RoformerSpectrogram(seconds, frequencyMajor, frequencyMajor);
      const inference = session;
      result = await removeRoformerVocals(channels, async chunk => {
        const spectrum = stft.forward(chunk);
        const input = new ort.Tensor('float32', spectrum, frequencyMajor ? [1, 2050, frames, 2] : [1, frames, 4100]);
        let predicted: Record<string, ort.Tensor> = {};
        try {
          predicted = await inference.run({ [inference.inputNames[0]]: input });
          const mask = predicted[inference.outputNames[0]];
          if (mask.type !== 'float32' || mask.dims.join(',') !== `1,1,2050,${frames},2`) throw new Error(`Incompatible ${model.name} model.`);
          return stft.inverse(spectrum, mask.data as Float32Array);
        } finally { input.dispose(); for (const tensor of Object.values(predicted)) tensor.dispose(); }
      }, progress, seconds);
    } else {
      const stft = new MDXSpectrogram();
      const length = channels[0].length;
      result = [new Float32Array(length), new Float32Array(length)];
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
          for (let ch = 0; ch < 2; ch++) result[ch][start + i] += separated[ch][FFT_SIZE / 2 + i] * weight * 1.022;
        }
        input.dispose(); for (const tensor of Object.values(predicted)) tensor.dispose();
        progress(Math.round(Math.min(1, (start + stride) / length) * 100));
      }
      for (const channel of result) for (let i = 0; i < length; i++) channel[i] /= weights[i] || 1;
    }
    return result;
  }
  finally { await session?.release(); }
}

process.parentPort.once('message', async ({ data }: { data: { input: string; output: string; models: { id: LocalModelId; file: string }[]; seconds: 4 | 8 } }) => {
  try {
    const original = await readFile(data.input); const channels = decodeSeparationInput(original);
    const result = channels.map(channel => new Float32Array(channel.length));
    for (let index = 0; index < data.models.length; index++) {
      const entry = data.models[index]; const model = LOCAL_MODELS[entry.id];
      process.parentPort.postMessage({ stage: 'loading', percent: Math.round(index / data.models.length * 100), detail: model.name });
      const estimate = await separate(entry.file, model, channels, data.seconds, percent => process.parentPort.postMessage({ stage: 'separating', percent: Math.round((index + percent / 100) / data.models.length * 100), detail: model.name }));
      for (let ch = 0; ch < 2; ch++) for (let i = 0; i < result[ch].length; i++) result[ch][i] += estimate[ch][i] / data.models.length;
    }
    await writeFile(data.output, encodeSeparationOutput(original, result));
    process.parentPort.postMessage({ done: true });
  } catch (error) { process.parentPort.postMessage({ error: error instanceof Error ? error.message : 'Separation failed.' }); }
});

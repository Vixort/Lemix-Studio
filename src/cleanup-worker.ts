import { cleanPcm } from './cleanup.ts';
import type { Cleanup } from './model.ts';

self.onmessage = (event: MessageEvent<{ buffers: ArrayBuffer[]; sampleRate: number; settings: Cleanup }>) => {
  try {
    const { buffers, sampleRate, settings } = event.data;
    const result = cleanPcm(buffers.map(buffer => new Float32Array(buffer)), sampleRate, settings);
    const output = result.map(channel => channel.buffer as ArrayBuffer);
    self.postMessage({ buffers: output }, { transfer: output });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Audio repair failed.' }); }
};

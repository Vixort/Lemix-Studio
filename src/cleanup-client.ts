import type { Cleanup } from './model.ts';
// Inline bundles work in Electron's file:// renderer without remote worker URLs.
import RepairWorker from './cleanup-worker?worker&inline';

export function repairBuffer(input: AudioBuffer, settings: Cleanup, context: AudioContext, signal?: AbortSignal): Promise<AudioBuffer> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (input.numberOfChannels > 2) return Promise.reject(new Error('Audio Repair supports mono or stereo audio. Downmix surround audio first.'));
  return new Promise((resolve, reject) => {
    const worker = new RepairWorker();
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(signal!.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = event => { finish(); reject(new Error(event.message || 'Could not start audio repair.')); };
    worker.onmessage = (event: MessageEvent<{ error?: string; buffers?: ArrayBuffer[] }>) => {
      finish();
      if (event.data.error || !event.data.buffers) { reject(new Error(event.data.error ?? 'Audio repair returned no data.')); return; }
      const result = context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
      event.data.buffers.forEach((buffer, ch) => result.copyToChannel(new Float32Array(buffer), ch));
      resolve(result);
    };
    const buffers = Array.from({ length: input.numberOfChannels }, (_, ch) => new Float32Array(input.getChannelData(ch)).buffer);
    worker.postMessage({ buffers, sampleRate: input.sampleRate, settings }, buffers);
  });
}

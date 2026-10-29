import TranscriptionWorker from './transcription-worker?worker&inline';
import type { PlayedNote } from './sampler.ts';
export async function detectMelody(buffer: AudioBuffer, signal: AbortSignal, progress: (value: number) => void): Promise<PlayedNote[]> {
  signal.throwIfAborted();
  const resampler = new OfflineAudioContext(1, Math.ceil(buffer.duration * 22050), 22050);
  const source = resampler.createBufferSource(); source.buffer = buffer;
  source.connect(resampler.destination); source.start();
  const mono = await resampler.startRendering();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new TranscriptionWorker();
    const finish = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new Error('Conversion cancelled.')); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = e => { finish(); reject(new Error(e.message || 'Could not analyze audio.')); };
    worker.onmessage = e => {
      if (e.data.error) { finish(); reject(new Error(e.data.error)); }
      else if (e.data.notes) { finish(); resolve(e.data.notes); }
      else progress(e.data.progress);
    };
    const pcm = new Float32Array(mono.getChannelData(0));
    const modelUrl = new URL(`${import.meta.env.BASE_URL}transcription/model.json`, document.baseURI).href;
    worker.postMessage({ pcm, rate: 22050, modelUrl }, [pcm.buffer]);
  });
}

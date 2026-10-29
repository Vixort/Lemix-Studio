import { transcribe } from './transcription.ts';
self.onmessage = async (event: MessageEvent<{ pcm: Float32Array; rate: number; modelUrl: string }>) => {
  try { self.postMessage({ notes: await transcribe(event.data.pcm, event.data.rate, event.data.modelUrl, progress => self.postMessage({ progress })) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Conversion failed.' }); }
};

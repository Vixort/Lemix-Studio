import type { TrackKind } from './model.ts';
export interface PlayedNote { midi: number; start: number; duration: number; velocity: number }
const banks = new Map<string, Promise<Record<string, string>>>();
const decoded = new Map<string, Promise<Float32Array>>();
const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (midi: number) => `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
export async function renderInstrument(kind: TrackKind, notes: PlayedNote[], seconds: number, context: AudioContext, signal?: AbortSignal, releaseSeconds = 0.15): Promise<AudioBuffer> {
  if (kind === 'audio') throw new Error('Choose a melodic instrument.');
  if (!banks.has(kind)) banks.set(kind, fetch(`${import.meta.env.BASE_URL}sounds/${kind}.json`).then(r => { if (!r.ok) throw new Error('Instrument samples could not be loaded.'); return r.json(); }).catch(e => { banks.delete(kind); throw e; }));
  const bank = await banks.get(kind)!;
  const rate = context.sampleRate;
  const result = context.createBuffer(1, Math.ceil(seconds * rate), rate), output = result.getChannelData(0);
  for (const [index, note] of notes.entries()) {
    if (index % 16 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    const midi = Math.max(21, Math.min(108, note.midi)), key = `${kind}:${midi}:${rate}`;
    if (!decoded.has(key)) decoded.set(key, (async () => {
      const uri = bank[noteName(midi)]; if (!uri) throw new Error(`Missing instrument sample ${noteName(midi)}`);
      const binary = atob(uri.split(',')[1]);
      const buffer = await context.decodeAudioData(Uint8Array.from(binary, c => c.charCodeAt(0)).buffer);
      return new Float32Array(buffer.getChannelData(0));
    })().catch(e => { decoded.delete(key); throw e; }));
    const sample = await decoded.get(key)!;
    const start = Math.round(note.start * rate), gate = Math.round(note.duration * rate), release = Math.max(1, Math.round(rate * releaseSeconds));
    const count = Math.min(sample.length, gate + release, output.length - start);
    for (let i = 0; i < count; i++) output[start + i] += sample[i] * note.velocity * Math.min(1, i / (rate * 0.003)) * (releaseSeconds < 0.15 ? Math.min(1, (count - i) / (rate * 0.008)) : 1) * (i < gate ? 1 : Math.max(0, 1 - (i - gate) / release));
  }
  return result;
}

import { BasicPitch, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import * as tf from '@tensorflow/tfjs';
import type { PlayedNote } from './sampler.ts';
import { restoreNoteRhythm } from './rhythm.ts';

export function decodeNotes(frames: number[][], onsets: number[][], seconds: number): PlayedNote[] {
  if (!frames.length) return [];
  return noteFramesToTime(outputToNotesPoly(frames, onsets, 0.35, 0.25, 8))
    .filter(n => n.amplitude >= 0.3 && n.pitchMidi >= 36 && n.pitchMidi <= 96 && n.startTimeSeconds < seconds)
    .map(n => ({ midi: n.pitchMidi, start: Math.max(0, n.startTimeSeconds), duration: Math.min(n.durationSeconds, seconds - Math.max(0, n.startTimeSeconds)), velocity: Math.min(0.85, 0.25 + n.amplitude * 0.6) }))
    .filter(n => n.duration >= 0.08)
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
}

export async function transcribe(input: Float32Array, rate: number, modelSource: string | Promise<tf.GraphModel>, progress: (percent: number) => void = () => {}): Promise<PlayedNote[]> {
  if (rate !== 22050 || !input.length || input.length > rate * 600 || !input.every(Number.isFinite)) throw new Error('Invalid audio for conversion. Expected mono 22050 Hz audio.');
  await tf.setBackend('cpu'); await tf.ready();
  const model = await (typeof modelSource === 'string' ? tf.loadGraphModel(modelSource) : modelSource);
  const predictor = new BasicPitch(Promise.resolve(model));
  const notes: PlayedNote[] = [];
  const chunk = rate * 20, context = rate;
  try {
    for (let offset = 0; offset < input.length; offset += chunk) {
      const from = Math.max(0, offset - context), end = Math.min(input.length, offset + chunk + context);
      const frames: number[][] = [], onsets: number[][] = [];
      tf.engine().startScope();
      try {
        await predictor.evaluateModel(input.slice(from, end), (f, o) => { frames.push(...f); onsets.push(...o); }, p => progress(Math.min(99, (offset + p * Math.min(chunk, input.length - offset)) / input.length * 100)));
      } finally { tf.engine().endScope(); }
      const startSeconds = offset / rate, endSeconds = Math.min(input.length, offset + chunk) / rate;
      for (const n of decodeNotes(frames, onsets, (end - from) / rate)) {
        n.start += from / rate;
        if (n.start >= startSeconds && n.start < endSeconds) notes.push({ ...n, duration: Math.min(n.duration, input.length / rate - n.start) });
      }
    }
  } finally { model.dispose(); }
  if (!notes.length) throw new Error('No clear notes detected. Try a cleaner vocal or instrument recording.');
  const melody = restoreNoteRhythm(input, rate, notes);
  progress(100); return melody;
}

import type { PlayedNote } from './sampler.ts';

// shortcut: legato rearticulations without an amplitude attack can merge; use an articulation model to distinguish them.
export function restoreNoteRhythm(input: Float32Array, rate: number, notes: PlayedNote[]): PlayedNote[] {
  const result: PlayedNote[] = [], previous = new Map<number, PlayedNote>();
  const amplitude = (time: number, midi: number) => {
    const count = Math.round(rate * 0.1), start = Math.round(time * rate) - Math.floor(count / 2);
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    let real = 0, imaginary = 0;
    for (let i = 0; i < count; i++) {
      const value = (input[start + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (count - 1)));
      const phase = 2 * Math.PI * frequency * i / rate;
      real += value * Math.cos(phase); imaginary += value * Math.sin(phase);
    }
    return Math.hypot(real, imaginary);
  };
  for (const note of notes) {
    const last = previous.get(note.midi);
    if (last && note.start - (last.start + last.duration) <= 0.08) {
      const before = amplitude(note.start - 0.035, note.midi), after = amplitude(note.start + 0.035, note.midi);
      const at = amplitude(note.start, note.midi);
      // Keep a new strike when the source pitch rises or drops out at the boundary.
      if (before > 1e-5 && after < before * 1.35 && at >= Math.min(before, after) * 0.65) {
        last.duration = Math.max(last.start + last.duration, note.start + note.duration) - last.start;
        continue;
      }
    }
    const copy = { ...note }; result.push(copy); previous.set(note.midi, copy);
  }
  return result;
}

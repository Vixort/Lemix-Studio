import type { PlayedNote } from './sampler.ts';

// shortcut: confidence can soften a genuine quiet part; use separated melody inference when the balance toggle is insufficient.
export function balanceNotes(notes: PlayedNote[]): PlayedNote[] {
  return notes.map(note => {
    const competing = notes.some(other => {
      if (other.midi === note.midi || other.velocity < note.velocity + 0.015) return false;
      const overlap = Math.min(other.start + other.duration, note.start + note.duration) - Math.max(other.start, note.start);
      return overlap >= note.duration * 0.5;
    });
    return { ...note, velocity: note.velocity * (competing ? 0.32 : 1) };
  });
}

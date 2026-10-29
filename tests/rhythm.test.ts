import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreNoteRhythm } from '../src/rhythm.ts';

test('continuous tones keep their timing without false repeated strikes', () => {
  const rate = 22050, pcm = Float32Array.from({ length: rate }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 440 * i / rate));
  const notes = [0, 0.2, 0.4, 0.6].map(start => ({ midi: 69, start, duration: 0.2, velocity: 0.7 }));
  const original = structuredClone(notes);
  assert.deepEqual(restoreNoteRhythm(pcm, rate, notes), [{ ...notes[0], duration: 0.8 }]);
  assert.deepEqual(notes, original);
});

test('real repeated attacks, rests and different pitches stay in place', () => {
  const rate = 22050, pcm = new Float32Array(rate);
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate, local = t % 0.3;
    pcm[i] = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-local * 22);
  }
  const notes = [0, 0.3, 0.6].map(start => ({ midi: 69, start, duration: 0.3, velocity: 0.7 }));
  assert.deepEqual(restoreNoteRhythm(pcm, rate, notes), notes);
  const rest = [{ ...notes[0], duration: 0.1 }, { ...notes[1], start: 0.5 }];
  assert.deepEqual(restoreNoteRhythm(pcm, rate, rest), rest);
  const chord = [{ ...notes[0] }, { ...notes[1], midi: 72 }];
  assert.deepEqual(restoreNoteRhythm(pcm, rate, chord), chord);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceNotes } from '../src/melody.ts';
import type { PlayedNote } from '../src/sampler.ts';
const note = (midi: number, start: number, duration: number, velocity = 0.7): PlayedNote => ({ midi, start, duration, velocity });

test('balancing keeps all pitches, attacks and durations without mutating the original phrase', () => {
  const notes = [note(50, 0.1, 0.5, 0.8), note(38, 0, 0.6, 0.5), note(69, 0.12, 0.3, 0.6), note(45, 0.7, 0.3, 0.65)];
  const original = structuredClone(notes), balanced = balanceNotes(notes);
  assert.equal(balanced.length, notes.length);
  balanced.forEach((n, i) => {
    assert.equal(n.midi, notes[i].midi); assert.equal(n.start, notes[i].start); assert.equal(n.duration, notes[i].duration);
    assert.ok(n.velocity > 0 && n.velocity <= notes[i].velocity);
  });
  assert.equal(balanced[0].velocity, notes[0].velocity);
  assert.equal(balanced[1].velocity, notes[1].velocity * 0.32);
  assert.equal(balanced[2].velocity, notes[2].velocity * 0.32);
  assert.equal(balanced[3].velocity, notes[3].velocity);
  assert.deepEqual(notes, original);
});

test('separate melody attacks, equal-strength chords and short crossings retain their level', () => {
  for (const notes of [
    [note(60, 0, 0.3), note(60, 0.3, 0.3), note(64, 1, 0.4)],
    [note(60, 0, 1), note(64, 0, 1)],
    [note(60, 0, 1), note(79, 0.4, 0.1, 0.9)],
  ]) assert.deepEqual(balanceNotes(notes), notes);
  assert.deepEqual(balanceNotes([]), []);
});

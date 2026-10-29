import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribe, decodeNotes } from '../src/transcription.ts';
import { createInstrument, demoProject, parseProject, cloneProject } from '../src/model.ts';

test('polyphonic decoding preserves chords, repeated attacks and note timing', () => {
  const frames = Array.from({ length: 100 }, () => Array(88).fill(0));
  const onsets = Array.from({ length: 100 }, () => Array(88).fill(0));
  for (const [pitch, from, to] of [[60, 10, 35], [64, 10, 35], [60, 50, 75], [28, 10, 35]]) {
    for (let i = from; i < to; i++) frames[i][pitch - 21] = 0.8;
    onsets[from][pitch - 21] = 0.9;
  }
  const notes = decodeNotes(frames, onsets, 1.1);
  assert.equal(notes.filter(n => n.midi === 60).length, 2);
  assert.equal(notes.filter(n => n.midi === 64).length, 1);
  assert.ok(notes.every(n => n.midi >= 36 && n.duration >= 0.08 && n.start + n.duration <= 1.1));
  const first = notes.find(n => n.midi === 60)!;
  assert.ok(Math.abs(first.start - 10 * 256 / 22050) < 0.02);
  assert.ok(notes.some(n => n.midi === 64 && Math.abs(n.start - first.start) < 0.02));
  assert.deepEqual(decodeNotes([], [], 1), []);
});

test('transcription rejects invalid PCM before model loading', async () => {
  for (const [pcm, rate] of [[new Float32Array(1), 8000], [new Float32Array([NaN]), 22050], [new Float32Array(), 22050]] as const) {
    await assert.rejects(transcribe(pcm, rate, 'unused-model'), /Invalid audio/);
  }
});

test('88-key chords round trip, undo copies are independent and invalid pitches are rejected', () => {
  const p = demoProject(), item = createInstrument('piano', 4);
  item.source.chords = Array.from({ length: 16 }, () => []);
  item.source.chords[0] = [21, 60, 64, 67, 108];
  p.sources.push(item.source); p.tracks.push(item.track);
  const restored = parseProject(JSON.stringify(p));
  assert.deepEqual(restored.sources.at(-1)!.chords, item.source.chords);
  cloneProject(p).sources.at(-1)!.chords![0].push(70);
  assert.equal(item.source.chords[0].length, 5);
  for (const pitches of [[20], [109], [60.5], [60, 60]]) {
    item.source.chords[0] = pitches;
    assert.throws(() => parseProject(JSON.stringify(p)));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { audible, createTrack, demoProject, duration, encodeWav, parseProject, maxBars } from '../src/model.ts';
import { synthesize } from '../src/synthesis.ts';

test('demo round trips with independent patterns and valid duration', () => {
  const project = demoProject();
  assert.deepEqual(parseProject(JSON.stringify(project)), project);
  assert.equal(duration(project), 8 * 4 * 60 / 112);
  project.tracks[0].steps[0][0] = false;
  assert.equal(project.tracks[1].steps[0][0], true);
});

test('untrusted projects reject broken structure, duplicate IDs and hostile values', () => {
  for (const mutate of [
    (p: any) => p.bpm = 0, (p: any) => p.bars = 1.5,
    (p: any) => p.tracks[0].color = 'red;display:none',
    (p: any) => p.tracks[0].effects.delay = 9,
    (p: any) => p.tracks[0].steps[0] = [true],
    (p: any) => p.tracks[0].notes[0] = 0.5,
    (p: any) => p.tracks[1].id = p.tracks[0].id,
    (p: any) => p.tracks[0].id = '\" onmouseover=\"alert(1)',
    (p: any) => p.tracks[0].offset = 127,
    (p: any) => p.tracks[0].kind = 'unknown',
    (p: any) => p.tracks[0].trim = -1,
    (p: any) => { p.tracks[0].kind = 'audio'; p.tracks[0].audio = 'file:///etc/passwd'; },
  ]) {
    const project = demoProject(); mutate(project);
    assert.throws(() => parseProject(JSON.stringify(project)));
  }
  assert.throws(() => parseProject('null'));
  assert.throws(() => parseProject('{'));
});

test('solo respects mute and mutes other tracks', () => {
  const tracks = [createTrack('bass', 0), createTrack('keys', 1)];
  assert.equal(audible(tracks, tracks[0]), true);
  tracks[1].solo = true;
  assert.equal(audible(tracks, tracks[0]), false);
  assert.equal(audible(tracks, tracks[1]), true);
  tracks[1].muted = true;
  assert.equal(audible(tracks, tracks[1]), false);
});

test('full-song arrangements round trip and stay within the rendering duration limit', () => {
  const p = demoProject(); p.bars = 160;
  assert.equal(parseProject(JSON.stringify(p)).bars, 160);
  assert.ok(maxBars(40) * 4 * 60 / 40 <= 612);
  p.bars = maxBars(p.bpm) + 1;
  assert.throws(() => parseProject(JSON.stringify(p)));
});

test('WAV has correct stereo headers, interleaving, clipping and finite samples', () => {
  const bytes = encodeWav([new Float32Array([-2, 0, 2]), new Float32Array([0.5, NaN, -0.5])], 44100);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint32(40, true), 12);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 16384);
  assert.equal(view.getInt16(50, true), 0);
  assert.equal(view.getInt16(52, true), 32767);
  assert.throws(() => encodeWav([], 44100));
  assert.throws(() => encodeWav([new Float32Array(2), new Float32Array(1)], 44100));
});

test('synthesized patterns produce repeatable finite audio and honor empty notes/steps', () => {
  for (const kind of ['drums', 'bass', 'keys', 'pad'] as const) {
    const track = createTrack(kind, 0);
    const samples = synthesize(track, 120, 1, 8000);
    assert.equal(samples.length, 16000);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(samples.some(sample => Math.abs(sample) > 0.01));
    assert.deepEqual(synthesize(track, 120, 1, 8000), samples);
    if (kind !== 'pad') {
      track.notes.fill(-1); track.steps.forEach(row => row.fill(false));
      assert.ok(synthesize(track, 120, 1, 8000).every(sample => sample === 0));
    }
  }
});

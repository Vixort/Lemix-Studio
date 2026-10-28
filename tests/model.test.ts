import test from 'node:test';
import assert from 'node:assert/strict';
import { audible, createSource, createInstrument, createClip, cloneProject, demoProject, duration, encodeWav, parseProject, maxBars } from '../src/model.ts';
import { synthesize } from '../src/synthesis.ts';

test('demo round trips with independent patterns and valid duration', () => {
  const project = demoProject();
  assert.deepEqual(parseProject(JSON.stringify(project)), project);
  assert.equal(duration(project), 8 * 4 * 60 / 112);
  project.sources[0].steps[0][0] = false;
  assert.equal(project.sources[1].steps[0][0], true);
});

test('legacy projects preserve source audio, timing, channel effects and mute when migrated', () => {
  const p = demoProject();
  const legacy = { ...p, version: 1, sources: undefined, tracks: p.tracks.map((t, i) => ({ ...p.sources[i], ...t, clips: undefined, offset: 2, trim: 0.3, rate: 1.25, reverse: true })) };
  legacy.tracks[0].muted = true;
  const migrated = parseProject(JSON.stringify(legacy));
  assert.equal(migrated.version, 2); assert.equal(migrated.sources.length, 4);
  const c = migrated.tracks[0].clips[0];
  assert.equal(c.offset, 2); assert.equal(c.trim, 0.3); assert.equal(c.rate, 1.25); assert.equal(c.reverse, true);
  assert.equal(c.length, null); assert.equal(c.effects.cutoff, 20000);
  assert.deepEqual(migrated.tracks[0].effects, p.tracks[0].effects);
  assert.equal(migrated.tracks[0].muted, true);
  assert.deepEqual(migrated.sources[0].steps, p.sources[0].steps);
});

test('clip and source references are validated and history does not share mutable FX or patterns', () => {
  const p = demoProject(); const copy = cloneProject(p);
  copy.tracks[0].clips[0].effects.low = 4; copy.sources[0].steps[0][0] = false;
  assert.equal(p.tracks[0].clips[0].effects.low, 0); assert.equal(p.sources[0].steps[0][0], true);
  for (const mutate of [
    (p: any) => p.tracks[0].clips[0].sourceId = crypto.randomUUID(),
    (p: any) => p.tracks[0].clips[0].length = -1,
    (p: any) => p.tracks[0].clips[0].gain = 99,
    (p: any) => p.tracks[1].clips[0].id = p.tracks[0].clips[0].id,
    (p: any) => p.sources[1].id = p.sources[0].id,
    (p: any) => p.tracks[0].clips = null,
  ]) { const broken = demoProject(); mutate(broken); assert.throws(() => parseProject(JSON.stringify(broken))); }
});

test('untrusted projects reject broken structure, duplicate IDs and hostile values', () => {
  for (const mutate of [
    (p: any) => p.bpm = 0, (p: any) => p.bars = 1.5,
    (p: any) => p.tracks[0].color = 'red;display:none',
    (p: any) => p.tracks[0].effects.delay = 9,
    (p: any) => p.sources[0].steps[0] = [true],
    (p: any) => p.sources[0].notes[0] = 0.5,
    (p: any) => p.tracks[1].id = p.tracks[0].id,
    (p: any) => p.tracks[0].id = '\" onmouseover=\"alert(1)',
    (p: any) => p.tracks[0].clips[0].offset = 127,
    (p: any) => p.sources[0].kind = 'unknown',
    (p: any) => p.tracks[0].clips[0].trim = -1,
    (p: any) => { p.sources[0].kind = 'audio'; p.sources[0].audio = 'file:///etc/passwd'; },
  ]) {
    const project = demoProject(); mutate(project);
    assert.throws(() => parseProject(JSON.stringify(project)));
  }
  assert.throws(() => parseProject('null'));
  assert.throws(() => parseProject('{'));
});

test('solo respects mute and mutes other tracks', () => {
  const tracks = [createInstrument('bass', 0).track, createInstrument('keys', 1).track];
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

test('long slowed-down clips and late synth trims remain saveable; clip limits reject overflow', () => {
  const p = demoProject(); p.bpm = 40; p.bars = maxBars(p.bpm);
  const c = p.tracks[0].clips[0]; c.rate = 0.5; c.length = 1224;
  assert.equal(parseProject(JSON.stringify(p)).tracks[0].clips[0].length, 1224);
  c.trim = 611; c.length = 2;
  assert.equal(parseProject(JSON.stringify(p)).tracks[0].clips[0].trim, 611);
  p.tracks.forEach(t => { t.clips = []; });
  p.tracks[0].clips = Array.from({ length: 512 }, () => createClip(p.sources[0]));
  assert.equal(parseProject(JSON.stringify(p)).tracks[0].clips.length, 512);
  p.tracks[0].clips.push(createClip(p.sources[0]));
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
    const track = createSource(kind);
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

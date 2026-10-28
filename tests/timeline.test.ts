import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneProject, demoProject, createLayer, pruneSources } from '../src/model.ts';
import { clipDuration, layoutClips, moveClip, snapBeat, splitClip, trimClip } from '../src/timeline.ts';

test('split is non-destructive and preserves rate, reverse, source and independent clip FX', () => {
  const p = demoProject(); const t = p.tracks[0]; const c = t.clips[0];
  c.offset = 4; c.trim = 1; c.rate = 2; c.reverse = true; c.effects.delay = 0.3;
  const right = splitClip(t,c,4,120,13)!;
  assert.equal(c.length,2); assert.equal(right.offset,8); assert.equal(right.trim,5); assert.equal(right.length,4);
  assert.equal(right.sourceId,c.sourceId); assert.equal(right.rate,2); assert.equal(right.reverse,true);
  right.effects.delay=0; assert.equal(c.effects.delay,0.3); assert.equal(p.sources.length,4);
  assert.equal(splitClip(t,c,2,120,13),undefined);
});

test('trim handles keep the opposite edge, account for speed and can restore hidden source audio', () => {
  const c=demoProject().tracks[0].clips[0]; c.offset=4; c.trim=2; c.rate=2; c.length=4;
  trimClip(c,'left',6,120,20);
  assert.equal(c.offset,6); assert.equal(c.trim,4); assert.equal(c.length,3);
  trimClip(c,'left',2,120,20);
  assert.equal(c.offset,2); assert.equal(c.trim,0); assert.equal(c.length,5);
  trimClip(c,'right',100,120,20); assert.equal(c.length,10);
  trimClip(c,'right',0,120,20); assert.equal(c.length,0.01);
});

test('moving across layers retains source and effect settings; deleting one clip retains shared media', () => {
  const p=demoProject(); const from=p.tracks[0]; const c=from.clips[0]; const to=createLayer(4);
  p.tracks.push(to); c.length=2; const right=splitClip(from,c,1,120,20)!;
  const before=cloneProject(p);
  moveClip(p,right,from,to,6.25);
  assert.equal(from.clips.length,1); assert.equal(to.clips[0].sourceId,c.sourceId); assert.equal(to.clips[0].offset,6.25);
  from.clips=[]; pruneSources(p); assert.ok(p.sources.some(s=>s.id===c.sourceId));
  to.clips=[]; pruneSources(p); assert.ok(!p.sources.some(s=>s.id===c.sourceId));
  assert.equal(before.tracks[0].clips.length,2);
});

test('overlapping clips get separate visual rows while adjacent clips share a row', () => {
  const t=demoProject().tracks[0]; const c=t.clips[0]; c.length=2;
  const adjacent={...c,id:crypto.randomUUID(),offset:4}; const overlap={...c,id:crypto.randomUUID(),offset:2};
  t.clips.push(adjacent,overlap); const layout=layoutClips(t,120,()=>10);
  assert.equal(layout.count,2); assert.equal(layout.rows.get(c.id),layout.rows.get(adjacent.id));
  assert.notEqual(layout.rows.get(c.id),layout.rows.get(overlap.id));
  assert.equal(snapBeat(1.31,true),1.25); assert.equal(snapBeat(1.31,false),1.31);
  assert.equal(clipDuration({...c,trim:9,rate:2},10),0.5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPcm } from '../src/cleanup.ts';
import { defaultCleanup, createClip, createSource, demoProject, cloneProject, parseProject } from '../src/model.ts';

test('audio repair bypass is exact, non-destructive and preserves stereo/sample count', () => {
  const left = Float32Array.from({ length: 2000 }, (_, i) => Math.sin(i * 0.1) * 0.2);
  const right = Float32Array.from(left, value => -value); const before = new Float32Array(left);
  const result = cleanPcm([left,right],44100,{ ...defaultCleanup(),enabled:false,noise:1,declick:1 });
  assert.deepEqual(result,[left,right]); assert.deepEqual(left,before); assert.notEqual(result[0],left);
  assert.deepEqual(cleanPcm([left],44100,defaultCleanup()),[left]);
});

test('de-click interpolates isolated spikes and short bursts while preserving a clean tone', () => {
  const clean = Float32Array.from({length:8000},(_,i)=>Math.sin(i/8000*330*2*Math.PI)*0.12);
  const noisy = new Float32Array(clean); noisy[800]+=0.9; for(let i=1600;i<1609;i++)noisy[i]+=0.8;
  const result = cleanPcm([noisy],8000,{...defaultCleanup(),declick:1})[0];
  assert.ok(Math.abs(result[800]-clean[800])<0.02);
  let before=0,after=0;
  for(let i=1595;i<1615;i++){before+=(noisy[i]-clean[i])**2;after+=(result[i]-clean[i])**2;}
  assert.ok(after<before*0.1,`Burst repair ratio ${after/before}`);
  assert.equal(noisy[800],Math.fround(clean[800]+0.9));
  assert.deepEqual(cleanPcm([clean],8000,{...defaultCleanup(),declick:1})[0],clean);
});

test('spectral reduction lowers hiss without muting a tone or changing stereo phase', () => {
  let seed=37;
  const tone = Float32Array.from({length:16000},(_,i)=>i>=4000&&i<12000?Math.sin(i/8000*500*2*Math.PI)*0.25:0);
  const input = Float32Array.from(tone,value=>{seed=(seed*1664525+1013904223)>>>0;return value+(seed/2147483648-1)*0.012;});
  const right=Float32Array.from(input,value=>-value);
  const output=cleanPcm([input,right],8000,{...defaultCleanup(),noise:1,floor:-36});
  let before=0,after=0,projection=0,reference=0,originalError=0,repairedError=0;
  for(let i=1000;i<3000;i++){before+=input[i]**2;after+=output[0][i]**2;}
  assert.ok(after<before*0.2,`Noise energy ratio ${after/before}`);
  for(let i=5000;i<11000;i++){projection+=output[0][i]*tone[i];reference+=tone[i]**2;originalError+=(input[i]-tone[i])**2;repairedError+=(output[0][i]-tone[i])**2;}
  assert.ok(projection/reference>0.9,`Tone gain ${projection/reference}`);
  assert.ok(repairedError<originalError*0.4,`Noise under tone ratio ${repairedError/originalError}`);
  assert.equal(output[0].length,input.length); assert.ok(output[0].every(Number.isFinite));
  assert.ok(output[1].every((value,i)=>Math.abs(value+output[0][i])<1e-7));
});

test('repair settings round trip and clone independently; v2 opens with repair off', () => {
  const p=demoProject(); const c=p.tracks[0].clips[0]; c.cleanup={...defaultCleanup(),noise:0.7,declick:0.8};
  assert.deepEqual(parseProject(JSON.stringify(p)),p);
  const copy=cloneProject(p);copy.tracks[0].clips[0].cleanup!.noise=0;
  assert.equal(c.cleanup.noise,0.7);
  const old={...demoProject(),version:2}; const migrated=parseProject(JSON.stringify(old));
  assert.equal(migrated.version,3); assert.equal(migrated.tracks[0].clips[0].cleanup,undefined);
  assert.throws(()=>parseProject(JSON.stringify({...p,version:'3'})));
  for(const field of ['noise','floor','declick','enabled']){
    const broken=cloneProject(p);(broken.tracks[0].clips[0].cleanup as unknown as Record<string,unknown>)[field]=field==='enabled'?'true':999;
    assert.throws(()=>parseProject(JSON.stringify(broken)));
  }
  const original=createClip(createSource('keys'));assert.equal(original.cleanup,undefined);
});

test('repair rejects malformed PCM and settings instead of producing invalid audio', () => {
  assert.throws(()=>cleanPcm([],44100,defaultCleanup()));
  assert.throws(()=>cleanPcm([new Float32Array([NaN])],44100,defaultCleanup()));
  assert.throws(()=>cleanPcm([new Float32Array(2),new Float32Array(1)],44100,defaultCleanup()));
  assert.throws(()=>cleanPcm([new Float32Array(4)],44100,{...defaultCleanup(),floor:1}));
  assert.throws(()=>cleanPcm([new Float32Array(4000).fill(3e38)],44100,{...defaultCleanup(),noise:1}));
});

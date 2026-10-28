import type { Source } from './model.ts';

export function synthesize(track: Source, bpm: number, bars: number, sampleRate = 44100): Float32Array {
  const beat = 60 / bpm;
  const pcm = new Float32Array(Math.ceil(bars * 4 * beat * sampleRate));
  let seed = 73;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const add = (time: number, length: number, voice: (t: number, progress: number) => number) => {
    const start = Math.round(time * sampleRate);
    const count = Math.min(Math.ceil(length * sampleRate), pcm.length - start);
    for (let i = 0; i < count; i++) pcm[start + i] += voice(i / sampleRate, i / Math.max(1, count - 1));
  };
  const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  for (let bar = 0; bar < bars; bar++) {
    const root = [0, 5, 3, 7][Math.floor(bar / 2) % 4];
    if (track.kind === 'drums') {
      for (let step = 0; step < 16; step++) for (let row = 0; row < 4; row++) {
        if (!track.steps[row][step]) continue;
        const time = (bar * 4 + step / 4) * beat;
        if (row === 0) add(time, 0.4, t => Math.sin(2 * Math.PI * (45 * t + 1.9 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 14) * 0.85);
        if (row === 1) add(time, 0.2, t => (noise() * 0.65 + Math.sin(t * 2 * Math.PI * 175) * 0.3) * Math.exp(-t * 25));
        if (row === 2) { let previous = 0; add(time, 0.065, t => { const n = noise(); const high = n - previous; previous = n; return high * Math.exp(-t * 65) * 0.19; }); }
        if (row === 3) add(time, 0.13, t => noise() * Math.exp(-t * 30) * (0.4 + 0.6 * Math.abs(Math.sin(t * 440))) * 0.35);
      }
    } else if (track.kind === 'pad') {
      for (const interval of [0, 3, 7]) {
        const hz = frequency(48 + root + interval);
        add(bar * 4 * beat, 4 * beat, (t, progress) =>
          (Math.sin(t * hz * 2 * Math.PI) + Math.sin(t * hz * 1.003 * 2 * Math.PI) * 0.45) * Math.sin(Math.PI * progress) ** 0.7 * 0.15);
      }
    } else if (track.kind === 'keys' || track.kind === 'bass') {
      for (let step = 0; step < 16; step++) {
        const note = track.notes[step];
        if (note < 0) continue;
        const hz = frequency((track.kind === 'bass' ? 36 : 60) + root + note);
        add((bar * 4 + step / 4) * beat, beat * (track.kind === 'bass' ? 0.65 : 1.2), (t, progress) => {
          const phase = t * hz * 2 * Math.PI;
          const envelope = Math.min(1, t / 0.008) * (1 - progress) * Math.exp(-t * (track.kind === 'bass' ? 5 : 3));
          return (Math.sin(phase) + Math.sin(phase * 2) * 0.25 + Math.sin(phase * 3) * 0.1) * envelope * 0.65;
        });
      }
    }
  }
  return pcm;
}

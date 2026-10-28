import type { Clip, Project, Track } from './model.ts';
import { cloneClip } from './model.ts';

export const clipDuration = (clip: Clip, sourceSeconds: number) => Math.max(0, Math.min(clip.length ?? Infinity, (sourceSeconds - clip.trim) / clip.rate));
export const snapBeat = (beat: number, snap: boolean) => snap ? Math.round(beat * 4) / 4 : beat;
export const clipCount = (project: Project) => project.tracks.reduce((n, track) => n + track.clips.length, 0);
export function layoutClips(track: Track, bpm: number, sourceDuration: (id: string) => number) {
  const ends: number[] = []; const rows = new Map<string, number>();
  for (const clip of [...track.clips].sort((a, b) => a.offset - b.offset)) {
    const start = clip.offset * 60 / bpm;
    let row = ends.findIndex(end => end <= start + 1e-6);
    if (row < 0) row = ends.length;
    ends[row] = start + clipDuration(clip, sourceDuration(clip.sourceId)); rows.set(clip.id, row);
  }
  return { rows, count: Math.max(1, ends.length) };
}

export function splitClip(track: Track, clip: Clip, seconds: number, bpm: number, sourceSeconds: number): Clip | undefined {
  const left = seconds - clip.offset * 60 / bpm;
  const length = clipDuration(clip, sourceSeconds);
  if (left < 0.01 || length - left < 0.01) return;
  const right = { ...cloneClip(clip), id: crypto.randomUUID(), offset: seconds * bpm / 60, trim: clip.trim + left * clip.rate, length: length - left };
  clip.length = left;
  track.clips.splice(track.clips.indexOf(clip) + 1, 0, right);
  return right;
}

export function trimClip(clip: Clip, side: 'left' | 'right', beat: number, bpm: number, sourceSeconds: number) {
  const start = clip.offset * 60 / bpm;
  const end = start + clipDuration(clip, sourceSeconds);
  const requested = beat * 60 / bpm;
  if (side === 'left') {
    const next = Math.max(0, start - clip.trim / clip.rate, Math.min(end - 0.01, requested));
    clip.trim = Math.max(0, clip.trim + (next - start) * clip.rate);
    clip.offset = next * bpm / 60; clip.length = end - next;
  } else clip.length = Math.max(0.01, Math.min(requested - start, (sourceSeconds - clip.trim) / clip.rate));
}

export function moveClip(project: Project, clip: Clip, from: Track, to: Track, beat: number) {
  if (from !== to) { from.clips = from.clips.filter(c => c.id !== clip.id); to.clips.push(clip); }
  clip.offset = Math.max(0, Math.min(project.bars * 4 - 0.001, beat));
}

export const COLORS = ['#b2a1ff', '#f5b978', '#6bd6bd', '#80b8fc', '#f192b5', '#dfd078'];
export const DRUMS = ['Kick', 'Snare', 'Hi-hat', 'Clap'] as const;
export type TrackKind = 'drums' | 'bass' | 'keys' | 'pad' | 'audio';
export interface Effects {
  low: number; mid: number; high: number; cutoff: number;
  drive: number; reverb: number; delay: number; compression: number;
}
export interface Track {
  id: string; name: string; kind: TrackKind; color: string;
  volume: number; pan: number; muted: boolean; solo: boolean;
  offset: number; trim: number; rate: number; reverse: boolean;
  effects: Effects; steps: boolean[][]; notes: number[];
  audio?: string;
}
export interface Project {
  version: 1; name: string; bpm: number; bars: number;
  master: number; loop: boolean; tracks: Track[];
}

export function createTrack(kind: TrackKind, index: number): Track {
  return {
    id: crypto.randomUUID(), name: ({ drums: 'Drum machine', bass: 'Analog bass', keys: 'Electric keys', pad: 'Ambient pad', audio: 'Audio track' })[kind],
    kind, color: COLORS[index % COLORS.length], volume: 0.65, pan: 0, muted: false, solo: false,
    offset: 0, trim: 0, rate: 1, reverse: false,
    effects: { low: 0, mid: 0, high: 0, cutoff: 18000, drive: 0, reverb: kind === 'pad' ? 0.32 : 0.08, delay: 0, compression: 0.2 },
    steps: DRUMS.map((_, row) => Array.from({ length: 16 }, (__, step) =>
      row === 0 ? step % 4 === 0 : row === 1 ? step % 8 === 4 : row === 2 ? step % 2 === 0 : step === 12)),
    notes: [0, -1, -1, 7, -1, -1, 3, -1, 5, -1, -1, 7, -1, 3, -1, -1],
  };
}

export function demoProject(): Project {
  const tracks = (['drums', 'bass', 'keys', 'pad'] as const).map(createTrack);
  tracks[0].name = 'Dusty drums'; tracks[0].volume = 0.72;
  tracks[1].name = 'Sub motion'; tracks[1].volume = 0.58;
  tracks[2].name = 'Afterglow keys'; tracks[2].volume = 0.44; tracks[2].effects.delay = 0.22;
  tracks[3].name = 'Velvet atmosphere'; tracks[3].volume = 0.28;
  return { version: 1, name: 'Midnight in motion', bpm: 112, bars: 8, master: 0.8, loop: true, tracks };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const numberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function parseProject(text: string): Project {
  if (text.length > 100 * 1024 * 1024) throw new Error('Project exceeds 100 MB.');
  const p: unknown = JSON.parse(text);
  if (!record(p) || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 80 ||
      !numberIn(p.bpm, 40, 240) || !numberIn(p.bars, 1, 32) || !Number.isInteger(p.bars) ||
      !numberIn(p.master, 0, 1) || typeof p.loop !== 'boolean' || !Array.isArray(p.tracks) ||
      p.tracks.length > 24) throw new Error('Unsupported or invalid Lemix project.');
  const ids = new Set<string>();
  for (const t of p.tracks) {
    if (!record(t) || typeof t.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.id) || ids.has(t.id) ||
        typeof t.name !== 'string' || t.name.length > 80 ||
        !['drums', 'bass', 'keys', 'pad', 'audio'].includes(String(t.kind)) ||
        typeof t.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(t.color) ||
        !numberIn(t.volume, 0, 1) || !numberIn(t.pan, -1, 1) ||
        !numberIn(t.offset, 0, p.bars * 4 - 0.25) || !numberIn(t.trim, 0, 600) || !numberIn(t.rate, 0.5, 2) ||
        typeof t.muted !== 'boolean' || typeof t.solo !== 'boolean' || typeof t.reverse !== 'boolean' ||
        !record(t.effects) || !numberIn(t.effects.low, -12, 12) || !numberIn(t.effects.mid, -12, 12) ||
        !numberIn(t.effects.high, -12, 12) || !numberIn(t.effects.cutoff, 100, 20000) ||
        !['drive', 'reverb', 'delay', 'compression'].every(key => numberIn((t.effects as Record<string, unknown>)[key], 0, 1)) ||
        !Array.isArray(t.steps) || t.steps.length !== 4 ||
        !t.steps.every(row => Array.isArray(row) && row.length === 16 && row.every(v => typeof v === 'boolean')) ||
        !Array.isArray(t.notes) || t.notes.length !== 16 || !t.notes.every(n => numberIn(n, -1, 12) && Number.isInteger(n)) ||
        (t.kind === 'audio' && (typeof t.audio !== 'string' || !t.audio.length || t.audio.length % 4 !== 0 || t.audio.length > 34 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(t.audio))) ||
        (t.kind !== 'audio' && t.audio !== undefined)) throw new Error('Project contains an invalid track.');
    ids.add(t.id);
  }
  return p as unknown as Project;
}

export const duration = (project: Project) => project.bars * 4 * 60 / project.bpm;
export const audible = (tracks: Track[], track: Track) => !track.muted && (!tracks.some(t => t.solo) || track.solo);

export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  if (!channels.length || channels.length > 2 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      channels.some(channel => channel.length !== channels[0].length)) throw new Error('Invalid PCM audio.');
  const count = channels.length;
  const frames = channels[0].length;
  const view = new DataView(new ArrayBuffer(44 + frames * count * 2));
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, view.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, count, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * count * 2, true);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < count; channel++) {
    const value = channels[channel][frame];
    const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    view.setInt16(44 + (frame * count + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Uint8Array(view.buffer);
}

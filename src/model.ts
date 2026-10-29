export const COLORS = ['#b2a1ff', '#f5b978', '#6bd6bd', '#80b8fc', '#f192b5', '#dfd078'];
export const DRUMS = ['Kick', 'Snare', 'Hi-hat', 'Clap'] as const;
export const MAX_PROJECT_BYTES = 300 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 108 * 1024 * 1024;
export const maxBars = (bpm: number) => Math.min(600, Math.floor(612 * bpm / 240));
export const INSTRUMENTS = {
  drums: { name: 'Drum machine', description: '16-step rhythm builder', midi: 60, icon: 'drum' },
  bass: { name: 'Analog bass', description: 'Warm · deep · rounded', midi: 36, icon: 'keys' },
  keys: { name: 'Electric keys', description: 'Soft · melodic · mellow', midi: 60, icon: 'keys' },
  pad: { name: 'Ambient pad', description: 'Wide · airy · evolving', midi: 48, icon: 'spark' },
  piano: { name: 'Studio piano', description: 'Bright · expressive · soft decay', midi: 60, icon: 'keys' },
  guitar: { name: 'Nylon guitar', description: 'Plucked · warm · intimate', midi: 48, icon: 'guitar' },
  marimba: { name: 'Wood marimba', description: 'Woody · percussive · bright', midi: 72, icon: 'mallets' },
  organ: { name: 'Drawbar organ', description: 'Round · sustained · rich', midi: 60, icon: 'keys' },
  lead: { name: 'Synth lead', description: 'Bold · bright · cutting', midi: 72, icon: 'wave' },
} as const;
export type TrackKind = keyof typeof INSTRUMENTS | 'audio';
export interface Effects {
  low: number; mid: number; high: number; cutoff: number;
  drive: number; reverb: number; delay: number; compression: number;
}
export interface Source {
  id: string; name: string; kind: TrackKind; steps: boolean[][]; notes: number[];
  audio?: string; chords?: number[][];
}
export interface Cleanup { enabled: boolean; noise: number; floor: number; declick: number }
export const CLEANUP_PRESETS = {
  noise: { name: 'Noise Reduction', description: 'Reduce steady hiss and low-level noise', noise: 0.65, declick: 0 },
  declick: { name: 'Click / Pop Repair', description: 'Repair short clicks and electrical crackle', noise: 0, declick: 0.85 },
  clean: { name: 'Clean Audio', description: 'Noise reduction + click and pop repair', noise: 0.65, declick: 0.85 },
} as const;
export const defaultCleanup = (): Cleanup => ({ enabled: true, noise: 0, floor: -42, declick: 0 });
export interface Clip {
  id: string; sourceId: string; name: string;
  offset: number; trim: number; length: number | null; rate: number; reverse: boolean;
  gain: number; muted: boolean; effects: Effects;
  cleanup?: Cleanup;
}
export interface Track {
  id: string; name: string; color: string;
  volume: number; pan: number; muted: boolean; solo: boolean;
  effects: Effects; clips: Clip[];
}
export interface Project {
  version: 3; name: string; bpm: number; bars: number;
  master: number; loop: boolean; sources: Source[]; tracks: Track[];
}

export const neutralEffects = (): Effects => ({ low: 0, mid: 0, high: 0, cutoff: 20000, drive: 0, reverb: 0, delay: 0, compression: 0 });
export function createLayer(index: number, name = `Audio layer ${index + 1}`): Track {
  return { id: crypto.randomUUID(), name, color: COLORS[index % COLORS.length], volume: 0.65, pan: 0, muted: false, solo: false, effects: { ...neutralEffects(), cutoff: 18000, reverb: 0.08, compression: 0.2 }, clips: [] };
}
export const createClip = (source: Source): Clip => ({ id: crypto.randomUUID(), sourceId: source.id, name: source.name, offset: 0, trim: 0, length: null, rate: 1, reverse: false, gain: 1, muted: false, effects: neutralEffects() });
export function createSource(kind: TrackKind): Source {
  return {
    id: crypto.randomUUID(), name: kind === 'audio' ? 'Audio track' : INSTRUMENTS[kind].name,
    kind,
    steps: DRUMS.map((_, row) => Array.from({ length: 16 }, (__, step) =>
      row === 0 ? step % 4 === 0 : row === 1 ? step % 8 === 4 : row === 2 ? step % 2 === 0 : step === 12)),
    notes: [0, -1, -1, 7, -1, -1, 3, -1, 5, -1, -1, 7, -1, 3, -1, -1],
  };
}

export function createInstrument(kind: TrackKind, index: number) {
  const source = createSource(kind); const track = createLayer(index, source.name);
  track.clips.push(createClip(source));
  if (kind === 'pad') track.effects.reverb = 0.32;
  return { source, track };
}

export function demoProject(): Project {
  const instruments = (['drums', 'bass', 'keys', 'pad'] as const).map(createInstrument);
  const tracks = instruments.map(i => i.track);
  tracks[0].name = 'Dusty drums'; tracks[0].volume = 0.72;
  tracks[1].name = 'Sub motion'; tracks[1].volume = 0.58;
  tracks[2].name = 'Afterglow keys'; tracks[2].volume = 0.44; tracks[2].effects.delay = 0.22;
  tracks[3].name = 'Velvet atmosphere'; tracks[3].volume = 0.28;
  tracks.forEach(t => { t.clips[0].name = t.name; });
  return { version: 3, name: 'Midnight in motion', bpm: 112, bars: 8, master: 0.8, loop: true, sources: instruments.map(i => i.source), tracks };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const numberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const name = (value: unknown): value is string => typeof value === 'string' && value.length <= 80;
function validEffects(fx: unknown) {
  return record(fx) && ['low', 'mid', 'high'].every(key => numberIn(fx[key], -12, 12)) && numberIn(fx.cutoff, 100, 20000) &&
    ['drive', 'reverb', 'delay', 'compression'].every(key => numberIn(fx[key], 0, 1));
}
function validSource(s: Record<string, unknown>) {
  return uuid(s.id) && name(s.name) && typeof s.kind === 'string' && (s.kind === 'audio' || Object.hasOwn(INSTRUMENTS, s.kind)) &&
    Array.isArray(s.steps) && s.steps.length === 4 && s.steps.every(row => Array.isArray(row) && row.length === 16 && row.every(v => typeof v === 'boolean')) &&
    Array.isArray(s.notes) && s.notes.length === 16 && s.notes.every(n => numberIn(n, -1, 36) && Number.isInteger(n)) &&
    (s.chords === undefined || Array.isArray(s.chords) && s.chords.length === 16 && s.chords.every(row => Array.isArray(row) && row.length <= 10 && new Set(row).size === row.length && row.every(n => numberIn(n, 21, 108) && Number.isInteger(n)))) &&
    (s.kind === 'audio' ? typeof s.audio === 'string' && s.audio.length > 0 && s.audio.length % 4 === 0 && s.audio.length <= MAX_AUDIO_BYTES * 4 / 3 && /^[A-Za-z0-9+/]*={0,2}$/.test(s.audio) : s.audio === undefined);
}
function validChannel(t: Record<string, unknown>) {
  return uuid(t.id) && name(t.name) && typeof t.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color) &&
    numberIn(t.volume, 0, 1) && numberIn(t.pan, -1, 1) && typeof t.muted === 'boolean' && typeof t.solo === 'boolean' && validEffects(t.effects);
}

export function parseProject(text: string): Project {
  if (text.length > MAX_PROJECT_BYTES) throw new Error('Project exceeds 300 MB.');
  const p: unknown = JSON.parse(text);
  if (!record(p) || (p.version !== 1 && p.version !== 2 && p.version !== 3) || !name(p.name) ||
      !numberIn(p.bpm, 40, 240) || !numberIn(p.bars, 1, maxBars(p.bpm)) || !Number.isInteger(p.bars) ||
      !numberIn(p.master, 0, 1) || typeof p.loop !== 'boolean' || !Array.isArray(p.tracks) ||
      p.tracks.length > 24) throw new Error('Unsupported or invalid Lemix project.');
  if (p.version === 1) {
    const sources: Source[] = []; const tracks: Track[] = [];
    for (const t of p.tracks) {
      if (!record(t) || !validChannel(t) || !validSource(t) || !numberIn(t.offset, 0, p.bars * 4 - 0.25) ||
          !numberIn(t.trim, 0, 600) || !numberIn(t.rate, 0.5, 2) || typeof t.reverse !== 'boolean') throw new Error('Invalid legacy track.');
      const source = { id: t.id, name: t.name, kind: t.kind, steps: t.steps, notes: t.notes, ...(t.audio === undefined ? {} : { audio: t.audio }) } as Source;
      sources.push(source);
      tracks.push({ id: t.id, name: t.name, color: t.color, volume: t.volume, pan: t.pan, muted: t.muted, solo: t.solo, effects: t.effects,
        clips: [{ ...createClip(source), offset: t.offset, trim: t.trim, rate: t.rate, reverse: t.reverse }] } as Track);
    }
    return parseProject(JSON.stringify({ ...p, version: 2, sources, tracks }));
  }
  if ((p.version !== 2 && p.version !== 3) || !Array.isArray(p.sources) || p.sources.length > 128) throw new Error('Invalid project sources.');
  const sourceIds = new Set<string>(); const trackIds = new Set<string>(); const clipIds = new Set<string>();
  for (const s of p.sources) {
    if (!record(s) || !validSource(s) || sourceIds.has(s.id as string)) throw new Error('Project contains an invalid source.');
    sourceIds.add(s.id as string);
  }
  for (const t of p.tracks) {
    if (!record(t) || !validChannel(t) || trackIds.has(t.id as string) || !Array.isArray(t.clips)) throw new Error('Project contains an invalid layer.');
    trackIds.add(t.id as string);
    for (const c of t.clips) {
      if (!record(c) || !uuid(c.id) || clipIds.has(c.id) || !sourceIds.has(String(c.sourceId)) || !name(c.name) ||
          !numberIn(c.offset, 0, p.bars * 4) || c.offset >= p.bars * 4 || !numberIn(c.trim, 0, 612) ||
          !(c.length === null || numberIn(c.length, 0.01, 1225)) || !numberIn(c.rate, 0.5, 2) ||
          typeof c.reverse !== 'boolean' || typeof c.muted !== 'boolean' || !numberIn(c.gain, 0, 2) || !validEffects(c.effects)) throw new Error('Project contains an invalid clip.');
      clipIds.add(c.id);
      if (c.cleanup !== undefined && (!record(c.cleanup) || typeof c.cleanup.enabled !== 'boolean' || !numberIn(c.cleanup.noise, 0, 1) || !numberIn(c.cleanup.floor, -80, -12) || !numberIn(c.cleanup.declick, 0, 1))) throw new Error('Invalid audio repair settings.');
      if (clipIds.size > 512) throw new Error('Maximum 512 clips per project.');
    }
  }
  p.version = 3;
  return p as unknown as Project;
}

export const duration = (project: Project) => project.bars * 4 * 60 / project.bpm;
export const audible = (tracks: Track[], track: Track) => !track.muted && (!tracks.some(t => t.solo) || track.solo);
export const cloneClip = (clip: Clip): Clip => ({ ...clip, effects: { ...clip.effects }, ...(clip.cleanup ? { cleanup: { ...clip.cleanup } } : {}) });
export const cloneProject = (p: Project): Project => ({ ...p,
  sources: p.sources.map(s => ({ ...s, steps: s.steps.map(row => [...row]), notes: [...s.notes], ...(s.chords ? { chords: s.chords.map(row => [...row]) } : {}) })),
  tracks: p.tracks.map(t => ({ ...t, effects: { ...t.effects }, clips: t.clips.map(cloneClip) })),
});
export function pruneSources(p: Project) {
  const used = new Set(p.tracks.flatMap(t => t.clips.map(c => c.sourceId)));
  p.sources = p.sources.filter(s => used.has(s.id));
}

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

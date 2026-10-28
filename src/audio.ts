import { audible, duration, encodeWav } from './model.ts';
import type { Clip, Effects, Project, Source } from './model.ts';
import { synthesize } from './synthesis.ts';
import { clipDuration } from './timeline.ts';
import { repairBuffer } from './cleanup-client.ts';

interface Mix { volume: number; pan: number; effects: Effects }

interface Chain {
  input: GainNode; volume: GainNode; pan: StereoPannerNode;
  low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; cutoff: BiquadFilterNode;
  drive: WaveShaperNode; compressor: DynamicsCompressorNode;
  wet: GainNode; delayWet: GainNode; echo: DelayNode;
}

function impulse(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(2, Math.floor(context.sampleRate * 1.6), context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = 313 + channel;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 2147483648 - 1) * (1 - i / data.length) ** 2.5;
    }
  }
  return buffer;
}

function setMix(chain: Chain, track: Mix, project: Project) {
  const fx = track.effects;
  chain.volume.gain.value = track.volume;
  chain.pan.pan.value = track.pan;
  chain.low.gain.value = fx.low; chain.mid.gain.value = fx.mid; chain.high.gain.value = fx.high;
  chain.cutoff.frequency.value = fx.cutoff;
  chain.wet.gain.value = fx.reverb * 0.65; chain.delayWet.gain.value = fx.delay * 0.55;
  chain.echo.delayTime.value = 60 / project.bpm * 0.75;
  chain.compressor.threshold.value = -6 - fx.compression * 30;
  chain.compressor.ratio.value = 1 + fx.compression * 7;
  if (fx.drive === 0) chain.drive.curve = null;
  else {
    const curve = new Float32Array(1024);
    const amount = 1 + fx.drive * 12;
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i * 2 / (curve.length - 1) - 1) * amount) / Math.tanh(amount);
    chain.drive.curve = curve;
  }
}

function createChain(context: BaseAudioContext, output: AudioNode, room: AudioBuffer, track: Mix, project: Project): Chain {
  const input = context.createGain();
  const low = context.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
  const mid = context.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.7;
  const high = context.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5000;
  const cutoff = context.createBiquadFilter(); cutoff.type = 'lowpass'; cutoff.Q.value = 0.5;
  const drive = context.createWaveShaper(); drive.oversample = '2x';
  const compressor = context.createDynamicsCompressor(); compressor.attack.value = 0.008; compressor.release.value = 0.16;
  const volume = context.createGain(); const pan = context.createStereoPanner();
  input.connect(low).connect(mid).connect(high).connect(cutoff).connect(drive).connect(compressor);
  compressor.connect(volume);
  const convolver = context.createConvolver(); convolver.buffer = room;
  const wet = context.createGain(); compressor.connect(convolver).connect(wet).connect(volume);
  const echo = context.createDelay(2); const delayWet = context.createGain();
  compressor.connect(echo).connect(delayWet).connect(volume);
  volume.connect(pan).connect(output);
  const chain = { input, volume, pan, low, mid, high, cutoff, drive, compressor, wet, delayWet, echo };
  setMix(chain, track, project);
  return chain;
}

export class AudioEngine {
  context = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
  analyser = this.context.createAnalyser();
  master = this.context.createGain();
  playing = false;
  preparing = false;
  private startedAt = 0;
  private cursor = 0;
  private nextCycle = 0;
  private timer?: ReturnType<typeof setInterval>;
  private sources = new Set<AudioBufferSourceNode>();
  private chains = new Map<string, Chain>();
  private clipChains = new Map<string, Chain>();
  private cache = new Map<string, { signature: string; audio?: string; buffer: AudioBuffer }>();
  private currentProject?: Project;
  private preparation?: AbortController;
  private cleanupCache = new Map<string, { original: AudioBuffer; repaired: AudioBuffer }>();
  private generation = 0;
  onEnded = () => {};

  constructor() {
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.1;
    this.analyser.fftSize = 256;
    this.master.connect(limiter).connect(this.analyser).connect(this.context.destination);
  }

  async buffer(track: Source, project: Project, reverse = false): Promise<AudioBuffer> {
    const key = `${track.id}:${reverse}`;
    const signature = JSON.stringify(track.kind === 'audio' ? [track.kind, reverse] : [track.kind, project.bpm, project.bars, track.steps, track.notes, reverse]);
    const cached = this.cache.get(key);
    if (cached?.signature === signature && cached.audio === track.audio) return cached.buffer;
    let buffer: AudioBuffer;
    if (track.kind === 'audio' && track.audio) {
      const binary = atob(track.audio);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      buffer = await this.context.decodeAudioData(bytes.buffer);
      if (buffer.duration > 600) throw new Error('Audio is longer than 10 minutes. Trim it before importing.');
    } else {
      const pcm = synthesize(track, project.bpm, project.bars, this.context.sampleRate);
      buffer = this.context.createBuffer(1, pcm.length, this.context.sampleRate);
      buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    }
    if (reverse) for (let ch = 0; ch < buffer.numberOfChannels; ch++) buffer.getChannelData(ch).reverse();
    this.cache.set(key, { signature, audio: track.audio, buffer });
    return buffer;
  }

  async prepare(project: Project) {
    const ids = new Set(project.sources.map(s => s.id));
    for (const key of this.cache.keys()) if (!ids.has(key.split(':')[0])) this.cache.delete(key);
    for (const key of this.cleanupCache.keys()) if (!ids.has(key.split(':')[0])) this.cleanupCache.delete(key);
    const buffers = new Map<string, AudioBuffer>();
    for (const track of project.tracks) for (const clip of track.clips) {
      const key = `${clip.sourceId}:${clip.reverse}`;
      if (!buffers.has(key)) buffers.set(key, await this.buffer(project.sources.find(s => s.id === clip.sourceId)!, project, clip.reverse));
    }
    return buffers;
  }

  private async prepareClips(project: Project, raw: Map<string, AudioBuffer>, signal?: AbortSignal) {
    const result = new Map<string, AudioBuffer>(); const prepared = new Map<string, AudioBuffer>();
    for (const track of project.tracks) for (const clip of track.clips) {
      signal?.throwIfAborted();
      const buffer = raw.get(`${clip.sourceId}:${clip.reverse}`)!;
      const settings = clip.cleanup;
      if (!settings?.enabled || !settings.noise && !settings.declick || clip.muted || !audible(project.tracks, track)) { result.set(clip.id, buffer); continue; }
      const key = `${clip.sourceId}:${clip.reverse}:${settings.noise}:${settings.floor}:${settings.declick}`;
      const cached = this.cleanupCache.get(key);
      let repaired = prepared.get(key) ?? (cached?.original === buffer ? cached.repaired : undefined);
      if (!repaired) {
        repaired = await repairBuffer(buffer, settings, this.context, signal);
        this.cleanupCache.set(key, { original: buffer, repaired });
        if (this.cleanupCache.size > 2) this.cleanupCache.delete(this.cleanupCache.keys().next().value!);
      }
      prepared.set(key, repaired); result.set(clip.id, repaired);
    }
    return result;
  }

  private schedule(context: BaseAudioContext, track: Clip, buffer: AudioBuffer, input: AudioNode, project: Project, when: number, cursor: number) {
    if (track.muted) return;
    const offset = track.offset * 60 / project.bpm;
    const delay = Math.max(0, offset - cursor);
    const position = track.trim + Math.max(0, cursor - offset) * track.rate;
    const length = Math.min(clipDuration(track, buffer.duration) - Math.max(0, cursor - offset), duration(project) - cursor - delay);
    if (length <= 0) return;
    const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = track.rate;
    const fade = context.createGain();
    const start = when + delay;
    const ramp = Math.min(0.008, length / 3);
    fade.gain.setValueAtTime(0, start); fade.gain.linearRampToValueAtTime(track.gain, start + ramp);
    fade.gain.setValueAtTime(track.gain, start + length - ramp); fade.gain.linearRampToValueAtTime(0, start + length);
    source.connect(fade).connect(input); source.start(start, position, length * track.rate);
    source.stop(start + length);
    if (context === this.context) {
      this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); fade.disconnect(); };
    }
  }

  private buildTracks(context: BaseAudioContext, master: AudioNode, project: Project, store = false) {
    const room = impulse(context);
    const inputs = new Map<string, AudioNode>();
    for (const track of project.tracks) {
      const chain = createChain(context, master, room, { ...track, volume: audible(project.tracks, track) ? track.volume : 0 }, project);
      if (store) this.chains.set(track.id, chain);
      for (const clip of track.clips) {
        const fx = clip.effects;
        if (fx.low || fx.mid || fx.high || fx.cutoff < 20000 || fx.drive || fx.reverb || fx.delay || fx.compression) {
          const clipChain = createChain(context, chain.input, room, { volume: 1, pan: 0, effects: fx }, project);
          if (store) this.clipChains.set(clip.id, clipChain);
          inputs.set(clip.id, clipChain.input);
        } else inputs.set(clip.id, chain.input);
      }
    }
    return inputs;
  }

  private scheduleProject(context: BaseAudioContext, project: Project, buffers: Map<string, AudioBuffer>, inputs: Map<string, AudioNode>, when: number, cursor: number) {
    for (const track of project.tracks) for (const clip of track.clips) this.schedule(context, clip, buffers.get(clip.id)!, inputs.get(clip.id)!, project, when, cursor);
  }

  async play(project: Project, cursor: number) {
    this.stop();
    const generation = this.generation;
    const controller = new AbortController(); this.preparation = controller;
    this.preparing = true;
    this.cursor = cursor >= duration(project) ? 0 : cursor;
    try {
      await this.context.resume();
      const buffers = await this.prepareClips(project, await this.prepare(project), controller.signal);
      if (generation !== this.generation) return;
      this.currentProject = project; this.cursor = cursor >= duration(project) ? 0 : cursor;
      this.startedAt = this.context.currentTime + 0.04; this.playing = true;
      this.master.gain.value = project.master;
      const inputs = this.buildTracks(this.context, this.master, project, true);
      this.scheduleProject(this.context, project, buffers, inputs, this.startedAt, this.cursor);
      this.nextCycle = this.startedAt + duration(project) - this.cursor;
      this.timer = setInterval(() => {
        if (project.loop && this.context.currentTime + 0.2 >= this.nextCycle) {
          this.scheduleProject(this.context, project, buffers, inputs, this.nextCycle, 0);
          this.nextCycle += duration(project);
        } else if (!project.loop && this.context.currentTime >= this.nextCycle) {
          this.stop(); this.onEnded();
        }
      }, 50);
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { if (generation === this.generation) this.preparing = false; }
  }

  position(): number {
    if (!this.playing || !this.currentProject) return this.cursor;
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt) + this.cursor;
    return this.currentProject.loop ? elapsed % duration(this.currentProject) : Math.min(elapsed, duration(this.currentProject));
  }

  updateMix(project: Project) {
    this.master.gain.setTargetAtTime(project.master, this.context.currentTime, 0.015);
    for (const track of project.tracks) { const chain = this.chains.get(track.id); if (chain) setMix(chain, { ...track, volume: audible(project.tracks, track) ? track.volume : 0 }, project); }
  }

  stop() {
    this.generation++;
    this.preparation?.abort(new DOMException('Audio preparation canceled.', 'AbortError')); this.preparing = false;
    if (this.playing) this.cursor = this.position();
    this.playing = false; clearInterval(this.timer);
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear();
    for (const chain of [...this.chains.values(), ...this.clipChains.values()]) {
      chain.input.disconnect(); chain.pan.disconnect();
    }
    this.chains.clear(); this.clipChains.clear();
  }

  async export(project: Project): Promise<Uint8Array> {
    const buffers = await this.prepareClips(project, await this.prepare(project));
    const context = new OfflineAudioContext(2, Math.ceil((duration(project) + 2) * 44100), 44100);
    const master = context.createGain(); master.gain.value = project.master;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.1;
    master.connect(limiter).connect(context.destination);
    const inputs = this.buildTracks(context, master, project);
    this.scheduleProject(context, project, buffers, inputs, 0, 0);
    const rendered = await context.startRendering();
    return encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], rendered.sampleRate);
  }
}

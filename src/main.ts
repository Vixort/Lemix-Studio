import './style.css';
import { AudioEngine } from './audio.ts';
import { COLORS, DRUMS, createTrack, demoProject, duration, parseProject } from './model.ts';
import type { Effects, Project, Track, TrackKind } from './model.ts';
import { icon } from './icons.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const engine = new AudioEngine();
let project = demoProject();
let selected = project.tracks[0].id;
let tab: 'pattern' | 'mixer' = 'pattern';
let cursor = 0;
let zoom = 1;
let dirty = false;
let busy = false;
let editing = false;
let revision = 0;
let restartTimer: ReturnType<typeof setTimeout>;
const history: Project[] = [];
const future: Project[] = [];
const esc = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const clone = (p: Project): Project => ({ ...p, tracks: p.tracks.map(t => ({ ...t, effects: { ...t.effects }, steps: t.steps.map(row => [...row]), notes: [...t.notes] })) });
const track = () => project.tracks.find(t => t.id === selected);
const kindIcon = (kind: TrackKind) => kind === 'drums' ? 'drum' : kind === 'audio' ? 'wave' : 'keys';
const button = (action: string, symbol: string, label: string, extra = '') => `<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}" ${extra}>${icon(symbol)}</button>`;
const format = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

function checkpoint() {
  history.push(clone(project)); if (history.length > 24) history.shift(); future.length = 0;
}

function changed(rebuild = false) {
  dirty = true;
  document.title = `• ${project.name} — Lemix Studio`;
  document.querySelector('#save-state')!.textContent = 'Unsaved changes';
  engine.updateMix(project);
  if (rebuild && engine.playing) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { cursor = engine.position(); void play(); }, 120);
  }
}

function edit(change: () => void, rebuild = false) {
  checkpoint(); change(); changed(rebuild); render();
}

function notify(message: string, error = false) {
  const toast = document.querySelector<HTMLDivElement>('#toast')!;
  toast.textContent = message; toast.className = `toast visible ${error ? 'error' : ''}`;
  setTimeout(() => { if (toast.textContent === message) toast.classList.remove('visible'); }, 5000);
}

async function task(work: () => Promise<void>) {
  if (busy) return;
  busy = true; document.body.classList.add('busy');
  try { await work(); } catch (error) { notify(error instanceof Error ? error.message : 'Something went wrong.', true); }
  finally { busy = false; document.body.classList.remove('busy'); }
}

function slider(label: string, key: string, value: number, min: number, max: number, step: number, display: string, color = '') {
  return `<label class="control ${color}"><span>${label}<output>${display}</output></span><input aria-label="${label}" data-control="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" /></label>`;
}

function render() {
  editing = false;
  const t = track();
  const scroll = document.querySelector('.arranger-scroll')?.scrollLeft ?? 0;
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" aria-label="Lemix Studio">${icon('wave')}<span>lemix<span class="brand-dot">.</span></span><small>STUDIO</small></a>
      <div class="project-heading"><input id="project-name" aria-label="Project name" maxlength="80" value="${esc(project.name)}" /><span><i class="status-dot"></i><span id="save-state">${dirty ? 'Unsaved changes' : 'Ready to create'}</span></span></div>
      <div class="top-actions">${button('new', 'plus', 'New project')}${button('open', 'folder', 'Open project (Ctrl+O)')}${button('save', 'save', 'Save project (Ctrl+S)')}<span class="divider"></span>${button('undo', 'undo', 'Undo (Ctrl+Z)', history.length ? '' : 'disabled')}${button('redo', 'redo', 'Redo (Ctrl+Shift+Z)', future.length ? '' : 'disabled')}<button class="export-button" data-action="export">${icon('export')} Export WAV</button></div>
    </header>
    <div class="studio">
      <aside class="browser">
        <div class="section-title">YOUR WORKSPACE <span class="shortcut">⌘</span></div>
        <button class="nav-item active" data-action="arrangement">${icon('sliders')} Arrangement <span>01</span></button>
        <button class="nav-item" data-action="mixer">${icon('headphones')} Mixer <span>${project.tracks.length}</span></button>
        <div class="browser-title">SOUND LIBRARY <span class="pill">BUILT-IN</span></div>
        <label class="search">${icon('search')}<input id="search" placeholder="Find your sound…" aria-label="Search instruments" /></label>
        <div class="library">
          ${([['drums', 'Drum machine', '16-step rhythm builder', '01'], ['bass', 'Analog bass', 'Warm · deep · rounded', '02'], ['keys', 'Electric keys', 'Soft · melodic · mellow', '03'], ['pad', 'Ambient pad', 'Wide · airy · evolving', '04']] as const).map(([kind, name, description, number], i) => `<button class="sound-card" data-add="${kind}" data-search="${name.toLowerCase()}" style="--accent:${COLORS[i]}"><span class="sound-art">${icon(kindIcon(kind))}</span><span><strong>${name}</strong><small>${description}</small></span><span class="sound-add">+</span><span class="sound-number">${number}</span></button>`).join('')}
        </div>
        <button class="import-area" data-action="import">${icon('import')}<strong>Bring your own sound</strong><span>Import WAV, MP3, OGG or FLAC</span><small>or drop an audio file anywhere</small></button>
        <div class="browser-bottom"><span class="online-dot"></span> ALL LOCAL. ALL YOURS.<p>No cloud. Just your creativity.</p></div>
      </aside>
      <main>
        <div class="workspace-heading"><div><span class="eyebrow">LET THE IDEAS FLOW</span><h1>Your next late-night masterpiece<span>.</span></h1></div>${button('help', 'help', 'Shortcuts and help')}</div>
        <section class="transport" aria-label="Transport">
          <div class="transport-buttons">${button('stop', 'stop', 'Stop and return to start')}<button class="play-button ${engine.playing ? 'playing' : ''}" data-action="play" aria-label="${engine.playing ? 'Pause' : 'Play'}" title="Play / pause (Space)">${icon(engine.playing ? 'pause' : 'play')}</button>${button('loop', 'loop', 'Loop arrangement', `aria-pressed="${project.loop}"`)}</div>
          <div class="time-display"><strong id="time">${format(cursor)}</strong><span id="beat-position">BAR 01 · BEAT 1</span></div>
          <label class="tempo"><input id="bpm" type="number" aria-label="Tempo BPM" min="40" max="240" value="${project.bpm}" /><span>BPM</span></label>
          <div class="signature"><strong>4 / 4</strong><span>TIME SIGNATURE</span></div>
          <label class="length"><select id="bars" aria-label="Arrangement length">${Array.from({ length: 32 }, (_, i) => i + 1).map(n => `<option value="${n}" ${project.bars === n ? 'selected' : ''}>${n} bars</option>`).join('')}</select><span>LENGTH</span></label>
          <div class="transport-end"><span class="live-dot"></span> ${engine.playing ? 'PLAYING' : 'STUDIO READY'}<div class="mini-level"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
        </section>
        <section class="arrangement" aria-label="Multitrack arrangement">
          <div class="panel-heading"><div><strong>Arrangement</strong><span class="count">${String(project.tracks.length).padStart(2, '0')} TRACKS</span></div><div class="arrangement-tools"><span class="snap-indicator">SNAP · ¼</span><label class="zoom-label">−<input id="zoom" aria-label="Timeline zoom" type="range" min="1" max="3" step="0.25" value="${zoom}"/>+</label><button class="text-button" data-add="keys">${icon('plus')} Add track</button></div></div>
          <div class="arranger-viewport"><div class="arranger"><div class="track-headers"><div class="track-label">TRACK / INSTRUMENT</div>${project.tracks.map((item, i) => `<div class="track-header ${item.id === selected ? 'selected' : ''}" data-select="${item.id}" style="--accent:${item.color}"><span class="track-number">${String(i + 1).padStart(2, '0')}</span><span class="track-symbol">${icon(kindIcon(item.kind))}</span><button class="track-name" data-select="${item.id}"><strong>${esc(item.name)}</strong><small>${item.kind === 'audio' ? 'AUDIO CLIP' : item.kind === 'drums' ? 'DRUM MACHINE' : 'SYNTHESIZER'}</small></button><div class="track-toggles"><button data-mute="${item.id}" class="${item.muted ? 'muted' : ''}" aria-label="Mute ${esc(item.name)}" aria-pressed="${item.muted}">M</button><button data-solo="${item.id}" class="${item.solo ? 'solo' : ''}" aria-label="Solo ${esc(item.name)}" aria-pressed="${item.solo}">S</button></div></div>`).join('')}<button class="add-track-row" data-add="keys">${icon('plus')} Add instrument track</button></div>
          <div class="arranger-scroll"><div class="timeline" style="width:${zoom * 100}%;--bars:${project.bars}"><div class="ruler" aria-label="Seek timeline">${Array.from({ length: project.bars }, (_, i) => `<span>${i + 1}<small>.1</small></span>`).join('')}</div><div class="timeline-lanes">${project.tracks.map(item => `<div class="lane ${item.id === selected ? 'selected' : ''}" data-lane="${item.id}" style="--accent:${item.color}"><div class="audio-clip ${item.muted ? 'clip-muted' : ''}" data-clip="${item.id}" style="left:${item.offset / (project.bars * 4) * 100}%;width:${Math.max(0, 100 - item.offset / (project.bars * 4) * 100)}%"><span>${icon(kindIcon(item.kind))}${esc(item.name)}<small>${item.reverse ? 'REV' : item.kind === 'audio' ? 'AUDIO' : 'LOOP'}</small></span><canvas data-wave="${item.id}"></canvas></div></div>`).join('')}</div><div id="playhead" class="playhead" style="left:${cursor / duration(project) * 100}%"><i></i></div></div></div></div></div>
          ${!project.tracks.length ? '<div class="empty-state">A little silence. A lot of possibility.<small>Add an instrument or drop in an audio file to begin.</small></div>' : ''}
          <div class="arrangement-footer"><span>${icon('wave')} ${project.bars * 4} beats <i>·</i> C minor <i>·</i> ${format(duration(project))}</span><span>Click ruler to seek <i>·</i> Drag clips to arrange</span></div>
        </section>
        <section class="editor" aria-label="Instrument editor"><div class="panel-heading"><div class="editor-tabs"><button class="${tab === 'pattern' ? 'active' : ''}" data-tab="pattern">${icon('keys')} Pattern editor</button><button class="${tab === 'mixer' ? 'active' : ''}" data-tab="mixer">${icon('sliders')} Mixer</button></div><span class="editor-hint">${tab === 'mixer' ? 'FIND YOUR BALANCE' : 'ONE BAR. ENDLESS POSSIBILITIES.'}</span></div>${tab === 'mixer' ? mixer() : pattern(t)}</section>
        <footer class="statusbar"><span><i class="status-dot"></i> Audio engine · 44.1 kHz / Stereo</span><span>SPACE <small>play / pause</small> <i>·</i> CTRL + S <small>save project</small></span><span>MADE FOR THE FLOW ${icon('spark')}</span></footer>
      </main>
      <aside class="inspector"><div class="inspector-title">CHANNEL STRIP ${icon('sliders')}</div>${t ? inspector(t) : '<div class="inspector-empty">Select a track to shape its sound.</div>'}<div class="master-section"><div class="section-title">MASTER OUT ${icon('headphones')}</div><div class="master-meter"><div id="meter-fill"></div></div><div class="meter-scale"><span>−48</span><span>−24</span><span>−12</span><span>0 dB</span></div>${slider('Master volume', 'master', project.master, 0, 1, 0.01, `${Math.round(project.master * 100)}%`)}<span class="master-note">Stereo output · Safety limiter</span></div></aside>
    </div>
    <input id="audio-file" type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" hidden multiple /><input id="project-file" type="file" accept=".lemix,.json" hidden />
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <dialog id="help-dialog"><button class="dialog-close" data-action="close-help" aria-label="Close help">×</button><span class="eyebrow">WELCOME TO YOUR STUDIO</span><h2>Make something that sounds like you.</h2><p>Press Space to play the demo. Add an instrument from the library or import your own audio. Drag a clip to move it, then shape its sound in the channel strip.</p><p>Click steps to build a beat, or notes to write a melody. Patterns repeat every bar; the built-in progression moves through C minor, F minor, E♭ minor and G minor.</p><dl><dt>Space</dt><dd>Play / pause</dd><dt>Ctrl / ⌘ + S</dt><dd>Save a self-contained .lemix project</dd><dt>Ctrl / ⌘ + O</dt><dd>Open a project</dd><dt>Ctrl / ⌘ + Z</dt><dd>Undo</dd><dt>Ctrl / ⌘ + Shift + Z</dt><dd>Redo</dd></dl><p>Export creates a 44.1 kHz stereo WAV with the current mix and a two-second effect tail. Speed changes pitch too. Save your work before closing.</p><button class="export-button" data-action="close-help">Let's make some noise ${icon('chevron')}</button></dialog>`;
  document.querySelector('.arranger-scroll')!.scrollLeft = scroll;
  const version = ++revision;
  void drawWaves(version);
}

function pattern(t?: Track) {
  if (!t) return '<div class="editor-empty">Pick a sound from the library. Your first idea starts here.</div>';
  const headings = `<div class="step-ruler"><span></span>${Array.from({ length: 16 }, (_, i) => `<span>${i % 4 === 0 ? i / 4 + 1 : '·'}</span>`).join('')}</div>`;
  if (t.kind === 'audio') return `<div class="audio-editor"><span class="audio-editor-icon" style="color:${t.color}">${icon('wave')}</span><div><h3>${esc(t.name)}</h3><p>Your sample, your signature. Move, trim, reverse or reshape it with the channel strip.</p><span class="pill">EMBEDDED IN PROJECT</span></div><button class="text-button" data-action="import">${icon('plus')} Import another</button></div>`;
  if (t.kind === 'pad') return `<div class="audio-editor"><span class="audio-editor-icon" style="color:${t.color}">${icon('spark')}</span><div><h3>A little atmosphere goes a long way.</h3><p>A slowly evolving minor chord progression. Try a warm low-pass filter and a generous touch of reverb.</p><span class="pill">C m → F m → E♭ m → G m</span></div></div>`;
  return `<div class="pattern-content" style="--accent:${t.color}"><div class="pattern-title"><span class="color-dot" style="background:${t.color}"></span><strong>${esc(t.name)}</strong><span>${t.kind === 'drums' ? '16 STEPS · 1/16' : 'C MINOR · 1/16'}</span><button class="text-button" data-action="clear-pattern">Clear pattern</button></div>${headings}${t.kind === 'drums' ? DRUMS.map((name, row) => `<div class="step-row"><span><small>${String(row + 1).padStart(2, '0')}</small>${name}</span>${t.steps[row].map((on, step) => `<button data-step="${row}:${step}" data-column="${step}" class="step ${on ? 'on' : ''} ${step % 4 === 0 ? 'group-start' : ''}" aria-label="${name} step ${step + 1}" aria-pressed="${on}"></button>`).join('')}</div>`).join('') : [12, 10, 7, 5, 3, 2, 0].map(note => `<div class="note-row"><span>${({ 0: 'C', 2: 'D', 3: 'E♭', 5: 'F', 7: 'G', 10: 'B♭', 12: 'C' } as Record<number, string>)[note]}<small>${t.kind === 'bass' ? '2' : '4'}</small></span>${t.notes.map((n, step) => `<button data-note="${note}:${step}" data-column="${step}" class="note ${n === note ? 'on' : ''}" aria-label="Note ${note}, step ${step + 1}" aria-pressed="${n === note}"></button>`).join('')}</div>`).join('')}</div>`;
}

function mixer() {
  return `<div class="mixer-content">${project.tracks.map(t => `<div class="mixer-channel" style="--accent:${t.color}"><button data-select="${t.id}" class="mixer-name">${icon(kindIcon(t.kind))}${esc(t.name)}</button><div class="mixer-fader"><input type="range" min="0" max="1" step="0.01" value="${t.volume}" data-mix="${t.id}" aria-label="${esc(t.name)} volume"/><span>${Math.round(t.volume * 100)}%</span></div><div class="mixer-pan"><span>L</span><input type="range" min="-1" max="1" step="0.01" value="${t.pan}" data-pan="${t.id}" aria-label="${esc(t.name)} pan"/><span>R</span></div><div class="track-toggles"><button data-mute="${t.id}" class="${t.muted ? 'muted' : ''}" aria-pressed="${t.muted}" aria-label="Mute ${esc(t.name)}">M</button><button data-solo="${t.id}" class="${t.solo ? 'solo' : ''}" aria-pressed="${t.solo}" aria-label="Solo ${esc(t.name)}">S</button></div></div>`).join('')}${!project.tracks.length ? '<p class="editor-empty">Add tracks to start mixing.</p>' : ''}</div>`;
}

function inspector(t: Track) {
  const fx = t.effects;
  return `<div class="selected-channel" style="--accent:${t.color}"><div class="selected-icon">${icon(kindIcon(t.kind))}</div><div><input id="track-name" aria-label="Track name" maxlength="80" value="${esc(t.name)}"/><small>${t.kind.toUpperCase()} / ${t.id.slice(0, 4).toUpperCase()}</small></div></div>
    <div class="inspector-actions">${button('duplicate', 'duplicate', 'Duplicate selected track')}${button('delete', 'trash', 'Delete selected track')}<button class="text-button" data-action="reset-fx">${icon('reset')} Reset FX</button></div>
    <div class="inspector-scroll">
    <div class="control-section"><div class="section-title">CHANNEL <span>01</span></div>${slider('Volume', 'volume', t.volume, 0, 1, 0.01, `${Math.round(t.volume * 100)}%`)}${slider('Pan', 'pan', t.pan, -1, 1, 0.01, t.pan === 0 ? 'Center' : `${Math.round(Math.abs(t.pan) * 100)}${t.pan < 0 ? 'L' : 'R'}`)}</div>
    <div class="control-section"><div class="section-title">EQUALIZER <span class="fx-dot"></span></div><div class="eq-visual"><svg viewBox="0 0 220 44" aria-hidden="true"><path class="eq-grid" d="M0 11h220M0 22h220M0 33h220M44 0v44M88 0v44M132 0v44M176 0v44"/><path id="eq-curve" d="M0 ${22 - fx.low} Q55 ${22 - fx.low} 90 ${22 - fx.mid} T150 ${22 - fx.high} T220 ${22 - fx.high}"/></svg></div>${slider('Low · 200 Hz', 'fx.low', fx.low, -12, 12, 0.5, `${fx.low > 0 ? '+' : ''}${fx.low} dB`)}${slider('Mid · 1.2 kHz', 'fx.mid', fx.mid, -12, 12, 0.5, `${fx.mid > 0 ? '+' : ''}${fx.mid} dB`)}${slider('High · 5 kHz', 'fx.high', fx.high, -12, 12, 0.5, `${fx.high > 0 ? '+' : ''}${fx.high} dB`)}</div>
    <div class="control-section"><div class="section-title">SOUND SHAPING <span class="fx-dot"></span></div>${slider('Low-pass filter', 'fx.cutoff', fx.cutoff, 100, 20000, 100, `${(fx.cutoff / 1000).toFixed(1)} kHz`)}${slider('Drive', 'fx.drive', fx.drive, 0, 1, 0.01, `${Math.round(fx.drive * 100)}%`)}${slider('Compression', 'fx.compression', fx.compression, 0, 1, 0.01, `${Math.round(fx.compression * 100)}%`)}</div>
    <div class="control-section"><div class="section-title">SPACE & TEXTURE <span class="fx-dot"></span></div>${slider('Room reverb', 'fx.reverb', fx.reverb, 0, 1, 0.01, `${Math.round(fx.reverb * 100)}%`)}${slider('Dotted delay', 'fx.delay', fx.delay, 0, 1, 0.01, `${Math.round(fx.delay * 100)}%`)}</div>
    <div class="control-section"><div class="section-title">CLIP TOOLS <span>02</span></div>${slider('Start offset · beats', 'offset', t.offset, 0, project.bars * 4 - 0.25, 0.25, `${t.offset}`)}${slider('Trim start · seconds', 'trim', t.trim, 0, 600, 0.1, `${t.trim.toFixed(1)} s`)}${slider('Playback speed', 'rate', t.rate, 0.5, 2, 0.05, `${t.rate.toFixed(2)}×`)}<button class="reverse-button ${t.reverse ? 'active' : ''}" data-action="reverse" aria-pressed="${t.reverse}">${icon('undo')} Reverse audio <span>${t.reverse ? 'ON' : 'OFF'}</span></button></div></div>`;
}

async function drawWaves(version: number) {
  for (const t of project.tracks) {
    try {
      const buffer = await engine.buffer(t, project);
      if (version !== revision) return;
      if (t.id === selected) document.querySelector<HTMLInputElement>('[data-control="trim"]')!.max = Math.max(t.trim, 0.1, buffer.duration - 0.1).toFixed(1);
      const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-wave="${t.id}"]`);
      if (!canvas) continue;
      const clip = canvas.parentElement!;
      const available = Math.max(0, Math.min((buffer.duration - t.trim) / t.rate, duration(project) - t.offset * 60 / project.bpm));
      clip.style.width = `${available / duration(project) * 100}%`;
      const width = Math.round(canvas.clientWidth);
      canvas.width = width * devicePixelRatio; canvas.height = 42 * devicePixelRatio;
      const ctx = canvas.getContext('2d')!; ctx.scale(devicePixelRatio, devicePixelRatio);
      const pcm = buffer.getChannelData(0); const start = Math.floor(t.trim * buffer.sampleRate);
      const samples = Math.floor(available * t.rate * buffer.sampleRate);
      ctx.fillStyle = t.color; ctx.globalAlpha = 0.7;
      for (let x = 0; x < width; x += 3) {
        const from = start + Math.floor(x / width * samples);
        const to = Math.min(pcm.length, start + Math.floor((x + 3) / width * samples));
        let peak = 0;
        for (let i = from; i < to; i += Math.max(1, Math.floor((to - from) / 32))) peak = Math.max(peak, Math.abs(pcm[i]));
        const height = Math.max(1, Math.min(39, peak * 45)); ctx.fillRect(x, 21 - height / 2, 1.7, height);
      }
    } catch (error) { if (version === revision) notify(`Cannot read ${t.name}: ${error instanceof Error ? error.message : 'unsupported audio'}`, true); }
  }
}

async function play() {
  try { await engine.play(clone(project), cursor); render(); }
  catch (error) { notify(error instanceof Error ? error.message : 'Could not start audio.', true); }
}

function pause() { clearTimeout(restartTimer); cursor = engine.position(); engine.stop(); render(); }
engine.onEnded = () => { cursor = 0; render(); };

async function saveBytes(name: string, kind: 'project' | 'wav', bytes: Uint8Array): Promise<boolean> {
  if (window.lemix) return window.lemix.saveFile(name, kind, bytes);
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: kind === 'wav' ? 'audio/wav' : 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `${name.replace(/[<>:"/\\|?*]/g, '_')}.${kind === 'wav' ? 'wav' : 'lemix'}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
}

async function addAudio(files: File[]) {
  if (!files.length) return;
  await task(async () => {
    const additions: Track[] = [];
    for (const file of files) {
      if (project.tracks.length + additions.length >= 24) throw new Error('Maximum 24 tracks per project.');
      if (file.size > 24 * 1024 * 1024) throw new Error(`${file.name} exceeds 24 MB. Trim or compress it first.`);
      const t = createTrack('audio', project.tracks.length + additions.length);
      t.name = file.name.replace(/\.[^.]+$/, '').slice(0, 80);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      t.audio = btoa(binary);
      await engine.buffer(t, project); additions.push(t);
    }
    const candidate = { ...project, tracks: [...project.tracks, ...additions] };
    if (JSON.stringify(candidate).length > 100 * 1024 * 1024) throw new Error('Project would exceed 100 MB. Use smaller audio files.');
    edit(() => { project.tracks.push(...additions); selected = additions[0].id; }, true);
    notify(`${additions.length} audio ${additions.length === 1 ? 'track' : 'tracks'} imported. Ready to remix.`);
  });
}

app.addEventListener('click', event => {
  const element = (event.target as HTMLElement).closest<HTMLElement>('button, [data-select]');
  if (!element || busy) return;
  if (element.dataset.add) {
    if (project.tracks.length >= 24) return notify('Maximum 24 tracks per project.', true);
    edit(() => { const t = createTrack(element.dataset.add as TrackKind, project.tracks.length); project.tracks.push(t); selected = t.id; tab = 'pattern'; }, true);
  } else if (element.dataset.select) { selected = element.dataset.select; render(); }
  else if (element.dataset.mute || element.dataset.solo) {
    const t = project.tracks.find(t => t.id === (element.dataset.mute ?? element.dataset.solo))!;
    edit(() => { if (element.dataset.mute) t.muted = !t.muted; else t.solo = !t.solo; });
  } else if (element.dataset.tab) { tab = element.dataset.tab as typeof tab; render(); }
  else if (element.dataset.step) {
    const [row, step] = element.dataset.step.split(':').map(Number);
    edit(() => { const t = track()!; t.steps[row][step] = !t.steps[row][step]; }, true);
  } else if (element.dataset.note) {
    const [note, step] = element.dataset.note.split(':').map(Number);
    edit(() => { const t = track()!; t.notes[step] = t.notes[step] === note ? -1 : note; }, true);
  } else if (element.dataset.action) void action(element.dataset.action);
});

async function action(name: string) {
  switch (name) {
    case 'play': if (engine.playing) pause(); else await play(); break;
    case 'stop': clearTimeout(restartTimer); engine.stop(); cursor = 0; render(); break;
    case 'loop': edit(() => { project.loop = !project.loop; }, true); break;
    case 'arrangement': document.querySelector('.arrangement')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); break;
    case 'mixer': tab = 'mixer'; render(); break;
    case 'import': document.querySelector<HTMLInputElement>('#audio-file')!.click(); break;
    case 'open': document.querySelector<HTMLInputElement>('#project-file')!.click(); break;
    case 'new':
      if (dirty && !confirm('Start a new project? Unsaved changes will be lost.')) return;
      engine.stop(); clearTimeout(restartTimer); checkpoint();
      project = { version: 1, name: 'Untitled session', bpm: 120, bars: 8, master: 0.8, loop: true, tracks: [] };
      selected = ''; cursor = 0; dirty = false; document.title = 'Lemix Studio'; render(); break;
    case 'save': await task(async () => {
      if (await saveBytes(project.name, 'project', new TextEncoder().encode(JSON.stringify(project)))) {
        dirty = false; document.title = `${project.name} — Lemix Studio`; render(); notify('Project saved. Your sounds and settings are all included.');
      }
    }); break;
    case 'export': await task(async () => {
      notify('Rendering your mix…');
      const bytes = await engine.export(clone(project));
      if (await saveBytes(project.name, 'wav', bytes)) notify('Your mix is ready. Stereo WAV · 44.1 kHz · 16-bit.');
    }); break;
    case 'undo': case 'redo': {
      const from = name === 'undo' ? history : future;
      const to = name === 'undo' ? future : history;
      const previous = from.pop(); if (!previous) return;
      engine.stop(); clearTimeout(restartTimer); to.push(clone(project)); project = previous;
      selected = project.tracks.some(t => t.id === selected) ? selected : project.tracks[0]?.id ?? '';
      cursor = Math.min(cursor, duration(project)); changed(); render(); break;
    }
    case 'duplicate': {
      const t = track(); if (!t) return;
      if (project.tracks.length >= 24) return notify('Maximum 24 tracks per project.', true);
      edit(() => { const copy = clone({ ...project, tracks: [t] }).tracks[0]; copy.id = crypto.randomUUID(); copy.name = `${t.name.slice(0, 73)} (copy)`; project.tracks.push(copy); selected = copy.id; }, true); break;
    }
    case 'delete': if (track()) edit(() => { project.tracks = project.tracks.filter(t => t.id !== selected); selected = project.tracks[0]?.id ?? ''; }, true); break;
    case 'reverse': if (track()) edit(() => { track()!.reverse = !track()!.reverse; }, true); break;
    case 'reset-fx': if (track()) edit(() => { track()!.effects = { low: 0, mid: 0, high: 0, cutoff: 18000, drive: 0, reverb: 0, delay: 0, compression: 0 }; }); break;
    case 'clear-pattern': if (track()) edit(() => { track()!.steps.forEach(row => row.fill(false)); track()!.notes.fill(-1); }, true); break;
    case 'help': document.querySelector<HTMLDialogElement>('#help-dialog')!.showModal(); break;
    case 'close-help': document.querySelector<HTMLDialogElement>('#help-dialog')!.close(); break;
  }
}

app.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'search') {
    for (const card of document.querySelectorAll<HTMLElement>('[data-search]')) card.hidden = !card.dataset.search!.includes(input.value.toLowerCase());
    return;
  }
  if (input.id === 'zoom') { zoom = Number(input.value); document.querySelector<HTMLElement>('.timeline')!.style.width = `${zoom * 100}%`; void drawWaves(++revision); return; }
  if (!input.dataset.control && !input.dataset.mix && !input.dataset.pan) return;
  if (busy) return;
  if (!editing) { checkpoint(); editing = true; }
  const value = Number(input.value); const key = input.dataset.control;
  if (input.dataset.mix || input.dataset.pan) {
    const t = project.tracks.find(t => t.id === (input.dataset.mix ?? input.dataset.pan))!;
    if (input.dataset.mix) { t.volume = value; input.nextElementSibling!.textContent = `${Math.round(value * 100)}%`; } else t.pan = value;
  } else if (key === 'master') project.master = value;
  else if (key && track()) {
    const t = track()!;
    if (key.startsWith('fx.')) t.effects[key.slice(3) as keyof Effects] = value;
    else if (key === 'volume' || key === 'pan' || key === 'offset' || key === 'trim' || key === 'rate') t[key] = value;
  }
  const output = input.closest('label')?.querySelector('output');
  if (output) output.textContent = key === 'fx.cutoff' ? `${(value / 1000).toFixed(1)} kHz` : key === 'rate' ? `${value.toFixed(2)}×` : key === 'trim' ? `${value.toFixed(1)} s` : key === 'offset' ? `${value}` : key === 'pan' ? value === 0 ? 'Center' : `${Math.round(Math.abs(value) * 100)}${value < 0 ? 'L' : 'R'}` : key && ['fx.low', 'fx.mid', 'fx.high'].includes(key) ? `${value > 0 ? '+' : ''}${value} dB` : `${Math.round(value * 100)}%`;
  changed(key === 'offset' || key === 'trim' || key === 'rate');
});

app.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.type === 'range') { editing = false; render(); return; }
  if (busy) return;
  if (input.id === 'project-name') edit(() => { project.name = input.value.trim().slice(0, 80) || 'Untitled session'; });
  if (input.id === 'track-name' && track()) edit(() => { track()!.name = input.value.trim().slice(0, 80) || 'Untitled track'; });
  if (input.id === 'bpm') {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 40 || value > 240) { notify('Tempo must be between 40 and 240 BPM.', true); render(); return; }
    edit(() => { project.bpm = value; cursor = Math.min(cursor, duration(project)); }, true);
  }
  if (input.id === 'bars') edit(() => { project.bars = Number(input.value); project.tracks.forEach(t => { t.offset = Math.min(t.offset, project.bars * 4 - 0.25); }); cursor = Math.min(cursor, duration(project)); }, true);
  if (input.id === 'audio-file') void addAudio(Array.from(input.files ?? []));
  if (input.id === 'project-file' && input.files?.[0]) {
    const file = input.files[0];
    void task(async () => {
      if (file.size > 100 * 1024 * 1024) throw new Error('Project exceeds 100 MB.');
      const loaded = parseProject(await file.text());
      await engine.prepare(loaded);
      if (dirty && !confirm('Open this project? Unsaved changes will be lost.')) return;
      engine.stop(); clearTimeout(restartTimer); checkpoint(); project = loaded; selected = loaded.tracks[0]?.id ?? ''; cursor = 0; dirty = false;
      document.title = `${project.name} — Lemix Studio`; render(); notify('Project loaded. Pick up where you left off.');
    });
  }
});

app.addEventListener('pointerdown', event => {
  const target = event.target as HTMLElement;
  if (busy) return;
  if (target.closest('.ruler')) {
    const bounds = document.querySelector('.timeline')!.getBoundingClientRect();
    cursor = Math.max(0, Math.min(duration(project) - 0.001, (event.clientX - bounds.left) / bounds.width * duration(project)));
    if (engine.playing) void play(); else render();
    return;
  }
  const clip = target.closest<HTMLElement>('[data-clip]'); if (!clip) return;
  const t = project.tracks.find(t => t.id === clip.dataset.clip)!;
  const x = event.clientX; const original = t.offset;
  const width = document.querySelector('.timeline')!.getBoundingClientRect().width;
  let moved = false; selected = t.id;
  const move = (event: PointerEvent) => {
    if (!moved && Math.abs(event.clientX - x) < 5) return;
    if (!moved) checkpoint(); moved = true;
    t.offset = Math.max(0, Math.min(project.bars * 4 - 0.25, Math.round((original + (event.clientX - x) / width * project.bars * 4) * 4) / 4));
    clip.style.left = `${t.offset / (project.bars * 4) * 100}%`;
  };
  const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); if (moved) changed(true); render(); };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up, { once: true }); document.addEventListener('pointercancel', up, { once: true });
});

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (target.closest('dialog') || busy) return;
  if ((event.ctrlKey || event.metaKey) && ['s', 'o'].includes(event.key.toLowerCase())) {
    event.preventDefault(); target.blur(); void action(event.key.toLowerCase() === 's' ? 'save' : 'open'); return;
  }
  if (target.closest('input, select, textarea')) return;
  if (event.code === 'Space' && !target.closest('button')) { event.preventDefault(); void action('play'); }
  if ((event.ctrlKey || event.metaKey) && ['s', 'o', 'z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    void action(event.key.toLowerCase() === 's' ? 'save' : event.key.toLowerCase() === 'o' ? 'open' : event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo');
  }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer?.types.includes('Files')) document.body.classList.add('dragging'); });
window.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', event => {
  event.preventDefault(); document.body.classList.remove('dragging');
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.some(file => /\.(lemix|json)$/i.test(file.name))) return notify('Use Open project to load a .lemix file.');
  void addAudio(files);
});

const levels = new Float32Array(engine.analyser.fftSize);
function animate() {
  const position = engine.playing ? engine.position() : cursor;
  const time = document.querySelector('#time'); if (time) time.textContent = format(position);
  const playhead = document.querySelector<HTMLElement>('#playhead'); if (playhead) playhead.style.left = `${position / duration(project) * 100}%`;
  const beats = position * project.bpm / 60;
  const display = document.querySelector('#beat-position'); if (display) display.textContent = `BAR ${String(Math.floor(beats / 4) + 1).padStart(2, '0')} · BEAT ${Math.floor(beats % 4) + 1}`;
  const step = engine.playing ? Math.floor(beats * 4) % 16 : -1;
  document.querySelectorAll<HTMLElement>('[data-column]').forEach(el => el.classList.toggle('current-step', Number(el.dataset.column) === step));
  engine.analyser.getFloatTimeDomainData(levels);
  let peak = 0; for (const value of levels) peak = Math.max(peak, Math.abs(value));
  const meter = document.querySelector<HTMLElement>('#meter-fill'); if (meter) meter.style.width = `${Math.max(0, Math.min(100, (20 * Math.log10(Math.max(0.001, peak)) + 48) / 48 * 100))}%`;
  document.querySelectorAll<HTMLElement>('.mini-level i').forEach((el, i) => el.classList.toggle('lit', peak > (i + 1) * 0.06));
  requestAnimationFrame(animate);
}

render(); animate();

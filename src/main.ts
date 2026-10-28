import './style.css';
import { AudioEngine } from './audio.ts';
import { COLORS, DRUMS, INSTRUMENTS, CLEANUP_PRESETS, defaultCleanup, MAX_AUDIO_BYTES, MAX_PROJECT_BYTES, createSource, createLayer, createInstrument, createClip, cloneClip, cloneProject, pruneSources, neutralEffects, demoProject, duration, parseProject, maxBars, encodeWav } from './model.ts';
import type { Clip, Effects, Project, Source, Track, TrackKind } from './model.ts';
import { icon } from './icons.ts';
import { clipDuration, clipCount, layoutClips, moveClip, snapBeat, splitClip, trimClip } from './timeline.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const engine = new AudioEngine();
let project = demoProject();
let selected = project.tracks[0].id;
let selectedClip = project.tracks[0].clips[0].id;
let inspectorMode: 'track' | 'clip' = 'track';
let timelineTool: 'select' | 'split' = 'select';
let libraryTab: 'sounds' | 'effects' = 'sounds';
let snap = true;
let revealSelection = false;
let importTarget: { trackId: string; beat: number } | undefined;
const sourceLengths = new Map<string, number>();
let tab: 'pattern' | 'mixer' = 'pattern';
let cursor = 0;
let zoom = 1;
let dirty = false;
let busy = false;
let editing = false;
let revision = 0;
let restartTimer: ReturnType<typeof setTimeout>;
let separationSource: Source | undefined;
let separationClip: Clip | undefined;
let separationTrackId = '';
let separatedBytes: Uint8Array | undefined;
let separationRunning = false;
let separationError = '';
let separationCanceled = false;
const history: Project[] = [];
const future: Project[] = [];
const esc = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const clone = cloneProject;
const track = () => project.tracks.find(t => t.id === selected);
const clip = () => track()?.clips.find(c => c.id === selectedClip);
const source = () => project.sources.find(s => s.id === clip()?.sourceId);
const trackKind = (t: Track): TrackKind => project.sources.find(s => s.id === t.clips[0]?.sourceId)?.kind ?? 'audio';
const sourceDuration = (id: string) => sourceLengths.get(id) ?? duration(project);
function selectTrack(id: string) { selected = id; selectedClip = track()?.clips[0]?.id ?? ''; inspectorMode = 'track'; revealSelection = true; }
function selectClip(t: Track, c: Clip) { selected = t.id; selectedClip = c.id; inspectorMode = 'clip'; revealSelection = true; }
function sanitizeSelection() { if (!track()) selected = project.tracks[0]?.id ?? ''; if (!clip()) selectedClip = track()?.clips[0]?.id ?? ''; if (!clip()) inspectorMode = 'track'; }
function fitTimeline() { const end = Math.max(0, ...project.tracks.flatMap(t => t.clips.map(c => c.offset * 60 / project.bpm + clipDuration(c, sourceDuration(c.sourceId))))); project.bars = Math.max(project.bars, Math.min(maxBars(project.bpm), Math.ceil(end * project.bpm / 240))); }
const kindIcon = (kind: TrackKind) => kind === 'audio' ? 'wave' : INSTRUMENTS[kind].icon;
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
  if (engine.preparing || rebuild && engine.playing) {
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

function filterLibrary(query: string) {
  for (const card of document.querySelectorAll<HTMLElement>('[data-search]')) card.hidden = !card.dataset.search!.includes(query.toLowerCase());
}

function render() {
  editing = false;
  const t = track();
  const scroll = document.querySelector('.arranger-scroll')?.scrollLeft ?? 0;
  const verticalScroll = document.querySelector('.arranger-viewport')?.scrollTop ?? 0;
  const libraryScroll = document.querySelector('.library')?.scrollTop ?? 0;
  const libraryQuery = document.querySelector<HTMLInputElement>('#search')?.value ?? '';
  const reveal = revealSelection; revealSelection = false;
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" aria-label="Lemix Studio">${icon('wave')}<span>lemix<span class="brand-dot">.</span></span><small>STUDIO</small></a>
      <div class="project-heading"><input id="project-name" aria-label="Project name" maxlength="80" value="${esc(project.name)}" /><span><i class="status-dot"></i><span id="save-state">${dirty ? 'Unsaved changes' : 'Ready to create'}</span></span></div>
      <div class="top-actions">${button('new', 'plus', 'New project')}${button('open', 'folder', 'Open project (Ctrl+O)')}${button('save', 'save', 'Save project (Ctrl+S)')}<span class="divider"></span>${button('undo', 'undo', 'Undo (Ctrl+Z)', history.length ? '' : 'disabled')}${button('redo', 'redo', 'Redo (Ctrl+Shift+Z)', future.length ? '' : 'disabled')}<button class="export-button" data-action="export" ${engine.preparing ? 'disabled' : ''}>${icon('export')} Export WAV</button></div>
    </header>
    <div class="studio">
      <aside class="browser">
        <div class="section-title">YOUR WORKSPACE <span class="shortcut">⌘</span></div>
        <button class="nav-item active" data-action="arrangement">${icon('sliders')} Arrangement <span>01</span></button>
        <button class="nav-item" data-action="mixer">${icon('headphones')} Mixer <span>${project.tracks.length}</span></button>
        <button class="nav-item ai-tool" data-action="vocal-remover">${icon('spark')} Vocal Remover <span>AI</span></button>
        <div class="browser-title">${libraryTab === 'sounds' ? 'SOUND LIBRARY' : 'AUDIO REPAIR'} <span class="pill">${libraryTab === 'sounds' ? `${Object.keys(INSTRUMENTS).length} SOUNDS` : 'DRAG & DROP'}</span></div>
        <div class="library-tabs"><button data-library="sounds" class="${libraryTab === 'sounds' ? 'active' : ''}">${icon('keys')} Sounds</button><button data-library="effects" class="${libraryTab === 'effects' ? 'active' : ''}">${icon('spark')} Audio FX</button></div>
        <label class="search">${icon('search')}<input id="search" placeholder="${libraryTab === 'sounds' ? 'Find your sound…' : 'Find an effect…'}" aria-label="Search library" /></label>
        <div class="library">
          ${libraryTab === 'sounds' ? Object.entries(INSTRUMENTS).map(([kind, instrument], i) => `<button class="sound-card" data-add="${kind}" data-search="${instrument.name.toLowerCase()}" style="--accent:${COLORS[i % COLORS.length]}"><span class="sound-art">${icon(instrument.icon)}</span><span><strong>${instrument.name}</strong><small>${instrument.description}</small></span><span class="sound-add">+</span><span class="sound-number">${String(i + 1).padStart(2, '0')}</span></button>`).join('') : Object.entries(CLEANUP_PRESETS).map(([id, preset]) => `<button draggable="true" class="sound-card repair-card" data-cleanup="${id}" data-search="${preset.name.toLowerCase()}" style="--accent:#a9d9bc" title="Drag onto a clip, or click to apply to the selected clip"><span class="sound-art">${icon(id === 'declick' ? 'wave' : 'spark')}</span><span><strong>${preset.name}</strong><small>${preset.description}</small></span><span class="sound-add">↗</span></button>`).join('') + '<p class="repair-help">Drag an effect onto a clip.<br/>Or select a clip, then click an effect.<br/><small>Original audio stays untouched.</small></p>'}
        </div>
        <button class="import-area" data-action="import">${icon('import')}<strong>Bring your own sound</strong><span>Import WAV, MP3, OGG or FLAC</span><small>or drop an audio file anywhere</small></button>
        <div class="browser-bottom"><span class="online-dot"></span> ALL LOCAL. ALL YOURS.<p>No cloud. Just your creativity.</p></div>
      </aside>
      <main>
        <div class="workspace-heading"><div><span class="eyebrow">LET THE IDEAS FLOW</span><h1>Your next late-night masterpiece<span>.</span></h1></div>${button('help', 'help', 'Shortcuts and help')}</div>
        <section class="transport" aria-label="Transport">
          <div class="transport-buttons">${button('stop', 'stop', 'Stop and return to start')}<button class="play-button ${engine.playing || engine.preparing ? 'playing' : ''}" data-action="play" aria-label="${engine.playing || engine.preparing ? 'Pause' : 'Play'}" title="Play / pause (Space)">${icon(engine.playing || engine.preparing ? 'pause' : 'play')}</button>${button('loop', 'loop', 'Loop arrangement', `aria-pressed="${project.loop}"`)}</div>
          <div class="time-display"><strong id="time">${format(cursor)}</strong><span id="beat-position">BAR 01 · BEAT 1</span></div>
          <label class="tempo"><input id="bpm" type="number" aria-label="Tempo BPM" min="40" max="240" value="${project.bpm}" /><span>BPM</span></label>
          <div class="signature"><strong>4 / 4</strong><span>TIME SIGNATURE</span></div>
          <label class="length"><select id="bars" aria-label="Arrangement length">${Array.from({ length: maxBars(project.bpm) }, (_, i) => i + 1).map(n => `<option value="${n}" ${project.bars === n ? 'selected' : ''}>${n} bars</option>`).join('')}</select><span>LENGTH</span></label>
          <div class="transport-end"><span class="live-dot"></span> ${engine.preparing ? 'PREPARING AUDIO' : engine.playing ? 'PLAYING' : 'STUDIO READY'}<div class="mini-level"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
        </section>
        <section class="arrangement" aria-label="Multitrack arrangement">
          <div class="panel-heading"><div><strong>Arrangement</strong><span class="count">${String(project.tracks.length).padStart(2, '0')} TRACKS</span></div><div class="arrangement-tools"><button class="snap-indicator" data-action="snap" aria-pressed="${snap}">SNAP ${snap ? "ON" : "OFF"}</button><label class="zoom-label">−<input id="zoom" aria-label="Timeline zoom" type="range" min="1" max="12" step="0.25" value="${zoom}"/>+</label><button class="text-button" data-action="add-layer">${icon('plus')} Add layer</button></div></div>
          <div class="clip-toolbar"><button data-action="select-tool" class="${timelineTool === 'select' ? 'active' : ''}" title="Select and move (V)">${icon('cursor')} Select</button><button data-action="split-tool" class="${timelineTool === 'split' ? 'active' : ''}" title="Cut at click (C)">${icon('scissors')} Razor</button><span class="divider"></span><button data-action="split-clip" ${clip() ? '' : 'disabled'} title="Split selected clip at playhead (S)">${icon('scissors')} Split</button><button data-action="duplicate-clip" ${clip() ? '' : 'disabled'} title="Duplicate clip (Ctrl+D)">${icon('duplicate')}</button><button data-action="delete-clip" ${clip() ? '' : 'disabled'} title="Delete clip (Delete)">${icon('trash')}</button><button data-action="insert-audio" ${t ? '' : 'disabled'}>${icon('import')} Add audio</button><span class="clip-selection">${clip() ? esc(clip()!.name) : 'Select a clip to edit'}</span></div><div class="arranger-viewport"><div class="arranger"><div class="track-headers"><div class="track-label">TRACK / INSTRUMENT</div>${project.tracks.map((item, i) => `<div class="track-header ${item.id === selected ? 'selected' : ''}" data-select="${item.id}" style="--accent:${item.color}"><span class="track-number">${String(i + 1).padStart(2, '0')}</span><span class="track-symbol">${icon(kindIcon(trackKind(item)))}</span><button class="track-name" data-select="${item.id}"><strong>${esc(item.name)}</strong><small>${`${item.clips.length} CLIPS / LAYER`}</small></button><div class="track-toggles"><button data-mute="${item.id}" class="${item.muted ? 'muted' : ''}" aria-label="Mute ${esc(item.name)}" aria-pressed="${item.muted}">M</button><button data-solo="${item.id}" class="${item.solo ? 'solo' : ''}" aria-label="Solo ${esc(item.name)}" aria-pressed="${item.solo}">S</button></div></div>`).join('')}<button class="add-track-row" data-action="add-layer">${icon('plus')} Add empty layer</button></div>
          <div class="arranger-scroll"><div class="timeline" style="width:${zoom * 100}%;--bars:${project.bars}"><div class="ruler" aria-label="Seek timeline">${Array.from({ length: project.bars }, (_, i) => `<span>${i % Math.max(1, Math.ceil(project.bars / (12 * zoom))) === 0 ? i + 1 : ''}</span>`).join('')}</div><div class="timeline-lanes">${project.tracks.map(renderLane).join('')}</div><div id="playhead" class="playhead" style="left:${cursor / duration(project) * 100}%"><i></i></div></div></div></div></div>
          ${!project.tracks.length ? '<div class="empty-state">A little silence. A lot of possibility.<small>Add an instrument or drop in an audio file to begin.</small></div>' : ''}
          <div class="arrangement-footer"><span>${icon('wave')} ${project.bars * 4} beats <i>·</i> C minor <i>·</i> ${format(duration(project))}</span><span>Drag to move layers <i>·</i> Drag edges to trim <i>·</i> S to split</span></div>
        </section>
        <section class="editor" aria-label="Instrument editor"><div class="panel-heading"><div class="editor-tabs"><button class="${tab === 'pattern' ? 'active' : ''}" data-tab="pattern">${icon('keys')} Pattern editor</button><button class="${tab === 'mixer' ? 'active' : ''}" data-tab="mixer">${icon('sliders')} Mixer</button></div><span class="editor-hint">${tab === 'mixer' ? 'FIND YOUR BALANCE' : 'ONE BAR. ENDLESS POSSIBILITIES.'}</span></div>${tab === 'mixer' ? mixer() : pattern(t)}</section>
        <footer class="statusbar"><span><i class="status-dot"></i> Audio engine · 44.1 kHz / Stereo</span><span>SPACE <small>play / pause</small> <i>·</i> CTRL + S <small>save project</small></span><span>MADE FOR THE FLOW ${icon('spark')}</span></footer>
      </main>
      <aside class="inspector"><div class="inspector-title">CHANNEL STRIP ${icon('sliders')}</div>${t ? inspector(t) : '<div class="inspector-empty">Select a track to shape its sound.</div>'}<div class="master-section"><div class="section-title">MASTER OUT ${icon('headphones')}</div><div class="master-meter"><div id="meter-fill"></div></div><div class="meter-scale"><span>−48</span><span>−24</span><span>−12</span><span>0 dB</span></div>${slider('Master volume', 'master', project.master, 0, 1, 0.01, `${Math.round(project.master * 100)}%`)}<span class="master-note">Stereo output · Safety limiter</span></div></aside>
    </div>
    <input id="audio-file" type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" hidden multiple /><input id="project-file" type="file" accept=".lemix,.json" hidden />
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <dialog id="vocal-dialog"><button class="dialog-close" data-action="close-vocal" aria-label="Close vocal remover">×</button><div id="vocal-content"></div></dialog>
    <dialog id="help-dialog"><button class="dialog-close" data-action="close-help" aria-label="Close help">×</button><span class="eyebrow">WELCOME TO YOUR STUDIO</span><h2>Make something that sounds like you.</h2><p>Press Space to play the demo. Add an instrument from the library or import your own audio. Drag a clip to move it, then shape its sound in the channel strip.</p><p>Click steps to build a beat, or notes to write a melody. Patterns repeat every bar; the built-in progression moves through C minor, F minor, E♭ minor and G minor.</p><dl><dt>Space</dt><dd>Play / pause</dd><dt>Ctrl / ⌘ + S</dt><dd>Save a self-contained .lemix project</dd><dt>Ctrl / ⌘ + O</dt><dd>Open a project</dd><dt>Ctrl / ⌘ + Z</dt><dd>Undo</dd><dt>Ctrl / ⌘ + Shift + Z</dt><dd>Redo</dd></dl><p>Export creates a 44.1 kHz stereo WAV with the current mix and a two-second effect tail. Speed changes pitch too. Save your work before closing.</p><button class="export-button" data-action="close-help">Let's make some noise ${icon('chevron')}</button></dialog>`;
  document.querySelector('.arranger-scroll')!.scrollLeft = scroll;
  document.querySelector('.arranger-viewport')!.scrollTop = verticalScroll;
  document.querySelector<HTMLInputElement>('#search')!.value = libraryQuery;
  filterLibrary(libraryQuery);
  document.querySelector('.library')!.scrollTop = libraryScroll;
  const version = ++revision;
  void drawWaves(version).then(() => {
    if (version === revision && reveal) (document.querySelector<HTMLElement>(`[data-clip="${selectedClip}"]`) ?? document.querySelector<HTMLElement>(`[data-lane="${selected}"]`))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function pattern(t?: Track) {
  const content = source();
  if (!t || !content) return '<div class="editor-empty">Pick a sound from the library. Your first idea starts here.</div>';
  const headings = `<div class="step-ruler"><span></span>${Array.from({ length: 16 }, (_, i) => `<span>${i % 4 === 0 ? i / 4 + 1 : '·'}</span>`).join('')}</div>`;
  if (content.kind === 'audio') return `<div class="audio-editor"><span class="audio-editor-icon" style="color:${t.color}">${icon('wave')}</span><div><h3>${esc(t.name)}</h3><p>Give the music its own space. Separate vocals with local AI, or shape your clip with the channel strip.</p><span class="pill">SHARED SOURCE IN PROJECT</span></div><div class="audio-editor-actions"><button class="export-button" data-action="vocal-remover">${icon('spark')} Remove vocals</button><button class="text-button" data-action="import">${icon('plus')} Import another</button></div></div>`;
  if (content.kind === 'pad') return `<div class="audio-editor"><span class="audio-editor-icon" style="color:${t.color}">${icon('spark')}</span><div><h3>A little atmosphere goes a long way.</h3><p>A slowly evolving minor chord progression. Try a warm low-pass filter and a generous touch of reverb.</p><span class="pill">C m → F m → E♭ m → G m</span></div></div>`;
  const baseMidi = INSTRUMENTS[content.kind].midi;
  return `<div class="pattern-content" style="--accent:${t.color}"><div class="pattern-title"><span class="color-dot" style="background:${t.color}"></span><strong>${esc(t.name)}</strong><span>${content.kind === 'drums' ? '16 STEPS · 1/16' : 'C MINOR · 1/16'}</span><button class="text-button" data-action="clear-pattern">Clear pattern</button></div>${headings}${content.kind === 'drums' ? DRUMS.map((name, row) => `<div class="step-row"><span><small>${String(row + 1).padStart(2, '0')}</small>${name}</span>${content.steps[row].map((on, step) => `<button data-step="${row}:${step}" data-column="${step}" class="step ${on ? 'on' : ''} ${step % 4 === 0 ? 'group-start' : ''}" aria-label="${name} step ${step + 1}" aria-pressed="${on}"></button>`).join('')}</div>`).join('') : [12, 10, 7, 5, 3, 2, 0].map(note => `<div class="note-row"><span>${({ 0: 'C', 2: 'D', 3: 'E♭', 5: 'F', 7: 'G', 10: 'B♭', 12: 'C' } as Record<number, string>)[note]}<small>${Math.floor((baseMidi + note) / 12) - 1}</small></span>${content.notes.map((n, step) => `<button data-note="${note}:${step}" data-column="${step}" class="note ${n === note ? 'on' : ''}" aria-label="Note ${note}, step ${step + 1}" aria-pressed="${n === note}"></button>`).join('')}</div>`).join('')}</div>`;
}

function mixer() {
  return `<div class="mixer-content">${project.tracks.map(t => `<div class="mixer-channel" style="--accent:${t.color}"><button data-select="${t.id}" class="mixer-name">${icon(kindIcon(trackKind(t)))}${esc(t.name)}</button><div class="mixer-fader"><input type="range" min="0" max="1" step="0.01" value="${t.volume}" data-mix="${t.id}" aria-label="${esc(t.name)} volume"/><span>${Math.round(t.volume * 100)}%</span></div><div class="mixer-pan"><span>L</span><input type="range" min="-1" max="1" step="0.01" value="${t.pan}" data-pan="${t.id}" aria-label="${esc(t.name)} pan"/><span>R</span></div><div class="track-toggles"><button data-mute="${t.id}" class="${t.muted ? 'muted' : ''}" aria-pressed="${t.muted}" aria-label="Mute ${esc(t.name)}">M</button><button data-solo="${t.id}" class="${t.solo ? 'solo' : ''}" aria-pressed="${t.solo}" aria-label="Solo ${esc(t.name)}">S</button></div></div>`).join('')}${!project.tracks.length ? '<p class="editor-empty">Add tracks to start mixing.</p>' : ''}</div>`;
}

function renderLane(t: Track) {
  const layout = layoutClips(t, project.bpm, sourceDuration);
  return `<div class="lane ${t.id === selected ? 'selected' : ''} ${timelineTool === 'split' ? 'razor-lane' : ''}" data-lane="${t.id}" style="--accent:${t.color};height:${Math.max(70, layout.count * 60 + 10)}px">${t.clips.map(c => {
    const s = project.sources.find(s => s.id === c.sourceId)!;
    const length = Math.max(0, Math.min(clipDuration(c, sourceDuration(s.id)), duration(project) - c.offset * 60 / project.bpm));
    const fx = c.effects;
    const repaired = c.cleanup?.enabled && (c.cleanup.noise || c.cleanup.declick);
    const hasFX = fx.low || fx.mid || fx.high || fx.cutoff < 20000 || fx.drive || fx.reverb || fx.delay || fx.compression;
    return `<div class="audio-clip ${c.id === selectedClip ? 'clip-selected' : ''} ${t.muted || c.muted ? 'clip-muted' : ''}" data-clip="${c.id}" data-select-clip="${c.id}" role="button" tabindex="0" aria-label="Select clip ${esc(c.name)}" style="left:${c.offset / (project.bars * 4) * 100}%;width:${Math.max(0.05, length / duration(project) * 100)}%;top:${8 + layout.rows.get(c.id)! * 60}px;height:52px;bottom:auto"><span>${icon(kindIcon(s.kind))}${esc(c.name)}<small>${repaired ? 'REPAIR · ' : ''}${hasFX ? 'FX · ' : ''}${c.reverse ? 'REV' : s.kind === 'audio' ? 'AUDIO' : 'LOOP'}</small></span><canvas data-wave="${c.id}"></canvas><button class="trim-handle left" data-trim="left" aria-label="Trim start of ${esc(c.name)}"></button><button class="trim-handle right" data-trim="right" aria-label="Trim end of ${esc(c.name)}"></button></div>`;
  }).join('')}${t.clips.length ? '' : '<span class="lane-placeholder">Drop audio or drag a clip here</span>'}</div>`;
}

function inspector(t: Track) {
  const c = clip(); const clipMode = inspectorMode === 'clip' && c;
  const fx = clipMode ? c.effects : t.effects;
  return `<div class="inspector-mode"><button data-inspector="clip" class="${clipMode ? 'active' : ''}" ${c ? '' : 'disabled'}>Clip effects</button><button data-inspector="track" class="${clipMode ? '' : 'active'}">Layer mixer</button></div><div class="selected-channel" style="--accent:${t.color}"><div class="selected-icon">${icon(kindIcon(trackKind(t)))}</div><div><input id="${clipMode ? 'clip-name' : 'track-name'}" aria-label="${clipMode ? 'Clip' : 'Track'} name" maxlength="80" value="${esc(clipMode ? c.name : t.name)}"/><small>${clipMode ? 'SELECTED CLIP' : 'LAYER'} / ${t.id.slice(0, 4).toUpperCase()}</small></div></div>
    <div class="inspector-actions">${button(clipMode ? 'duplicate-clip' : 'duplicate', 'duplicate', clipMode ? 'Duplicate selected clip' : 'Duplicate selected layer')}${button(clipMode ? 'delete-clip' : 'delete', 'trash', clipMode ? 'Delete selected clip' : 'Delete selected layer')}<button class="text-button" data-action="reset-fx">${icon('reset')} Reset FX</button></div>
    <div class="inspector-scroll">
    ${clipMode ? cleanupControls(c) : ''}
    <div class="control-section"><div class="section-title">${clipMode ? 'CLIP GAIN' : 'CHANNEL'} <span>01</span></div>${clipMode ? slider('Clip gain', 'gain', c.gain, 0, 2, 0.01, `${Math.round(c.gain * 100)}%`) + `<button class="reverse-button" data-action="mute-clip" aria-pressed="${c.muted}">Mute this clip <span>${c.muted ? 'ON' : 'OFF'}</span></button>` : slider('Volume', 'volume', t.volume, 0, 1, 0.01, `${Math.round(t.volume * 100)}%`) + slider('Pan', 'pan', t.pan, -1, 1, 0.01, t.pan === 0 ? 'Center' : `${Math.round(Math.abs(t.pan) * 100)}${t.pan < 0 ? 'L' : 'R'}`)}</div>
    <div class="control-section"><div class="section-title">EQUALIZER <span class="fx-dot"></span></div><div class="eq-visual"><svg viewBox="0 0 220 44" aria-hidden="true"><path class="eq-grid" d="M0 11h220M0 22h220M0 33h220M44 0v44M88 0v44M132 0v44M176 0v44"/><path id="eq-curve" d="M0 ${22 - fx.low} Q55 ${22 - fx.low} 90 ${22 - fx.mid} T150 ${22 - fx.high} T220 ${22 - fx.high}"/></svg></div>${slider('Low · 200 Hz', 'fx.low', fx.low, -12, 12, 0.5, `${fx.low > 0 ? '+' : ''}${fx.low} dB`)}${slider('Mid · 1.2 kHz', 'fx.mid', fx.mid, -12, 12, 0.5, `${fx.mid > 0 ? '+' : ''}${fx.mid} dB`)}${slider('High · 5 kHz', 'fx.high', fx.high, -12, 12, 0.5, `${fx.high > 0 ? '+' : ''}${fx.high} dB`)}</div>
    <div class="control-section"><div class="section-title">SOUND SHAPING <span class="fx-dot"></span></div>${slider('Low-pass filter', 'fx.cutoff', fx.cutoff, 100, 20000, 100, `${(fx.cutoff / 1000).toFixed(1)} kHz`)}${slider('Drive', 'fx.drive', fx.drive, 0, 1, 0.01, `${Math.round(fx.drive * 100)}%`)}${slider('Compression', 'fx.compression', fx.compression, 0, 1, 0.01, `${Math.round(fx.compression * 100)}%`)}</div>
    <div class="control-section"><div class="section-title">SPACE & TEXTURE <span class="fx-dot"></span></div>${slider('Room reverb', 'fx.reverb', fx.reverb, 0, 1, 0.01, `${Math.round(fx.reverb * 100)}%`)}${slider('Dotted delay', 'fx.delay', fx.delay, 0, 1, 0.01, `${Math.round(fx.delay * 100)}%`)}</div>
    ${c ? `<div class="control-section"><div class="section-title">CLIP TOOLS <span>02</span></div>${slider('Start offset · beats', 'offset', c.offset, 0, project.bars * 4 - 0.001, 0.001, `${c.offset.toFixed(2)}`)}${slider('Trim start · seconds', 'trim', c.trim, 0, Math.max(c.trim, sourceDuration(c.sourceId) - 0.01), 0.01, `${c.trim.toFixed(2)} s`)}${slider('Duration · seconds', 'length', clipDuration(c, sourceDuration(c.sourceId)), 0.01, Math.max(0.01, (sourceDuration(c.sourceId) - c.trim) / c.rate), 0.01, `${clipDuration(c, sourceDuration(c.sourceId)).toFixed(2)} s`)}${slider('Playback speed', 'rate', c.rate, 0.5, 2, 0.05, `${c.rate.toFixed(2)}×`)}<button class="reverse-button ${c.reverse ? 'active' : ''}" data-action="reverse" aria-pressed="${c.reverse}">${icon('undo')} Reverse audio <span>${c.reverse ? 'ON' : 'OFF'}</span></button></div>` : ''}</div>`;
}

function cleanupControls(c: Clip) {
  const settings = c.cleanup;
  return `<div class="control-section repair-controls"><div class="section-title">AUDIO REPAIR <span>${settings ? settings.enabled ? 'ON' : 'BYPASSED' : 'OFF'}</span></div>${settings ? `${slider('Noise reduction', 'cleanup.noise', settings.noise, 0, 1, 0.01, `${Math.round(settings.noise * 100)}%`)}${slider('Noise floor', 'cleanup.floor', settings.floor, -80, -12, 1, `${settings.floor} dB`)}${slider('Click / pop repair', 'cleanup.declick', settings.declick, 0, 1, 0.01, `${Math.round(settings.declick * 100)}%`)}<div class="repair-actions"><button data-action="bypass-cleanup" aria-pressed="${!settings.enabled}">${icon('headphones')} ${settings.enabled ? 'Bypass / A–B' : 'Enable repair'}</button>${button('remove-cleanup', 'trash', 'Remove audio repair')}</div><p>Use lighter settings to preserve detail. Long clipping or distortion may remain.</p>` : '<button class="reverse-button" data-cleanup="clean">Add Noise + Pop Repair</button><p>Or drag an effect from Audio FX onto this clip.</p>'}</div>`;
}

function applyCleanup(preset: string, target = clip(), layer = track()) {
  if (busy || !Object.hasOwn(CLEANUP_PRESETS, preset)) return;
  if (!target || !layer) return notify('Select a clip, then add an audio repair effect.');
  const values = CLEANUP_PRESETS[preset as keyof typeof CLEANUP_PRESETS];
  edit(() => {
    const current = target.cleanup ?? defaultCleanup();
    target.cleanup = { ...current, enabled: true, noise: values.noise || current.noise, declick: values.declick || current.declick };
    selectClip(layer, target);
  }, true);
  notify(`${values.name} added. Press Play to compare, or adjust Audio Repair on the right.`);
}

async function drawWaves(version: number) {
  for (const t of project.tracks) for (const c of t.clips) {
    try {
      const content = project.sources.find(s => s.id === c.sourceId)!;
      const buffer = await engine.buffer(content, project, c.reverse);
      if (version !== revision) return;
      sourceLengths.set(content.id, buffer.duration);
      if (c.id === selectedClip) {
        const trim = document.querySelector<HTMLInputElement>('[data-control="trim"]');
        const length = document.querySelector<HTMLInputElement>('[data-control="length"]');
        if (trim) trim.max = `${Math.max(c.trim, buffer.duration - 0.01)}`;
        if (length) {
          length.max = `${Math.max(0.01, (buffer.duration - c.trim) / c.rate)}`;
          length.value = `${clipDuration(c, buffer.duration)}`;
          length.closest('label')!.querySelector('output')!.textContent = `${clipDuration(c, buffer.duration).toFixed(2)} s`;
        }
      }
      const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-wave="${c.id}"]`);
      if (!canvas) continue;
      const clip = canvas.parentElement!;
      const available = Math.max(0, Math.min(clipDuration(c, buffer.duration), duration(project) - c.offset * 60 / project.bpm));
      clip.style.width = `${available / duration(project) * 100}%`;
      const width = Math.round(canvas.clientWidth);
      canvas.width = width * devicePixelRatio; canvas.height = 42 * devicePixelRatio;
      const ctx = canvas.getContext('2d')!; ctx.scale(devicePixelRatio, devicePixelRatio);
      const pcm = buffer.getChannelData(0); const start = Math.floor(c.trim * buffer.sampleRate);
      const samples = Math.floor(available * c.rate * buffer.sampleRate);
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
  for (const t of project.tracks) {
    const layout = layoutClips(t, project.bpm, sourceDuration);
    const height = `${Math.max(70, layout.count * 60 + 10)}px`;
    document.querySelector<HTMLElement>(`.track-header[data-select="${t.id}"]`)!.style.height = height;
    document.querySelector<HTMLElement>(`[data-lane="${t.id}"]`)!.style.height = height;
    for (const c of t.clips) document.querySelector<HTMLElement>(`[data-clip="${c.id}"]`)!.style.top = `${8 + layout.rows.get(c.id)! * 60}px`;
  }
}

async function play() {
  const pending = engine.play(clone(project), cursor); render();
  try { await pending; render(); }
  catch (error) { render(); notify(error instanceof Error ? error.message : 'Could not start audio.', true); }
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

function base64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function vocalContent() {
  const source = separationSource;
  const ready = !!separatedBytes;
  document.querySelector('#vocal-content')!.innerHTML = `<div class="vocal-brand">${icon('spark')}<span>LEMIX LAB <small>LOCAL AI</small></span></div><h2>Let the music<br/>take center stage<span>.</span></h2><p>Remove vocals from a song and keep the instrumental for your next remix.</p>
    ${source ? `<div class="vocal-source">${icon('wave')}<span><strong>${esc(source.name)}</strong><small>FULL SOURCE AUDIO · ORIGINAL PRESERVED</small></span><span class="pill">STEREO</span></div>` : '<div class="vocal-empty">Select an imported audio track to get started.<br/>Your song stays on your computer.</div>'}
    ${separationRunning ? '<div class="vocal-progress"><span id="vocal-stage" aria-live="polite">Preparing your song…</span><progress id="vocal-progress" max="100" aria-label="Vocal separation progress"></progress><small>You can cancel safely. Your original track is untouched.</small></div>' : ready ? '<div class="vocal-result">✓ Your instrumental is ready.<small>Add it to the timeline, or save the complete instrumental as a WAV.</small></div>' : ''}
    ${separationError ? `<p class="vocal-error" role="alert">${esc(separationError)}</p>` : ''}
    <div class="vocal-actions">${separationRunning ? '<button class="text-button" data-action="cancel-separation">Cancel separation</button>' : ready ? `<button class="export-button" data-action="add-instrumental">${icon('plus')} Add instrumental track</button><button class="text-button" data-action="save-instrumental">${icon('export')} Save WAV</button>` : !window.lemix ? '<span class="vocal-error">Open the Electron desktop app to use local AI separation.</span>' : source ? `<button class="export-button" data-action="start-separation">${icon('spark')} Remove vocals</button>` : `<button class="export-button" data-action="vocal-import">${icon('import')} Import a song</button>`}</div>
    <div class="vocal-footnote">MDX-Net · CPU processing · No song uploads<p>Downloads a verified 67 MB model on first use, then works offline. Results depend on the mix; some vocals or artifacts may remain.</p></div>`;
  document.querySelector<HTMLButtonElement>('#vocal-dialog .dialog-close')!.disabled = separationRunning;
}

function openVocalRemover() {
  const content = source();
  separationSource = content?.kind === 'audio' ? content : undefined;
  separationClip = clip() ? cloneClip(clip()!) : undefined; separationTrackId = selected;
  separatedBytes = undefined; separationError = ''; vocalContent();
  document.querySelector<HTMLDialogElement>('#vocal-dialog')!.showModal();
}

window.lemix?.onSeparationProgress(({ stage, percent }) => {
  if (!separationRunning) return;
  const label = document.querySelector('#vocal-stage');
  if (label) label.textContent = stage === 'downloading' ? `Downloading AI model… ${percent}%` : stage === 'separating' ? `Removing vocals… ${percent}%` : 'Loading AI model…';
  const progress = document.querySelector<HTMLProgressElement>('#vocal-progress');
  if (progress) { if (stage === 'loading') progress.removeAttribute('value'); else progress.value = percent; }
});

async function removeVocals() {
  if (!separationSource || !window.lemix) return;
  await task(async () => {
    separationRunning = true; separationCanceled = false; separationError = ''; separatedBytes = undefined;
    cursor = engine.position(); engine.stop(); clearTimeout(restartTimer);
    render(); vocalContent(); document.querySelector<HTMLDialogElement>('#vocal-dialog')!.showModal();
    try {
      const buffer = await engine.buffer(separationSource!, project);
      if (buffer.numberOfChannels > 2) throw new Error('Vocal Remover supports mono or stereo audio. Downmix surround audio first.');
      const pcm = [buffer.getChannelData(0), buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1))];
      if (separationCanceled) throw new Error('Separation canceled.');
      separatedBytes = await window.lemix!.removeVocals(encodeWav(pcm, buffer.sampleRate));
    } catch (error) { separationError = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not separate this song.'; }
    finally { separationRunning = false; vocalContent(); }
  });
}

async function addInstrumental() {
  if (!separatedBytes || !separationSource || !separationClip) return;
  await task(async () => {
    if (project.tracks.length >= 24 || project.sources.length >= 128 || clipCount(project) >= 512) throw new Error('Project limit reached. Save the instrumental as WAV instead.');
    const originalTrack = project.tracks.find(t => t.id === separationTrackId);
    const originalClip = originalTrack?.clips.find(c => c.id === separationClip!.id);
    if (!originalTrack || !originalClip) throw new Error('The source clip is no longer in the project. Save WAV instead.');
    const content = createSource('audio'); content.name = `${separationClip!.name.slice(0, 64)} (Instrumental)`; content.audio = base64(separatedBytes!);
    const layer = { ...originalTrack, effects: { ...originalTrack.effects }, id: crypto.randomUUID(), name: content.name, color: COLORS[2], muted: false, clips: [{ ...cloneClip(separationClip!), id: crypto.randomUUID(), sourceId: content.id, name: content.name, muted: false }] };
    const candidate = { ...project, sources: [...project.sources, content], tracks: [...project.tracks, layer] };
    if (JSON.stringify(candidate).length > MAX_PROJECT_BYTES) throw new Error('Project would exceed 300 MB. Save WAV instead.');
    sourceLengths.set(content.id, (await engine.buffer(content, project)).duration);
    edit(() => { originalClip.muted = true; project.sources.push(content); project.tracks.push(layer); selectClip(layer, layer.clips[0]); fitTimeline(); });
    separatedBytes = undefined; notify('Instrumental added. Original clip muted and preserved.');
  });
}

async function addAudio(files: File[], target = importTarget) {
  importTarget = undefined;
  if (!files.length) return;
  await task(async () => {
    const additions: { content: Source; layer: Track; clip: Clip }[] = [];
    let beat = target?.beat ?? 0;
    for (const file of files) {
      if ((!target && project.tracks.length + additions.length >= 24) || project.sources.length + additions.length >= 128 || clipCount(project) + additions.length >= 512) throw new Error('Project layer, source or clip limit reached.');
      if (file.size > MAX_AUDIO_BYTES) throw new Error(`${file.name} exceeds 108 MB. Trim it first.`);
      const content = createSource('audio'); content.name = file.name.replace(/\.[^.]+$/, '').slice(0,80); content.audio = base64(new Uint8Array(await file.arrayBuffer()));
      const buffer = await engine.buffer(content, project); sourceLengths.set(content.id, buffer.duration);
      const layer = project.tracks.find(t => t.id === target?.trackId) ?? createLayer(project.tracks.length + additions.length, content.name);
      const c = createClip(content); c.offset = beat;
      if (c.offset >= maxBars(project.bpm) * 4) throw new Error('Audio would start beyond the maximum timeline length.');
      additions.push({ content, layer, clip: c }); if (target) beat += buffer.duration * project.bpm / 60;
    }
    const candidate = { ...project, sources: [...project.sources, ...additions.map(a => a.content)] };
    if (JSON.stringify(candidate).length > MAX_PROJECT_BYTES) throw new Error('Project would exceed 300 MB.');
    edit(() => { for (const a of additions) { project.sources.push(a.content); if (!project.tracks.includes(a.layer)) project.tracks.push(a.layer); a.layer.clips.push(a.clip); } const last = additions.at(-1)!; selectClip(last.layer, last.clip); fitTimeline(); }, true);
    notify('Audio added. Drag clips, trim their edges, or press S to split.');
  });
}

app.addEventListener('click', event => {
  const element = (event.target as HTMLElement).closest<HTMLElement>('button, [data-select], [data-select-clip]');
  if (!element) return;
  if (element.dataset.action === 'cancel-separation') { void action('cancel-separation'); return; }
  if (busy) return;
  if (element.dataset.cleanup) { applyCleanup(element.dataset.cleanup); }
  else if (element.dataset.library) { libraryTab = element.dataset.library as typeof libraryTab; document.querySelector<HTMLInputElement>('#search')!.value = ''; render(); }
  else if (element.dataset.add) {
    if (project.tracks.length >= 24 || project.sources.length >= 128 || clipCount(project) >= 512) return notify('Project layer, source or clip limit reached.', true);
    edit(() => { const item = createInstrument(element.dataset.add as TrackKind, project.tracks.length); project.sources.push(item.source); project.tracks.push(item.track); selectTrack(item.track.id); tab = 'pattern'; }, true);
  } else if (element.dataset.selectClip) { const t = project.tracks.find(t => t.clips.some(c => c.id === element.dataset.selectClip))!; selectClip(t, t.clips.find(c => c.id === element.dataset.selectClip)!); render(); }
  else if (element.dataset.inspector) { inspectorMode = element.dataset.inspector as typeof inspectorMode; render(); }
  else if (element.dataset.select) { selectTrack(element.dataset.select); render(); }
  else if (element.dataset.mute || element.dataset.solo) {
    const t = project.tracks.find(t => t.id === (element.dataset.mute ?? element.dataset.solo))!;
    edit(() => { if (element.dataset.mute) t.muted = !t.muted; else t.solo = !t.solo; }, project.tracks.some(t => t.clips.some(c => c.cleanup?.enabled)));
  } else if (element.dataset.tab) { tab = element.dataset.tab as typeof tab; render(); }
  else if (element.dataset.step) {
    const [row, step] = element.dataset.step.split(':').map(Number);
    edit(() => { const s = source()!; s.steps[row][step] = !s.steps[row][step]; }, true);
  } else if (element.dataset.note) {
    const [note, step] = element.dataset.note.split(':').map(Number);
    edit(() => { const s = source()!; s.notes[step] = s.notes[step] === note ? -1 : note; }, true);
  } else if (element.dataset.action) void action(element.dataset.action);
});

async function action(name: string) {
  switch (name) {
    case 'bypass-cleanup': if (clip()?.cleanup) edit(() => { clip()!.cleanup!.enabled = !clip()!.cleanup!.enabled; }, true); break;
    case 'remove-cleanup': if (clip()?.cleanup) edit(() => { delete clip()!.cleanup; }, true); break;
    case 'add-layer':
      if (project.tracks.length >= 24) return notify('Maximum 24 layers.', true);
      edit(() => { const layer = createLayer(project.tracks.length); project.tracks.push(layer); selectTrack(layer.id); }); break;
    case 'select-tool': timelineTool = 'select'; render(); break;
    case 'split-tool': timelineTool = 'split'; render(); break;
    case 'snap': snap = !snap; render(); break;
    case 'split-clip': splitAt(engine.playing ? engine.position() : cursor); break;
    case 'delete-clip': if (clip()) edit(() => { track()!.clips = track()!.clips.filter(c => c.id !== selectedClip); pruneSources(project); sanitizeSelection(); }, true); break;
    case 'mute-clip': if (clip()) edit(() => { clip()!.muted = !clip()!.muted; }, true); break;
    case 'duplicate-clip': {
      const t = track(); const c = clip(); if (!t || !c) return;
      if (clipCount(project) >= 512) return notify('Maximum 512 clips.', true);
      const length = clipDuration(c, sourceDuration(c.sourceId));
      if (length < 0.01) return notify('This clip has no usable audio to duplicate.', true);
      const copy = { ...cloneClip(c), id: crypto.randomUUID(), offset: c.offset + length * project.bpm / 60, length };
      if (copy.offset >= maxBars(project.bpm) * 4) return notify('No room at the end of the timeline.', true);
      edit(() => { c.length = length; t.clips.push(copy); selectClip(t, copy); fitTimeline(); }, true); break;
    }
    case 'insert-audio': if (track()) { importTarget = { trackId: selected, beat: (engine.playing ? engine.position() : cursor) * project.bpm / 60 }; document.querySelector<HTMLInputElement>('#audio-file')!.click(); } break;
    case 'vocal-remover': openVocalRemover(); break;
    case 'start-separation': await removeVocals(); break;
    case 'cancel-separation': separationCanceled = true; await window.lemix?.cancelSeparation(); break;
    case 'close-vocal': if (!separationRunning) { document.querySelector<HTMLDialogElement>('#vocal-dialog')!.close(); separatedBytes = undefined; } break;
    case 'vocal-import': document.querySelector<HTMLDialogElement>('#vocal-dialog')!.close(); document.querySelector<HTMLInputElement>('#audio-file')!.click(); break;
    case 'add-instrumental': await addInstrumental(); break;
    case 'save-instrumental': if (separatedBytes && separationSource) await task(async () => { if (await saveBytes(`${separationSource!.name.slice(0, 64)} (Instrumental)`, 'wav', separatedBytes!)) notify('Full instrumental WAV saved.'); }); break;
    case 'play': if (engine.playing || engine.preparing) pause(); else await play(); break;
    case 'stop': clearTimeout(restartTimer); engine.stop(); cursor = 0; render(); break;
    case 'loop': edit(() => { project.loop = !project.loop; }, true); break;
    case 'arrangement': document.querySelector('.arrangement')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); break;
    case 'mixer': tab = 'mixer'; render(); break;
    case 'import': importTarget = undefined; document.querySelector<HTMLInputElement>('#audio-file')!.click(); break;
    case 'open': document.querySelector<HTMLInputElement>('#project-file')!.click(); break;
    case 'new':
      if (dirty && !confirm('Start a new project? Unsaved changes will be lost.')) return;
      engine.stop(); clearTimeout(restartTimer); checkpoint();
      project = { version: 3, name: 'Untitled session', bpm: 120, bars: 8, master: 0.8, loop: true, sources: [], tracks: [] };
      selected = ''; selectedClip = ''; cursor = 0; dirty = false; document.title = 'Lemix Studio'; render(); break;
    case 'save': await task(async () => {
      const text = JSON.stringify(project); parseProject(text);
      if (await saveBytes(project.name, 'project', new TextEncoder().encode(text))) {
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
      sanitizeSelection();
      cursor = Math.min(cursor, duration(project)); changed(); render(); break;
    }
    case 'duplicate': {
      const t = track(); if (!t) return;
      if (project.tracks.length >= 24) return notify('Maximum 24 tracks per project.', true);
      if (clipCount(project) + t.clips.length > 512) return notify('Maximum 512 clips.', true);
      edit(() => { const copy = { ...t, effects: { ...t.effects }, id: crypto.randomUUID(), name: `${t.name.slice(0, 73)} (copy)`, clips: t.clips.map(c => ({ ...cloneClip(c), id: crypto.randomUUID() })) }; project.tracks.push(copy); selectTrack(copy.id); }, true); break;
    }
    case 'delete': if (track()) edit(() => { project.tracks = project.tracks.filter(t => t.id !== selected); pruneSources(project); sanitizeSelection(); }, true); break;
    case 'reverse': if (clip()) edit(() => { clip()!.reverse = !clip()!.reverse; }, true); break;
    case 'reset-fx': if (track()) edit(() => { if (inspectorMode === 'clip' && clip()) { clip()!.effects = neutralEffects(); delete clip()!.cleanup; } else track()!.effects = neutralEffects(); }, true); break;
    case 'clear-pattern': if (source()) edit(() => { source()!.steps.forEach(row => row.fill(false)); source()!.notes.fill(-1); }, true); break;
    case 'help': document.querySelector<HTMLDialogElement>('#help-dialog')!.showModal(); break;
    case 'close-help': document.querySelector<HTMLDialogElement>('#help-dialog')!.close(); break;
  }
}

app.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'search') {
    filterLibrary(input.value);
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
    if (key.startsWith('cleanup.') && clip()?.cleanup) clip()!.cleanup![key.slice(8) as 'noise' | 'floor' | 'declick'] = value;
    else if (key.startsWith('fx.')) (inspectorMode === 'clip' && clip() ? clip()!.effects : t.effects)[key.slice(3) as keyof Effects] = value;
    else if (key === 'volume' || key === 'pan') t[key] = value;
    else if (clip() && (key === 'gain' || key === 'offset' || key === 'trim' || key === 'rate' || key === 'length')) clip()![key] = value;
  }
  const output = input.closest('label')?.querySelector('output');
  if (output) output.textContent = key === 'cleanup.floor' ? `${value} dB` : key === 'fx.cutoff' ? `${(value / 1000).toFixed(1)} kHz` : key === 'rate' ? `${value.toFixed(2)}×` : key === 'trim' || key === 'length' ? `${value.toFixed(2)} s` : key === 'offset' ? `${value}` : key === 'pan' ? value === 0 ? 'Center' : `${Math.round(Math.abs(value) * 100)}${value < 0 ? 'L' : 'R'}` : key && ['fx.low', 'fx.mid', 'fx.high'].includes(key) ? `${value > 0 ? '+' : ''}${value} dB` : `${Math.round(value * 100)}%`;
  changed(inspectorMode === 'clip' || key === 'offset' || key === 'trim' || key === 'rate' || key === 'length');
});

app.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.type === 'range') { editing = false; if (['offset','length','rate'].includes(input.dataset.control ?? '')) fitTimeline(); render(); return; }
  if (busy) return;
  if (input.id === 'project-name') edit(() => { project.name = input.value.trim().slice(0, 80) || 'Untitled session'; });
  if (input.id === 'clip-name' && clip()) edit(() => { clip()!.name = input.value.trim().slice(0, 80) || 'Untitled clip'; });
  if (input.id === 'track-name' && track()) edit(() => { track()!.name = input.value.trim().slice(0, 80) || 'Untitled track'; });
  if (input.id === 'bpm') {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 40 || value > 240) { notify('Tempo must be between 40 and 240 BPM.', true); render(); return; }
    edit(() => { project.bpm = value; project.bars = Math.min(project.bars, maxBars(value)); project.tracks.forEach(t => t.clips.forEach(c => { c.offset = Math.min(c.offset, project.bars * 4 - 0.001); })); cursor = Math.min(cursor, duration(project)); }, true);
  }
  if (input.id === 'bars') edit(() => { project.bars = Number(input.value); project.tracks.forEach(t => t.clips.forEach(c => { c.offset = Math.min(c.offset, project.bars * 4 - 0.001); })); cursor = Math.min(cursor, duration(project)); }, true);
  if (input.id === 'audio-file') void addAudio(Array.from(input.files ?? []));
  if (input.id === 'project-file' && input.files?.[0]) {
    const file = input.files[0];
    void task(async () => {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Project exceeds 300 MB.');
      const loaded = parseProject(await file.text());
      await engine.prepare(loaded);
      if (dirty && !confirm('Open this project? Unsaved changes will be lost.')) return;
      engine.stop(); clearTimeout(restartTimer); checkpoint(); project = loaded; selectTrack(loaded.tracks[0]?.id ?? ''); cursor = 0; dirty = false;
      document.title = `${project.name} — Lemix Studio`; render(); notify('Project loaded. Pick up where you left off.');
    });
  }
});

function beatAt(clientX: number) {
  const bounds = document.querySelector('.timeline')!.getBoundingClientRect();
  return Math.max(0, Math.min(project.bars * 4 - 0.001, (clientX - bounds.left) / bounds.width * project.bars * 4));
}
function splitAt(seconds: number) {
  const t = track(); const c = clip(); if (!t || !c) return;
  if (clipCount(project) >= 512) return notify('Maximum 512 clips.', true);
  const point = snapBeat(seconds * project.bpm / 60, snap) * 60 / project.bpm;
  const left = point - c.offset * 60 / project.bpm;
  if (left < 0.01 || clipDuration(c, sourceDuration(c.sourceId)) - left < 0.01) return notify('Place the playhead inside the selected clip to split.');
  edit(() => { const right = splitClip(t, c, point, project.bpm, sourceDuration(c.sourceId))!; selectClip(t, right); }, true);
}
app.addEventListener('pointerdown', event => {
  const target = event.target as HTMLElement; if (busy || event.button !== 0) return;
  if (target.closest('.ruler')) { cursor = beatAt(event.clientX) * 60 / project.bpm; if (engine.playing) void play(); else render(); return; }
  const element = target.closest<HTMLElement>('[data-clip]');
  if (!element) { const lane = target.closest<HTMLElement>('[data-lane]'); if (lane) { selectTrack(lane.dataset.lane!); cursor = beatAt(event.clientX) * 60 / project.bpm; if (engine.playing) void play(); else render(); } return; }
  const from = project.tracks.find(t => t.clips.some(c => c.id === element.dataset.clip))!;
  const c = from.clips.find(c => c.id === element.dataset.clip)!; selectClip(from,c);
  const side = target.closest<HTMLElement>('[data-trim]')?.dataset.trim as 'left' | 'right' | undefined;
  if (timelineTool === 'split' && !side) { splitAt(beatAt(event.clientX) * 60 / project.bpm); return; }
  event.preventDefault();
  if (event.isTrusted) app.setPointerCapture(event.pointerId);
  const original = cloneClip(c); const sourceSeconds = sourceDuration(c.sourceId);
  const x = event.clientX; const y = event.clientY;
  const scroll = document.querySelector<HTMLElement>('.arranger-scroll')!; const initialScroll = scroll.scrollLeft;
  const width = document.querySelector('.timeline')!.getBoundingClientRect().width;
  let moved = false; let draft = cloneClip(c); let destination = from;
  const move = (event: PointerEvent) => {
    if (!moved && Math.abs(event.clientX-x) + Math.abs(event.clientY-y) < 4) return;
    moved = true; element.classList.add('drag-preview');
    const scrollBounds = scroll.getBoundingClientRect();
    if (event.clientX > scrollBounds.right - 18) scroll.scrollLeft += 14;
    if (event.clientX < scrollBounds.left + 18) scroll.scrollLeft -= 14;
    const delta = (event.clientX - x + scroll.scrollLeft - initialScroll) / width * project.bars * 4;
    draft = cloneClip(original);
    if (side) {
      const edge = side === 'left' ? original.offset : original.offset + clipDuration(original,sourceSeconds) * project.bpm / 60;
      trimClip(draft,side,snapBeat(edge + delta,snap),project.bpm,sourceSeconds);
      if (side === 'right') draft.length = Math.min(draft.length!, (project.bars * 4 - draft.offset) * 60 / project.bpm);
    } else {
      draft.length = clipDuration(original,sourceSeconds);
      draft.offset = Math.max(0, Math.min(project.bars * 4 - 0.001, snapBeat(original.offset+delta,snap)));
      const lane = [...document.querySelectorAll<HTMLElement>('[data-lane]')].find(el => { const bounds=el.getBoundingClientRect(); return event.clientY>=bounds.top && event.clientY<bounds.bottom; });
      if (lane) { destination = project.tracks.find(t => t.id===lane.dataset.lane)!; lane.appendChild(element); }
    }
    element.style.left = `${draft.offset / (project.bars*4)*100}%`;
    element.style.width = `${clipDuration(draft,sourceSeconds)/duration(project)*100}%`;
    if (destination!==from) element.style.top='8px';
  };
  const up = (event: PointerEvent) => {
    document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up); document.removeEventListener('pointercancel',up);
    if (moved && event.type !== 'pointercancel') edit(() => { moveClip(project,c,from,destination,draft.offset); Object.assign(c,draft); selectClip(destination,c); fitTimeline(); },true);
    else render();
  };
  document.addEventListener('pointermove',move); document.addEventListener('pointerup',up,{once:true}); document.addEventListener('pointercancel',up,{once:true});
});

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (target.closest('dialog') || busy) return;
  if ((event.ctrlKey || event.metaKey) && ['s', 'o'].includes(event.key.toLowerCase())) {
    event.preventDefault(); target.blur(); void action(event.key.toLowerCase() === 's' ? 'save' : 'open'); return;
  }
  if (target.closest('input, select, textarea')) return;
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.key.toLowerCase() === 's') { event.preventDefault(); void action('split-clip'); }
    if (event.key.toLowerCase() === 'v') void action('select-tool');
    if (event.key.toLowerCase() === 'c') void action('split-tool');
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); void action('delete-clip'); }
    if (event.key === 'Enter' && target.matches('[data-select-clip]')) target.click();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); void action('duplicate-clip'); }
  if (event.code === 'Space' && !target.closest('button')) { event.preventDefault(); void action('play'); }
  if ((event.ctrlKey || event.metaKey) && ['s', 'o', 'z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    void action(event.key.toLowerCase() === 's' ? 'save' : event.key.toLowerCase() === 'o' ? 'open' : event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo');
  }
});
app.addEventListener('cancel', event => {
  if ((event.target as HTMLElement).id === 'vocal-dialog' && separationRunning) { event.preventDefault(); void action('cancel-separation'); }
}, true);
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
const repairMime = 'application/x-lemix-cleanup';
function clearDropTargets() { document.querySelectorAll('.repair-drop-target').forEach(element => element.classList.remove('repair-drop-target')); }
app.addEventListener('dragstart', event => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-cleanup]');
  if (card && event.dataTransfer) { event.dataTransfer.setData(repairMime, card.dataset.cleanup!); event.dataTransfer.effectAllowed = 'copy'; }
});
window.addEventListener('dragend', clearDropTargets);
window.addEventListener('dragover', event => {
  event.preventDefault();
  if (event.dataTransfer?.types.includes('Files')) document.body.classList.add('dragging');
  if (event.dataTransfer?.types.includes(repairMime)) {
    clearDropTargets(); (event.target as HTMLElement).closest('[data-clip]')?.classList.add('repair-drop-target');
    event.dataTransfer.dropEffect = 'copy';
  }
});
window.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', event => {
  event.preventDefault(); document.body.classList.remove('dragging'); clearDropTargets();
  if (event.dataTransfer?.types.includes(repairMime)) {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-clip]');
    const layer = project.tracks.find(t => t.clips.some(c => c.id === target?.dataset.clip));
    if (!target || !layer) { notify('Drop the repair effect directly onto an audio clip.'); return; }
    applyCleanup(event.dataTransfer.getData(repairMime), layer.clips.find(c => c.id === target.dataset.clip), layer); return;
  }
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.some(file => /\.(lemix|json)$/i.test(file.name))) return notify('Use Open project to load a .lemix file.');
  const lane = (event.target as HTMLElement).closest<HTMLElement>('[data-lane]');
  importTarget = undefined;
  void addAudio(files, lane ? { trackId: lane.dataset.lane!, beat: snapBeat(beatAt(event.clientX), snap) } : undefined);
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

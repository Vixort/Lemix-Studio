import { app, dialog } from 'electron';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts');
await mkdir(output, { recursive: true });
app.setPath('userData', path.join(output, 'test-profile'));
dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: path.join(output, options.filters[0].extensions[0] === 'wav' ? 'test-mix.wav' : 'test-project.lemix') });
dialog.showMessageBoxSync = () => 1;
const timeout = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 60000);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

app.on('browser-window-created', (_event, window) => {
  window.hide();
  const errors = [];
  window.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  window.webContents.on('did-fail-load', (_event, code, message) => errors.push(`${code}: ${message}`));
  window.webContents.once('did-finish-load', async () => {
    const run = code => window.webContents.executeJavaScript(code, true);
    const click = async selector => {
      assert.ok(await run(`!!document.querySelector(${JSON.stringify(selector)})`), `Missing control: ${selector}`);
      return run(`document.querySelector(${JSON.stringify(selector)}).click()`);
    };
    const count = () => run(`document.querySelectorAll('.track-header').length`);
    const waitFor = async (expression, message) => {
      for (let i = 0; i < 150; i++) { if (await run(expression)) return; await sleep(100); }
      throw new Error(message);
    };
    const control = async (name, value) => run(`{ const el=document.querySelector('[data-control="${name}"]'); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }`);
    try {
      await waitFor(`document.querySelectorAll('canvas').length === 4 && [...document.querySelectorAll('canvas')].every(c=>c.width>0)`, 'Waveforms did not render');
      assert.equal(await count(), 4);
      const preferences = window.webContents.getLastWebPreferences();
      assert.equal(preferences.contextIsolation, true); assert.equal(preferences.sandbox, true); assert.equal(preferences.nodeIntegration, false);
      assert.equal(window.webContents.getBackgroundThrottling(), false);
      assert.equal(await run(`typeof window.lemix.saveFile`), 'function');
      assert.equal(await run(`typeof window.process`), 'undefined');
      window.showInactive();
      await sleep(500);
      await writeFile(path.join(output, 'studio.png'), (await window.webContents.capturePage()).toPNG());
      window.hide();
      console.log('PASS: secure Electron window and four rendered demo tracks');

      await click('[data-add="bass"]'); assert.equal(await count(), 5);
      await click('[data-action="undo"]'); assert.equal(await count(), 4);
      await click('[data-action="redo"]'); assert.equal(await count(), 5);
      await run(`document.querySelectorAll('.track-name')[4].click()`);
      await click('[data-action="delete"]'); assert.equal(await count(), 4);
      await click('[data-step="0:1"]');
      assert.equal(await run(`document.querySelector('[data-step="0:1"]').getAttribute('aria-pressed')`), 'true');
      await click('[data-action="undo"]');
      assert.equal(await run(`document.querySelector('[data-step="0:1"]').getAttribute('aria-pressed')`), 'false');
      await run(`document.querySelectorAll('.track-name')[1].click()`);
      await click('[data-note="3:1"]');
      assert.equal(await run(`document.querySelector('[data-note="3:1"]').getAttribute('aria-pressed')`), 'true');
      await click('[data-action="undo"]');
      assert.equal(await run(`document.querySelector('[data-note="3:1"]').getAttribute('aria-pressed')`), 'false');
      await run(`document.querySelectorAll('.track-name')[0].click()`);
      await run(`{ const clip=document.querySelector('[data-clip]'); const bounds=clip.getBoundingClientRect(); const width=document.querySelector('.timeline').getBoundingClientRect().width; clip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:bounds.left+20})); document.dispatchEvent(new PointerEvent('pointermove',{clientX:bounds.left+20+width/16})); document.dispatchEvent(new PointerEvent('pointerup')); }`);
      assert.equal(await run(`Number(document.querySelector('[data-control="offset"]').value)`), 2);
      await click('[data-action="undo"]');
      await click('[data-mute]'); assert.equal(await run(`document.querySelector('[data-mute]').getAttribute('aria-pressed')`), 'true');
      await click('[data-mute]');
      await run(`document.querySelectorAll('[data-solo]')[1].click()`);
      assert.equal(await run(`document.querySelectorAll('[data-solo]')[1].getAttribute('aria-pressed')`), 'true');
      await run(`document.querySelectorAll('[data-solo]')[1].click()`);
      await control('volume', '0.4'); await control('fx.low', '3'); await control('fx.drive', '0.2');
      await click('[data-action="save"]');
      await waitFor(`document.querySelector('#save-state').textContent === 'Ready to create'`, 'Project did not save');
      const saved = JSON.parse(await readFile(path.join(output, 'test-project.lemix'), 'utf8'));
      assert.equal(saved.tracks[0].volume, 0.4); assert.equal(saved.tracks[0].effects.low, 3); assert.equal(saved.tracks[0].effects.drive, 0.2);
      console.log('PASS: patterns, mute/solo, effects, undo/redo and native project saving');

      // Import a generated WAV through the same file input a person uses.
      const wave = Buffer.alloc(44 + 44100 * 2);
      wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
      wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
      wave.writeUInt32LE(44100, 24); wave.writeUInt32LE(88200, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
      wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
      for (let i = 0; i < 44100; i++) wave.writeInt16LE(Math.round(Math.sin(i / 44100 * 440 * 2 * Math.PI) * 7000), 44 + i * 2);
      await run(`{ const bytes=Uint8Array.from(atob(${JSON.stringify(wave.toString('base64'))}),c=>c.charCodeAt(0)); const files=new DataTransfer(); files.items.add(new File([bytes],'test-tone.wav',{type:'audio/wav'})); const input=document.querySelector('#audio-file'); input.files=files.files; input.dispatchEvent(new Event('change',{bubbles:true})); }`);
      await waitFor(`document.querySelectorAll('.track-header').length === 5 && !document.body.classList.contains('busy')`, 'Audio did not import');
      await click('[data-action="reverse"]'); await control('offset', '0.25'); await control('trim', '0.1'); await control('rate', '1.25');
      await click('[data-action="play"]');
      await waitFor(`document.querySelector('.play-button').classList.contains('playing')`, 'Transport did not start');
      await waitFor(`parseFloat(document.querySelector('#meter-fill').style.width)>0`, 'Playback produced no meter signal');
      await sleep(400);
      assert.notEqual(await run(`document.querySelector('#time').textContent`), '00:00.00');
      await click('[data-action="stop"]');
      assert.equal(await run(`document.querySelector('#time').textContent`), '00:00.00');
      console.log('PASS: WAV import, reverse/trim/speed and realtime transport output');

      await click('[data-action="export"]');
      await waitFor(`!document.body.classList.contains('busy')`, 'WAV export did not finish');
      const mix = await readFile(path.join(output, 'test-mix.wav'));
      assert.equal(mix.toString('ascii', 0, 4), 'RIFF'); assert.equal(mix.readUInt16LE(22), 2); assert.equal(mix.readUInt32LE(24), 44100);
      assert.equal(mix.length - 44, Math.ceil((8 * 4 * 60 / 112 + 2) * 44100) * 4);
      let peak = 0; for (let i = 44; i < mix.length; i += 2) peak = Math.max(peak, Math.abs(mix.readInt16LE(i)));
      assert.ok(peak > 1000, `Silent export: peak ${peak}`);
      await click('[data-action="save"]'); await waitFor(`!document.body.classList.contains('busy')`, 'Save did not complete');
      const withAudio = await readFile(path.join(output, 'test-project.lemix'), 'utf8');
      assert.equal(JSON.parse(withAudio).tracks[4].audio, wave.toString('base64'));
      await click('[data-action="delete"]'); assert.equal(await count(), 4);
      await run(`{ window.confirm=()=>true; const files=new DataTransfer(); files.items.add(new File([${JSON.stringify(withAudio)}],'roundtrip.lemix')); const input=document.querySelector('#project-file'); input.files=files.files; input.dispatchEvent(new Event('change',{bubbles:true})); }`);
      await waitFor(`document.querySelectorAll('.track-header').length===5 && !document.body.classList.contains('busy')`, 'Project did not reopen with embedded audio');
      assert.equal(await run(`window.lemix.saveFile('bad','invalid',new Uint8Array([1])).then(()=>false,()=>true)`), true);
      console.log(`PASS: non-silent stereo WAV export (${mix.length} bytes), embedded sample round trip and IPC validation`);

      await run(`{ const bpm=document.querySelector('#bpm'); bpm.value='240'; bpm.dispatchEvent(new Event('change',{bubbles:true})); const bars=document.querySelector('#bars'); bars.value='1'; bars.dispatchEvent(new Event('change',{bubbles:true})); }`);
      await click('[data-action="play"]');
      await waitFor(`document.querySelector('.play-button').classList.contains('playing')`, 'Loop test did not start');
      await sleep(2200);
      assert.equal(await run(`document.querySelector('.play-button').classList.contains('playing')`), true);
      assert.ok(await run(`parseFloat(document.querySelector('#meter-fill').style.width)>0`));
      await click('[data-action="loop"]');
      await waitFor(`!document.querySelector('.play-button').classList.contains('playing')`, 'Non-looped transport did not stop');
      await run(`{ let button; while((button=document.querySelector('[data-mute][aria-pressed="false"]'))) button.click(); }`);
      await click('[data-action="export"]');
      await waitFor(`!document.body.classList.contains('busy')`, 'Muted export did not finish');
      const silent = await readFile(path.join(output, 'test-mix.wav'));
      assert.ok(silent.subarray(44).every(byte => byte === 0), 'Muted tracks leaked into WAV export');
      console.log('PASS: piano notes, clip dragging, repeated loops, non-loop ending and silent muted export');
      assert.deepEqual(errors, []);
      clearTimeout(timeout); console.log('All Electron smoke checks passed. Screenshot: artifacts/studio.png'); app.exit(0);
    } catch (error) { clearTimeout(timeout); console.error(error, errors); app.exit(1); }
  });
});
await import(process.argv.includes('--packaged') ? '../release/win-unpacked/resources/app.asar/dist-electron/main.js' : '../dist-electron/main.js');

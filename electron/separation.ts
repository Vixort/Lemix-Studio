import { app, ipcMain, utilityProcess, shell } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { validateSeparationInput } from './separation-dsp.js';
import { SEPARATION_MODELS, LOCAL_MODELS, separationModel, separationContext, mvsepUrl } from './separation-models.js';
import type { LocalModel, LocalModelId } from './separation-models.js';
import { downloadModel, validModel } from './model-download.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
let active: { sender: number; controller: AbortController } | undefined;

async function runtimeModel(file: string, graph?: string) {
  if (!graph) return file;
  const target = path.join(path.dirname(file), graph);
  await writeFile(target, gunzipSync(await readFile(path.join(directory, '../electron-assets', `${graph}.gz`))));
  return target;
}

async function ensureModel(id: LocalModelId, seconds: 4 | 8, signal: AbortSignal, progress: (stage: string, percent: number, detail?: string) => void) {
  const info: LocalModel = LOCAL_MODELS[id];
  const folder = path.join(app.getPath('userData'), 'models');
  await mkdir(folder, { recursive: true });
  const total = info.files.reduce((sum, file) => sum + file.bytes, 0); let downloaded = 0;
  for (const file of info.files) {
    const target = path.join(folder, file.file);
    if (!await validModel(target, file.hash, signal)) {
      progress('downloading', Math.floor(downloaded / total * 100), info.name);
      await downloadModel(file, target, signal, percent => progress('downloading', Math.floor((downloaded + file.bytes * percent / 100) / total * 100), info.name));
    }
    signal.throwIfAborted();
    downloaded += file.bytes;
  }
  return runtimeModel(path.join(folder, info.files[0].file), seconds === 4 ? info.graph4 : info.graph8);
}

export function registerSeparation(trustedWindow: (event: IpcMainInvokeEvent) => BrowserWindow) {
  ipcMain.handle('vocal-open-website', async (event, id: unknown) => { trustedWindow(event); await shell.openExternal(mvsepUrl(id)); });
  ipcMain.handle('vocal-cancel', event => {
    trustedWindow(event);
    if (active?.sender === event.sender.id) active.controller.abort(new Error('Separation canceled.'));
  });
  ipcMain.handle('vocal-start', async (event, value: unknown, requestedModel: unknown, requestedContext: unknown) => {
    const window = trustedWindow(event);
    if (active) throw new Error('Another song is already being separated.');
    const frames = validateSeparationInput(value);
    const modelId = separationModel(requestedModel);
    const seconds = separationContext(requestedContext);
    const selection = SEPARATION_MODELS[modelId];
    const bytes = value as Uint8Array;
    const controller = new AbortController(); const { signal } = controller;
    active = { sender: event.sender.id, controller };
    const cancel = () => controller.abort(new Error('Separation canceled.'));
    window.once('closed', cancel);
    const timeoutMs = modelId === 'mdx' ? 30 * 60 * 1000 : Math.max(30 * 60 * 1000, frames / 44100 * (seconds === 8 ? 90 : 45) * 1000 * selection.members.length);
    const timeout = setTimeout(() => controller.abort(new Error('Separation timed out. Try a shorter song.')), timeoutMs);
    let lastStage = ''; let lastPercent = -1; let lastDetail = '';
    const progress = (stage: string, percent: number, detail = '') => {
      if (event.sender.isDestroyed() || stage === lastStage && percent === lastPercent && detail === lastDetail) return;
      lastStage = stage; lastPercent = percent; lastDetail = detail;
      event.sender.send('vocal-progress', { stage, percent, detail });
    };
    const folder = path.join(app.getPath('userData'), 'separation-jobs', randomUUID());
    const input = path.join(folder, 'input.wav'); const output = path.join(folder, 'instrumental.wav');
    try {
      progress('loading', 0);
      const models: { id: LocalModelId; file: string }[] = [];
      for (const id of selection.members) models.push({ id, file: await ensureModel(id, seconds, signal, progress) });
      signal.throwIfAborted();
      await mkdir(folder, { recursive: true }); await writeFile(input, bytes, { flag: 'wx' });
      signal.throwIfAborted();
      const child = utilityProcess.fork(path.join(directory, 'separation-worker.js'), [], { serviceName: 'Lemix Vocal Remover', stdio: 'pipe' });
      const exited = once(child, 'exit');
      try {
        await new Promise<void>((resolve, reject) => {
          const abort = () => { child.kill(); reject(signal.reason); };
          signal.addEventListener('abort', abort, { once: true });
          child.once('spawn', () => { if (signal.aborted) abort(); else child.postMessage({ input, output, models, seconds }); });
          child.on('message', message => {
            if (message.done === true) resolve();
            else if (typeof message.error === 'string') reject(new Error(message.error));
            else if (['loading', 'separating'].includes(message.stage) && Number.isFinite(message.percent)) progress(message.stage, message.percent, typeof message.detail === 'string' ? message.detail.slice(0, 120) : '');
          });
          child.once('exit', code => { signal.removeEventListener('abort', abort); reject(new Error(`Audio worker stopped unexpectedly (${code}).`)); });
          child.stderr?.on('data', () => {});
        });
      } finally { child.kill(); await exited; }
      signal.throwIfAborted();
      const result = new Uint8Array(await readFile(output));
      if (result.length !== bytes.length) throw new Error('The separated audio has an unexpected length.');
      return result;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw error;
    } finally {
      clearTimeout(timeout); window.removeListener('closed', cancel); active = undefined;
      await Promise.all([unlink(input).catch(() => undefined), unlink(output).catch(() => undefined)]);
      await rmdir(folder).catch(() => undefined);
    }
  });
}

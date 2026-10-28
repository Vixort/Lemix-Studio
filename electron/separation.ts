import { app, ipcMain, utilityProcess } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_HASH, MODEL_NAME, decodeSeparationInput } from './separation-dsp.js';

const MODEL_URL = `https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/${MODEL_NAME}`;
const directory = path.dirname(fileURLToPath(import.meta.url));
let active: { sender: number; controller: AbortController } | undefined;

async function validModel(file: string) {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === MODEL_HASH;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function ensureModel(signal: AbortSignal, progress: (stage: string, percent: number) => void) {
  const folder = path.join(app.getPath('userData'), 'models');
  const model = path.join(folder, MODEL_NAME);
  if (await validModel(model)) return model;
  signal.throwIfAborted();
  await mkdir(folder, { recursive: true });
  const temporary = path.join(folder, `${randomUUID()}.download`);
  progress('downloading', 0);
  try {
    const response = await fetch(MODEL_URL, { signal: AbortSignal.any([signal, AbortSignal.timeout(300000)]) });
    if (!response.ok || !response.body) throw new Error('Cannot download the AI model. Check your connection and try again.');
    const total = Number(response.headers.get('content-length'));
    let received = 0;
    const hash = createHash('sha256');
    const monitor = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > 80 * 1024 * 1024) return callback(new Error('AI model exceeds the expected download size.'));
      hash.update(chunk);
      progress('downloading', total > 0 ? Math.min(99, Math.floor(received / total * 100)) : 0);
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), monitor, createWriteStream(temporary, { flags: 'wx' }), { signal });
    if (hash.digest('hex') !== MODEL_HASH) throw new Error('AI model checksum failed. Please try downloading again.');
    signal.throwIfAborted();
    await rename(temporary, model);
    return model;
  } finally { await unlink(temporary).catch(() => undefined); }
}

export function registerSeparation(trustedWindow: (event: IpcMainInvokeEvent) => BrowserWindow) {
  ipcMain.handle('vocal-cancel', event => {
    trustedWindow(event);
    if (active?.sender === event.sender.id) active.controller.abort(new Error('Separation canceled.'));
  });
  ipcMain.handle('vocal-start', async (event, value: unknown) => {
    const window = trustedWindow(event);
    if (active) throw new Error('Another song is already being separated.');
    decodeSeparationInput(value);
    const bytes = value as Uint8Array;
    const controller = new AbortController(); const { signal } = controller;
    active = { sender: event.sender.id, controller };
    const cancel = () => controller.abort(new Error('Separation canceled.'));
    window.once('closed', cancel);
    const timeout = setTimeout(() => controller.abort(new Error('Separation timed out. Try a shorter song.')), 30 * 60 * 1000);
    let lastStage = ''; let lastPercent = -1;
    const progress = (stage: string, percent: number) => {
      if (event.sender.isDestroyed() || stage === lastStage && percent === lastPercent) return;
      lastStage = stage; lastPercent = percent;
      event.sender.send('vocal-progress', { stage, percent });
    };
    const folder = path.join(app.getPath('userData'), 'separation-jobs', randomUUID());
    const input = path.join(folder, 'input.wav'); const output = path.join(folder, 'instrumental.wav');
    try {
      progress('loading', 0);
      const model = await ensureModel(signal, progress);
      signal.throwIfAborted();
      await mkdir(folder, { recursive: true }); await writeFile(input, bytes, { flag: 'wx' });
      signal.throwIfAborted();
      const child = utilityProcess.fork(path.join(directory, 'separation-worker.js'), [], { serviceName: 'Lemix Vocal Remover', stdio: 'pipe' });
      const exited = once(child, 'exit');
      try {
        await new Promise<void>((resolve, reject) => {
          const abort = () => { child.kill(); reject(signal.reason); };
          signal.addEventListener('abort', abort, { once: true });
          child.once('spawn', () => { if (signal.aborted) abort(); else child.postMessage({ input, output, model }); });
          child.on('message', message => {
            if (message.done === true) resolve();
            else if (typeof message.error === 'string') reject(new Error(message.error));
            else if (['loading', 'separating'].includes(message.stage) && Number.isFinite(message.percent)) progress(message.stage, message.percent);
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

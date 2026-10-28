import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IpcMainInvokeEvent } from 'electron';
import { registerSeparation } from './separation.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
if (devUrl && devUrl !== 'http://127.0.0.1:5173') throw new Error('Invalid development URL');

function trustedWindow(event: IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const expectedUrl = devUrl ? new URL(devUrl).href : new URL('../dist/index.html', import.meta.url).href;
  if (!window || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== expectedUrl) throw new Error('Untrusted request');
  return window;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1510, height: 970, minWidth: 1080, minHeight: 760,
    backgroundColor: '#101116', title: 'Lemix Studio',
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0,
      title: 'Unsaved project', message: 'Close Lemix Studio without saving your changes?',
    });
    if (choice === 1) event.preventDefault();
  });
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(path.join(directory, '../dist/index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  registerSeparation(trustedWindow);
  ipcMain.handle('save-file', async (event, value: unknown) => {
    const window = trustedWindow(event);
    if (!value || typeof value !== 'object') throw new Error('Invalid save request');
    const { name, kind, bytes } = value as Record<string, unknown>;
    if (typeof name !== 'string' || name.length > 160 || !['project', 'wav'].includes(String(kind)) ||
        !(bytes instanceof Uint8Array) || bytes.byteLength > (kind === 'project' ? 300 : 200) * 1024 * 1024) {
      throw new Error('Invalid file data or file exceeds the size limit');
    }
    const extension = kind === 'wav' ? 'wav' : 'lemix';
    const result = await dialog.showSaveDialog(window, {
      defaultPath: `${path.basename(name).replace(/[<>:"/\\|?*]/g, '_')}.${extension}`,
      filters: [{ name: kind === 'wav' ? 'WAV audio' : 'Lemix project', extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return false;
    const temporary = `${result.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, result.filePath);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return true;
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

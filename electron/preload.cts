import { contextBridge, ipcRenderer } from 'electron';
import type { SeparationModel, MvsepModel } from './separation-models.js';

contextBridge.exposeInMainWorld('lemix', {
  saveFile: (name: string, kind: 'project' | 'wav', bytes: Uint8Array): Promise<boolean> =>
    ipcRenderer.invoke('save-file', { name, kind, bytes }),
  removeVocals: (bytes: Uint8Array, model?: SeparationModel, seconds?: 4 | 8): Promise<Uint8Array> => ipcRenderer.invoke('vocal-start', bytes, model, seconds),
  openSeparationWebsite: (model: MvsepModel): Promise<void> => ipcRenderer.invoke('vocal-open-website', model),
  cancelSeparation: (): Promise<void> => ipcRenderer.invoke('vocal-cancel'),
  onSeparationProgress: (callback: (value: { stage: string; percent: number; detail?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { stage: string; percent: number; detail?: string }) => callback(value);
    ipcRenderer.on('vocal-progress', listener);
    return () => ipcRenderer.removeListener('vocal-progress', listener);
  },
});

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lemix', {
  saveFile: (name: string, kind: 'project' | 'wav', bytes: Uint8Array): Promise<boolean> =>
    ipcRenderer.invoke('save-file', { name, kind, bytes }),
  removeVocals: (bytes: Uint8Array, model?: 'mdx' | 'bs-roformer'): Promise<Uint8Array> => ipcRenderer.invoke('vocal-start', bytes, model),
  cancelSeparation: (): Promise<void> => ipcRenderer.invoke('vocal-cancel'),
  onSeparationProgress: (callback: (value: { stage: string; percent: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { stage: string; percent: number }) => callback(value);
    ipcRenderer.on('vocal-progress', listener);
    return () => ipcRenderer.removeListener('vocal-progress', listener);
  },
});

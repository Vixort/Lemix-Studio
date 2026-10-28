import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lemix', {
  saveFile: (name: string, kind: 'project' | 'wav', bytes: Uint8Array): Promise<boolean> =>
    ipcRenderer.invoke('save-file', { name, kind, bytes }),
});

interface Window {
  lemix?: {
    saveFile(name: string, kind: 'project' | 'wav', bytes: Uint8Array): Promise<boolean>;
  };
}

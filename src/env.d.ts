interface Window {
  lemix?: {
    saveFile(name: string, kind: 'project' | 'wav', bytes: Uint8Array): Promise<boolean>;
    removeVocals(bytes: Uint8Array): Promise<Uint8Array>;
    cancelSeparation(): Promise<void>;
    onSeparationProgress(callback: (value: { stage: string; percent: number }) => void): () => void;
  };
}

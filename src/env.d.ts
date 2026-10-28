interface Window {
  lemix?: {
    saveFile(name: string, kind: 'project' | 'wav', bytes: Uint8Array): Promise<boolean>;
    removeVocals(bytes: Uint8Array, model?: import('../electron/separation-models.ts').SeparationModel, seconds?: 4 | 8): Promise<Uint8Array>;
    openSeparationWebsite(model: import('../electron/separation-models.ts').MvsepModel): Promise<void>;
    cancelSeparation(): Promise<void>;
    onSeparationProgress(callback: (value: { stage: string; percent: number; detail?: string }) => void): () => void;
  };
}

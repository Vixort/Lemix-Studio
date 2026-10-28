import type { ModelFile } from './model-download.js';

export interface LocalModel {
  name: string;
  format: 'mdx' | 'roformer-time' | 'roformer-frequency';
  graph4?: string;
  graph8?: string;
  files: readonly ModelFile[];
}

const viperBase = 'https://huggingface.co/xycld/BS-RoFormer-ONNX/resolve/f020228f4d25616c8ff4146c339c33687c0be43f/';
export const LOCAL_MODELS = {
  mdx: {
    name: 'MDX-Net Inst HQ 3', format: 'mdx', files: [{
      file: 'UVR-MDX-NET-Inst_HQ_3.onnx',
      url: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Inst_HQ_3.onnx',
      hash: '317554b07fe1ea5279a77f2b1520a41ea4b93432560c4ffd08792c30fddf9adc', bytes: 66759214,
    }],
  },
  'bs-roformer': {
    name: 'BS-RoFormer ViperX uint8', format: 'roformer-time', graph4: 'bs-roformer-viperx-t401.onnx', files: [{
      file: 'bs_roformer_ep317_sdr12.9755_quantized_uint8.onnx',
      url: `${viperBase}bs_roformer_ep317_sdr12.9755_quantized_uint8.onnx`,
      hash: 'b86b6224ff34d6d34c2530e0d41495b6a2c12db46acc1a7a5c7f64d2352807e9', bytes: 165858657,
    }],
  },
  'bs-roformer-full': {
    name: 'BS-RoFormer ViperX FP32', format: 'roformer-time', graph4: 'bs-roformer-viperx-fp32-t401.onnx', graph8: 'bs-roformer-viperx-fp32-t801.onnx', files: [{
      file: 'bs_roformer_ep317_sdr12.9755.onnx', url: `${viperBase}bs_roformer_ep317_sdr12.9755.onnx`,
      hash: '357837834747cbf3cd680bfab33f9bfd08b99d493d8dfabc84b92e59e4fcfe73', bytes: 4870922,
    }, {
      file: 'bs_roformer_ep317_sdr12.9755.onnx.data', url: `${viperBase}bs_roformer_ep317_sdr12.9755.onnx.data`,
      hash: '3f3677f7ed3801f7415db4b4c900e6e81f4f41d5b4bc83c0bf899c353b2f9995', bytes: 639959040,
    }],
  },
  'mel-roformer': {
    name: 'Mel-Band RoFormer Kimberley Jensen FP32', format: 'roformer-frequency', graph4: 'mel-roformer-kim-t401.onnx', files: [{
      file: 'mel_band_roformer_kim_T801.onnx',
      url: 'https://github.com/santiquiroz/port-bs-roformer-onnx/releases/download/models-v1.0/mel_band_roformer_kim_T801.onnx',
      hash: '1b8afd7780d8a234527748821dee6bc746d346f2088751c12fd48e8c873f625a', bytes: 931054408,
    }],
  },
} as const satisfies Record<string, LocalModel>;
export type LocalModelId = keyof typeof LOCAL_MODELS;

export const SEPARATION_MODELS = {
  mdx: { name: 'MDX-Net Inst HQ 3', description: 'Original model · lowest CPU / RAM use', members: ['mdx'], downloadMB: 67 },
  'bs-roformer': { name: 'BS-RoFormer ViperX uint8', description: 'Compact ViperX · reduced precision', members: ['bs-roformer'], downloadMB: 166 },
  'bs-roformer-full': { name: 'BS-RoFormer ViperX FP32', description: 'Full precision ViperX · more RAM and disk space', members: ['bs-roformer-full'], downloadMB: 645 },
  'mel-roformer': { name: 'Mel-Band RoFormer Kimberley Jensen FP32', description: 'Full precision alternative · compare on the same song', members: ['mel-roformer'], downloadMB: 931 },
  'ensemble-local': { name: 'Ensemble · ViperX FP32 + Mel-Band FP32', description: 'Local 50/50 average of two models · runs sequentially · not the MVSEP ensemble', members: ['bs-roformer-full', 'mel-roformer'], downloadMB: 1576 },
} as const satisfies Record<string, { name: string; description: string; members: readonly LocalModelId[]; downloadMB: number }>;

export const MVSEP_MODELS = {
  'mvsep-bs-124': { name: 'BS-RoFormer 124 bands · MVSEP website', description: 'Choose the 2026.07 / 124 bands version on MVSEP. Availability and account requirements are controlled by MVSEP.', url: 'https://www.mvsep.com/en/home?sep_type=40' },
  'mvsep-ensemble': { name: 'Ensemble · MVSEP website', description: 'Official BS-RoFormer / Mel-Band / SCNet ensemble. A paid MVSEP account may be required.', url: 'https://mvsep.com/en/home?sep_type=26' },
} as const;
export type SeparationModel = keyof typeof SEPARATION_MODELS;
export type MvsepModel = keyof typeof MVSEP_MODELS;

export function separationModel(value: unknown = 'mdx'): SeparationModel {
  if (typeof value !== 'string' || !Object.hasOwn(SEPARATION_MODELS, value)) throw new Error('Unknown vocal separation model.');
  return value as SeparationModel;
}

export function separationContext(value: unknown = 4): 4 | 8 {
  if (value !== 4 && value !== 8) throw new Error('Choose a 4 or 8 second separation context.');
  return value;
}

export function mvsepUrl(value: unknown): string {
  if (typeof value !== 'string' || !Object.hasOwn(MVSEP_MODELS, value)) throw new Error('Unknown MVSEP model.');
  return MVSEP_MODELS[value as MvsepModel].url;
}

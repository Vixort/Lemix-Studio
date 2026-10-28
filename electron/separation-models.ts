export const SEPARATION_MODELS = {
  mdx: {
    name: 'MDX-Net Inst HQ 3',
    description: 'Original model · smaller download',
    file: 'UVR-MDX-NET-Inst_HQ_3.onnx',
    url: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Inst_HQ_3.onnx',
    hash: '317554b07fe1ea5279a77f2b1520a41ea4b93432560c4ffd08792c30fddf9adc',
    downloadMB: 67,
    maxBytes: 80 * 1024 * 1024,
  },
  'bs-roformer': {
    name: 'BS-RoFormer ViperX',
    description: 'New alternative for Thai / English songs · CPU processing can take longer',
    file: 'bs_roformer_ep317_sdr12.9755_quantized_uint8.onnx',
    url: 'https://huggingface.co/xycld/BS-RoFormer-ONNX/resolve/f020228f4d25616c8ff4146c339c33687c0be43f/bs_roformer_ep317_sdr12.9755_quantized_uint8.onnx',
    hash: 'b86b6224ff34d6d34c2530e0d41495b6a2c12db46acc1a7a5c7f64d2352807e9',
    downloadMB: 166,
    maxBytes: 180 * 1024 * 1024,
  },
} as const;

export type SeparationModel = keyof typeof SEPARATION_MODELS;

export function separationModel(value: unknown = 'mdx'): SeparationModel {
  if (typeof value !== 'string' || !Object.hasOwn(SEPARATION_MODELS, value)) throw new Error('Unknown vocal separation model.');
  return value as SeparationModel;
}

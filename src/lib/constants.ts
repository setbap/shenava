export const MODEL_REPO = 'Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16'

export const MODEL_FILES = {
  onnx: 'shenava_koochik_1_0_ctc_fixed2005_len_att70_13_fp16_full_io_embedded.onnx',
  tokens: 'tokens.json',
  preprocessor: 'preprocessor.json',
  melFilters: 'mel_filters_slaney_80x257.json',
} as const

export const LOCAL_MODEL_BASE = '/models'
export const HUB_MODEL_BASE = `https://huggingface.co/${MODEL_REPO}/resolve/main`
export const CACHE_NAME = 'shenava-koochik-v1.0-onnx-fp16'

export const SAMPLE_RATE = 16_000
export const N_FFT = 512
export const WIN_LENGTH = 400
export const HOP_LENGTH = 160
export const N_MELS = 80
export const CENTER_PAD = 256
export const PREEMPHASIS = 0.97
export const LOG_ZERO_GUARD = 5.960464477539063e-8
export const FIXED_FRAMES = 2005
export const OUTPUT_STRIDE = 8
export const BLANK_ID = 1024

/** Samples that produce the full 2005-frame window. */
export const WINDOW_SAMPLES = (FIXED_FRAMES - 1) * HOP_LENGTH

/** Hop between long-form windows (~4 s). */
export const LONGFORM_HOP_SAMPLES = 4 * SAMPLE_RATE

export const MIC_DECODE_INTERVAL_MS = 600
export const MAX_RECORDING_SAMPLES = 5 * 60 * SAMPLE_RATE

/** 80 ms per CTC output step (dw_striding ×8). */
export const MS_PER_OUTPUT_STEP = 80

/** Overlap between caption windows (~2 s). */
export const CAPTION_OVERLAP_SAMPLES = 2 * SAMPLE_RATE

export const MAX_MEDIA_SECONDS = 3 * 60 * 60

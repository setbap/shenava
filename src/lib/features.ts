import {
  CENTER_PAD,
  FIXED_FRAMES,
  HOP_LENGTH,
  LOG_ZERO_GUARD,
  N_FFT,
  N_MELS,
  PREEMPHASIS,
  WIN_LENGTH,
} from './constants.ts'

export type MelBank = number[][]

function reflectIndex(i: number, n: number): number {
  if (n <= 1) return 0
  const period = 2 * (n - 1)
  let x = i % period
  if (x < 0) x += period
  return x >= n ? period - x : x
}

function reflectPad(input: Float32Array, pad: number): Float32Array {
  const n = input.length
  const out = new Float32Array(n + pad * 2)
  for (let i = 0; i < pad; i++) out[i] = input[reflectIndex(-pad + i, n)]!
  out.set(input, pad)
  for (let i = 0; i < pad; i++) out[pad + n + i] = input[reflectIndex(n + i, n)]!
  return out
}

function preemphasis(input: Float32Array, coeff: number): Float32Array {
  const out = new Float32Array(input.length)
  if (input.length === 0) return out
  out[0] = input[0]!
  for (let i = 1; i < input.length; i++) {
    out[i] = input[i]! - coeff * input[i - 1]!
  }
  return out
}

/** torch.hann_window(N, periodic=False) */
function hannPeriodicFalse(length: number): Float32Array {
  const w = new Float32Array(length)
  if (length === 1) {
    w[0] = 1
    return w
  }
  const denom = length - 1
  for (let i = 0; i < length; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom)
  }
  return w
}

function paddedWindow(winLength: number, nFft: number): Float32Array {
  const w = hannPeriodicFalse(winLength)
  const out = new Float32Array(nFft)
  const left = Math.floor((nFft - winLength) / 2)
  out.set(w, left)
  return out
}

function fftRadix2(real: Float32Array, imag: Float32Array): void {
  const n = real.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = real[i]!
      real[i] = real[j]!
      real[j] = tr
      const ti = imag[i]!
      imag[i] = imag[j]!
      imag[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let j = 0; j < half; j++) {
        const ur = real[i + j]!
        const ui = imag[i + j]!
        const vr = real[i + j + half]! * wRe - imag[i + j + half]! * wIm
        const vi = real[i + j + half]! * wIm + imag[i + j + half]! * wRe
        real[i + j] = ur + vr
        imag[i + j] = ui + vi
        real[i + j + half] = ur - vr
        imag[i + j + half] = ui - vi
        const nre = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nre
      }
    }
  }
}

export function frameCount(numSamples: number): number {
  return Math.max(1, Math.min(FIXED_FRAMES, Math.floor(numSamples / HOP_LENGTH) + 1))
}

/**
 * NeMo AudioToMelSpectrogramPreprocessor-compatible log-mel.
 * Returns channel-first features [n_mels, FIXED_FRAMES] and the unpadded frame count.
 */
export function computeLogMel(
  pcm: Float32Array,
  melFilters: MelBank,
): { features: Float32Array; length: number } {
  const emphasized = preemphasis(pcm, PREEMPHASIS)
  const padded = reflectPad(emphasized, CENTER_PAD)
  const window = paddedWindow(WIN_LENGTH, N_FFT)
  const nFrames = frameCount(pcm.length)
  const nFreq = N_FFT / 2 + 1
  const features = new Float32Array(N_MELS * FIXED_FRAMES)
  const real = new Float32Array(N_FFT)
  const imag = new Float32Array(N_FFT)
  const power = new Float32Array(nFreq)

  for (let t = 0; t < nFrames; t++) {
    const start = t * HOP_LENGTH
    real.fill(0)
    imag.fill(0)
    for (let i = 0; i < N_FFT; i++) {
      real[i] = (padded[start + i] ?? 0) * window[i]!
    }
    fftRadix2(real, imag)
    for (let k = 0; k < nFreq; k++) {
      const re = real[k]!
      const im = imag[k]!
      power[k] = re * re + im * im
    }
    for (let m = 0; m < N_MELS; m++) {
      const filter = melFilters[m]!
      let sum = 0
      for (let k = 0; k < nFreq; k++) sum += power[k]! * (filter[k] ?? 0)
      features[m * FIXED_FRAMES + t] = Math.log(sum + LOG_ZERO_GUARD)
    }
  }

  return { features, length: nFrames }
}

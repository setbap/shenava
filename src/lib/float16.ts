/** IEEE-754 binary16 helpers. ORT float16 tensors use Uint16Array bit patterns. */

export function float32ToFloat16Bits(value: number): number {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return 0x7e00
    return value > 0 ? 0x7c00 : 0xfc00
  }

  const floatView = new Float32Array(1)
  const intView = new Uint32Array(floatView.buffer)
  floatView[0] = value
  const x = intView[0]

  const sign = (x >>> 16) & 0x8000
  const exp = (x >>> 23) & 0xff
  const frac = x & 0x7fffff

  if (exp === 255) {
    return sign | 0x7c00 | (frac ? 0x200 : 0)
  }

  const uns = exp - 127 + 15
  if (uns >= 31) return sign | 0x7c00
  if (uns <= 0) {
    if (uns < -10) return sign
    const mantissa = (frac | 0x800000) >> (1 - uns)
    return sign | ((mantissa + 0x1000) >> 13)
  }

  return sign | (uns << 10) | ((frac + 0x1000) >> 13)
}

export function float16BitsToFloat32(h: number): number {
  const s = (h & 0x8000) ? -1 : 1
  const e = (h & 0x7c00) >> 10
  const f = h & 0x03ff
  if (e === 0) return s * 2 ** -14 * (f / 1024)
  if (e === 31) return f ? Number.NaN : s * Infinity
  return s * 2 ** (e - 15) * (1 + f / 1024)
}

export function float32ArrayToFloat16Bits(input: Float32Array): Uint16Array {
  const out = new Uint16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    out[i] = float32ToFloat16Bits(input[i]!)
  }
  return out
}

export function tensorDataToFloat32(data: unknown, length: number): Float32Array {
  if (data instanceof Float32Array) return data
  if (data instanceof Float64Array) return Float32Array.from(data)

  const name =
    data && typeof data === 'object'
      ? (data as { constructor?: { name?: string } }).constructor?.name
      : undefined

  // Chrome WebGPU / ORT 1.17+ return float16 as Float16Array (decoded numbers).
  if (name === 'Float16Array' || isFloat16Array(data)) {
    return Float32Array.from(data as ArrayLike<number>)
  }

  if (data instanceof Uint16Array || name === 'Uint16Array') {
    const bits = data as Uint16Array
    const out = new Float32Array(bits.length)
    for (let i = 0; i < bits.length; i++) out[i] = float16BitsToFloat32(bits[i]!)
    return out
  }

  if (data instanceof ArrayBuffer) {
    return tensorDataToFloat32(new Uint16Array(data), length)
  }

  throw new Error(`Unsupported tensor data ${name ?? typeof data} (${length} expected)`)
}

function isFloat16Array(data: unknown): boolean {
  const Ctor = (globalThis as { Float16Array?: new () => ArrayLike<number> }).Float16Array
  return typeof Ctor === 'function' && data instanceof Ctor
}

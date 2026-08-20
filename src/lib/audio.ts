import { SAMPLE_RATE } from './constants.ts'

export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (input.length === 0) return input
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  const last = input.length - 1
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const frac = src - i0
    const a = input[Math.min(i0, last)]!
    const b = input[Math.min(i0 + 1, last)]!
    out[i] = a + (b - a) * frac
  }
  return out
}

export function mixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer
  if (numberOfChannels === 1) return buffer.getChannelData(0).slice()
  const out = new Float32Array(length)
  for (let c = 0; c < numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) out[i] += ch[i]!
  }
  const inv = 1 / numberOfChannels
  for (let i = 0; i < length; i++) out[i]! *= inv
  return out
}

export async function decodeAudioFile(file: File): Promise<Float32Array> {
  const ctx = new AudioContext()
  try {
    const bytes = await file.arrayBuffer()
    const audio = await ctx.decodeAudioData(bytes.slice(0))
    const mono = mixToMono(audio)
    return resampleLinear(mono, audio.sampleRate, SAMPLE_RATE)
  } finally {
    await ctx.close()
  }
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|m4v|webm|mkv|mov)$/i.test(file.name)
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/')
}

export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const dataLength = pcm.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)
  let offset = 44
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]!))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export async function readMediaDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file)
  const el = document.createElement(isVideoFile(file) ? 'video' : 'audio')
  el.preload = 'metadata'
  try {
    await new Promise<void>((resolve, reject) => {
      el.onloadedmetadata = () => resolve()
      el.onerror = () => reject(new Error('نتوانستم فایل را بخوانم'))
      el.src = url
    })
    return Number.isFinite(el.duration) ? el.duration : 0
  } finally {
    el.removeAttribute('src')
    el.load()
    URL.revokeObjectURL(url)
  }
}

function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!
  return Math.sqrt(sum / frame.length)
}

const RECORDER_WORKLET = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice())
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCaptureProcessor)
`

async function addRecorderWorklet(context: AudioContext): Promise<void> {
  const blob = new Blob([RECORDER_WORKLET], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    await context.audioWorklet.addModule(blobUrl)
  } catch {
    const dataUrl = `data:application/javascript,${encodeURIComponent(RECORDER_WORKLET)}`
    await context.audioWorklet.addModule(dataUrl)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export class MicCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private mute: GainNode | null = null
  private chunks: Float32Array[] = []
  private captured = 0
  private smoothed = 0
  private raf = 0
  onLevel: ((level: number) => void) | null = null

  async start(): Promise<void> {
    this.chunks = []
    this.captured = 0
    this.smoothed = 0
    const context = new AudioContext()
    this.context = context
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })
    if (context.state === 'suspended') await context.resume()
    await addRecorderWorklet(context)
    this.source = context.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(context, 'pcm-capture')
    this.mute = context.createGain()
    this.mute.gain.value = 0
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const frame = event.data
      this.chunks.push(new Float32Array(frame))
      this.captured += frame.length
      const instant = Math.min(1, Math.pow(frameRms(frame) / 0.11, 0.65))
      this.smoothed = this.smoothed * 0.82 + instant * 0.18
      if (this.raf) return
      this.raf = requestAnimationFrame(() => {
        this.raf = 0
        this.onLevel?.(this.smoothed)
      })
    }
    this.source.connect(this.node)
    this.node.connect(this.mute)
    this.mute.connect(context.destination)
  }

  sampleRate(): number {
    return this.context?.sampleRate ?? 48000
  }

  snapshot(): Float32Array {
    const out = new Float32Array(this.captured)
    let offset = 0
    for (const chunk of this.chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }

  snapshot16k(maxSamples = Infinity): Float32Array {
    const native = this.snapshot()
    const resampled = resampleLinear(native, this.sampleRate(), SAMPLE_RATE)
    if (resampled.length <= maxSamples) return resampled
    return resampled.slice(resampled.length - maxSamples)
  }

  async stop(): Promise<Float32Array> {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.onLevel?.(0)
    this.onLevel = null
    const pcm = this.snapshot16k()
    this.node?.port.close()
    this.node?.disconnect()
    this.source?.disconnect()
    this.mute?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.node = null
    this.source = null
    this.mute = null
    this.stream = null
    this.context = null
    this.chunks = []
    this.captured = 0
    return pcm
  }
}

import type { Cue } from './subtitles.ts'
import type { AsrBackend, ModelSource, WorkerRequest, WorkerResponse } from './protocol.ts'

export type ProgressInfo = {
  phase: 'download' | 'compile'
  loaded?: number
  total?: number
  percent?: number
}

export type CaptionResult = {
  text: string
  cues: Cue[]
}

export type CaptionProgress = {
  percent: number
  text: string
  cues: Cue[]
}

type Pending = {
  resolve: (result: CaptionResult) => void
  reject: (error: Error) => void
  onCaptionProgress?: (info: CaptionProgress) => void
}

const WEBGPU_COMPILE_MS = 90_000
const WASM_COMPILE_MS = 180_000

export class AsrClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, Pending>()
  private backend: AsrBackend = 'webgpu'
  private phase: ProgressInfo['phase'] | null = null
  private compileTimer: ReturnType<typeof setTimeout> | null = null
  private wasmFallbackUsed = false

  onProgress: ((info: ProgressInfo) => void) | null = null
  onReady: ((backend: AsrBackend, source: ModelSource) => void) | null = null
  onError: ((message: string) => void) | null = null

  constructor() {
    this.worker = this.spawn()
  }

  init(): void {
    this.backend = 'webgpu'
    this.phase = null
    this.wasmFallbackUsed = false
    this.postInit()
  }

  transcribe(pcm: Float32Array): Promise<string> {
    return this.caption(pcm).then((result) => result.text)
  }

  caption(
    pcm: Float32Array,
    onCaptionProgress?: (info: CaptionProgress) => void,
  ): Promise<CaptionResult> {
    const id = this.nextId++
    const copy = pcm.slice()
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onCaptionProgress })
      const msg: WorkerRequest = { type: 'transcribe', id, pcm: copy, captions: true }
      this.worker.postMessage(msg, [copy.buffer])
    })
  }

  cancel(id?: number): void {
    if (id !== undefined) {
      const msg: WorkerRequest = { type: 'cancel', id }
      this.worker.postMessage(msg)
      return
    }
    for (const pendingId of this.pending.keys()) {
      this.worker.postMessage({ type: 'cancel', id: pendingId } satisfies WorkerRequest)
    }
  }

  dispose(): void {
    this.clearCompileTimer()
    for (const [, pending] of this.pending) {
      pending.reject(new Error('ASR client disposed'))
    }
    this.pending.clear()
    this.worker.terminate()
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('../workers/asr.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handle(event.data)
    }
    worker.onerror = (event) => {
      this.fail(event.message || 'Worker failed')
    }
    return worker
  }

  private postInit(): void {
    this.clearCompileTimer()
    const msg: WorkerRequest = { type: 'init', backend: this.backend }
    this.worker.postMessage(msg)
  }

  private armCompileTimer(): void {
    this.clearCompileTimer()
    const ms = this.backend === 'webgpu' ? WEBGPU_COMPILE_MS : WASM_COMPILE_MS
    this.compileTimer = setTimeout(() => {
      this.fail(
        this.backend === 'webgpu'
          ? 'WebGPU session create timed out'
          : 'آماده‌سازی موتور خیلی طول کشید. صفحه را یک‌بار رفرش کن.',
      )
    }, ms)
  }

  private clearCompileTimer(): void {
    if (this.compileTimer !== null) {
      clearTimeout(this.compileTimer)
      this.compileTimer = null
    }
  }

  private fallbackWasm(reason: string): void {
    console.warn('[asr]', reason, '— retrying with WASM')
    this.wasmFallbackUsed = true
    this.backend = 'wasm'
    this.phase = 'compile'
    this.clearCompileTimer()
    this.worker.terminate()
    this.worker = this.spawn()
    this.onProgress?.({ phase: 'compile', percent: 5 })
    this.postInit()
  }

  private fail(message: string): void {
    if (!this.wasmFallbackUsed && this.phase !== 'download') {
      this.fallbackWasm(message)
      return
    }
    this.clearCompileTimer()
    this.onError?.(message)
  }

  private handle(msg: WorkerResponse): void {
    if (msg.type === 'progress') {
      this.phase = msg.phase
      if (msg.phase === 'compile') this.armCompileTimer()
      else this.clearCompileTimer()
      this.onProgress?.({
        phase: msg.phase,
        loaded: msg.loaded,
        total: msg.total,
        percent: msg.percent,
      })
      return
    }
    if (msg.type === 'ready') {
      this.clearCompileTimer()
      this.onReady?.(msg.backend, msg.source)
      return
    }
    if (msg.type === 'transcribe-progress') {
      this.pending.get(msg.id)?.onCaptionProgress?.({
        percent: msg.percent,
        text: msg.text,
        cues: msg.cues,
      })
      return
    }
    if (msg.type === 'result') {
      this.pending.get(msg.id)?.resolve({ text: msg.text, cues: msg.cues })
      this.pending.delete(msg.id)
      return
    }
    if (msg.type === 'error') {
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        this.pending.get(msg.id)?.reject(new Error(msg.message))
        this.pending.delete(msg.id)
        return
      }
      this.fail(msg.message)
    }
  }
}

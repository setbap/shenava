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

export class AsrClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, Pending>()

  onProgress: ((info: ProgressInfo) => void) | null = null
  onReady: ((backend: AsrBackend, source: ModelSource) => void) | null = null
  onError: ((message: string) => void) | null = null

  constructor() {
    this.worker = new Worker(new URL('../workers/asr.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handle(event.data)
    }
    this.worker.onerror = (event) => {
      this.onError?.(event.message || 'Worker failed')
    }
  }

  init(): void {
    const msg: WorkerRequest = { type: 'init' }
    this.worker.postMessage(msg)
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
    for (const [, pending] of this.pending) {
      pending.reject(new Error('ASR client disposed'))
    }
    this.pending.clear()
    this.worker.terminate()
  }

  private handle(msg: WorkerResponse): void {
    if (msg.type === 'progress') {
      this.onProgress?.({
        phase: msg.phase,
        loaded: msg.loaded,
        total: msg.total,
        percent: msg.percent,
      })
      return
    }
    if (msg.type === 'ready') {
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
      this.onError?.(msg.message)
    }
  }
}

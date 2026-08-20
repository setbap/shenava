import type { Cue } from './subtitles.ts'

export type AsrBackend = 'webgpu' | 'wasm'
export type ModelSource = 'local' | 'cache' | 'hub'

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'transcribe'; id: number; pcm: Float32Array; captions?: boolean }
  | { type: 'cancel'; id: number }

export type WorkerResponse =
  | {
      type: 'progress'
      phase: 'download' | 'compile'
      loaded?: number
      total?: number
      percent?: number
    }
  | { type: 'ready'; backend: AsrBackend; source: ModelSource }
  | {
      type: 'transcribe-progress'
      id: number
      percent: number
      text: string
      cues: Cue[]
    }
  | { type: 'result'; id: number; text: string; cues: Cue[] }
  | { type: 'error'; message: string; id?: number }

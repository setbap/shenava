import * as ort from 'onnxruntime-web/webgpu'
import {
  CACHE_NAME,
  CAPTION_OVERLAP_SAMPLES,
  FIXED_FRAMES,
  HUB_MODEL_BASE,
  LOCAL_MODEL_BASE,
  LONGFORM_HOP_SAMPLES,
  MODEL_FILES,
  N_MELS,
  SAMPLE_RATE,
  WINDOW_SAMPLES,
} from '../lib/constants.ts'
import { decodeLogits, packCues, stitchTranscripts, type TokenTable } from '../lib/ctc.ts'
import { computeLogMel, type MelBank } from '../lib/features.ts'
import { float32ArrayToFloat16Bits } from '../lib/float16.ts'
import type { AsrBackend, ModelSource, WorkerRequest, WorkerResponse } from '../lib/protocol.ts'
import type { Cue } from '../lib/subtitles.ts'

let session: ort.InferenceSession | null = null
let tokens: TokenTable | null = null
let melFilters: MelBank | null = null
let busy = false
let queued: { id: number; pcm: Float32Array; captions: boolean } | null = null
let cancelId: number | null = null
let initInFlight = false

function post(msg: WorkerResponse): void {
  self.postMessage(msg)
}

async function openModelCache(): Promise<Cache> {
  return caches.open(CACHE_NAME)
}

async function cachePut(cache: Cache, url: string, body: ArrayBuffer, contentType: string): Promise<void> {
  try {
    await cache.put(
      url,
      new Response(body.slice(0), {
        headers: { 'Content-Type': contentType },
      }),
    )
  } catch {
    // Quota errors are non-fatal; inference can still run.
  }
}

async function matchAny(cache: Cache, urls: string[]): Promise<Response | undefined> {
  for (const url of urls) {
    const hit = await cache.match(url)
    if (hit) return hit
  }
  return undefined
}

async function fetchJson<T>(path: string): Promise<T> {
  const localUrl = `${LOCAL_MODEL_BASE}/${path}`
  const hubUrl = `${HUB_MODEL_BASE}/${path}`
  const cache = await openModelCache()
  const cached = await matchAny(cache, [localUrl, hubUrl])
  if (cached) return (await cached.json()) as T

  try {
    const local = await fetch(localUrl)
    if (local.ok) {
      const buffer = await local.arrayBuffer()
      await cachePut(cache, localUrl, buffer, 'application/json')
      return JSON.parse(new TextDecoder().decode(buffer)) as T
    }
  } catch {
    // Fall through to the Hub.
  }

  const remote = await fetch(hubUrl)
  if (!remote.ok) throw new Error(`Failed to load ${path} (${remote.status})`)
  const buffer = await remote.arrayBuffer()
  await cachePut(cache, hubUrl, buffer, 'application/json')
  return JSON.parse(new TextDecoder().decode(buffer)) as T
}

async function fetchWithProgress(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Model download failed (${response.status})`)
  const total = Number(response.headers.get('content-length') ?? 0)
  if (!response.body) return response.arrayBuffer()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    const percent = total > 0 ? (loaded / total) * 100 : 0
    post({ type: 'progress', phase: 'download', loaded, total, percent })
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

async function loadOnnxBytes(): Promise<{ bytes: Uint8Array; source: ModelSource }> {
  const localUrl = `${LOCAL_MODEL_BASE}/${MODEL_FILES.onnx}`
  const hubUrl = `${HUB_MODEL_BASE}/${MODEL_FILES.onnx}`
  const cache = await openModelCache()

  const cached = await matchAny(cache, [localUrl, hubUrl])
  if (cached) {
    post({ type: 'progress', phase: 'download', percent: 100, loaded: 1, total: 1 })
    return { bytes: new Uint8Array(await cached.arrayBuffer()), source: 'cache' }
  }

  try {
    const local = await fetch(localUrl)
    if (local.ok) {
      post({ type: 'progress', phase: 'download', percent: 50 })
      const buffer = await local.arrayBuffer()
      await cachePut(cache, localUrl, buffer, 'application/octet-stream')
      post({ type: 'progress', phase: 'download', percent: 100, loaded: buffer.byteLength, total: buffer.byteLength })
      return { bytes: new Uint8Array(buffer), source: 'local' }
    }
  } catch {
    // Fall through to the Hub.
  }

  const buffer = await fetchWithProgress(hubUrl)
  await cachePut(cache, hubUrl, buffer, 'application/octet-stream')
  return { bytes: new Uint8Array(buffer), source: 'hub' }
}

function configureOrt(): void {
  ort.env.wasm.simd = true
  ort.env.wasm.proxy = false
  ort.env.wasm.numThreads = self.crossOriginIsolated ? 4 : 1
}

function timeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms)
  })
}

async function createSession(
  model: Uint8Array,
): Promise<{ session: ort.InferenceSession; backend: AsrBackend }> {
  configureOrt()

  let heartbeat = 8
  const beat = setInterval(() => {
    heartbeat = Math.min(88, heartbeat + 4)
    post({ type: 'progress', phase: 'compile', percent: heartbeat })
  }, 1500)

  try {
    post({ type: 'progress', phase: 'compile', percent: 5 })
    try {
      const created = await Promise.race([
        ort.InferenceSession.create(model, { executionProviders: ['webgpu'] }),
        timeout(20_000, 'WebGPU timeout'),
      ])
      post({ type: 'progress', phase: 'compile', percent: 100 })
      return { session: created, backend: 'webgpu' }
    } catch {
      post({ type: 'progress', phase: 'compile', percent: 20 })
      const created = await ort.InferenceSession.create(model, {
        executionProviders: ['wasm'],
      })
      post({ type: 'progress', phase: 'compile', percent: 100 })
      return { session: created, backend: 'wasm' }
    }
  } finally {
    clearInterval(beat)
  }
}

function encodedLengthOf(data: unknown): number {
  if (data instanceof BigInt64Array) return Number(data[0])
  if (data instanceof BigUint64Array) return Number(data[0])
  if (data instanceof Int32Array || data instanceof Uint32Array) return Number(data[0])
  if (data instanceof Float32Array) return Number(data[0])
  if (Array.isArray(data)) return Number(data[0])
  if (typeof data === 'number' || typeof data === 'bigint') return Number(data)
  if (data && typeof data === 'object' && '0' in (data as object)) {
    return Number((data as { 0: unknown })[0])
  }
  throw new Error('Unexpected encoded_lengths tensor')
}

async function inferWindow(pcm: Float32Array): Promise<{ text: string; cues: Cue[] }> {
  if (!session || !tokens || !melFilters) throw new Error('Model is not ready')
  const { features, length } = computeLogMel(pcm, melFilters)
  const f16 = float32ArrayToFloat16Bits(features)
  const feeds: Record<string, ort.Tensor> = {
    processed_signal: new ort.Tensor('float16', f16, [1, N_MELS, FIXED_FRAMES]),
    processed_signal_length: new ort.Tensor(
      'int64',
      BigInt64Array.from([BigInt(length)]),
      [1],
    ),
  }
  const out = await session.run(feeds)
  const logits = out.logits
  const lengths = out.encoded_lengths
  if (!logits || !lengths) throw new Error('Model did not return logits')
  try {
    const logitsData = await logits.getData()
    const lengthData = await lengths.getData()
    return decodeLogits(logitsData, logits.dims, encodedLengthOf(lengthData), tokens)
  } finally {
    logits.dispose()
    lengths.dispose()
  }
}

function offsetCues(cues: Cue[], offsetMs: number): Cue[] {
  return cues.map((cue) => ({
    ...cue,
    startMs: cue.startMs + offsetMs,
    endMs: cue.endMs + offsetMs,
  }))
}

async function transcribe(
  id: number,
  pcm: Float32Array,
  captions: boolean,
): Promise<{ text: string; cues: Cue[] }> {
  if (pcm.length <= WINDOW_SAMPLES) return inferWindow(pcm)

  if (!captions) {
    const chunks: string[] = []
    for (let start = 0; start < pcm.length; start += LONGFORM_HOP_SAMPLES) {
      if (cancelId === id) throw new Error('لغو شد')
      const end = Math.min(start + WINDOW_SAMPLES, pcm.length)
      chunks.push((await inferWindow(pcm.subarray(start, end))).text)
      if (end >= pcm.length || pcm.length - start <= WINDOW_SAMPLES) break
    }
    return { text: stitchTranscripts(chunks), cues: [] }
  }

  const hop = WINDOW_SAMPLES - CAPTION_OVERLAP_SAMPLES
  const overlapMs = (CAPTION_OVERLAP_SAMPLES / SAMPLE_RATE) * 1000
  const cues: Cue[] = []
  const texts: string[] = []
  let index = 0
  for (let start = 0; start < pcm.length; start += hop) {
    if (cancelId === id) throw new Error('لغو شد')
    const end = Math.min(start + WINDOW_SAMPLES, pcm.length)
    const slice = pcm.subarray(start, end)
    const decoded = await inferWindow(slice)
    const isLast = end >= pcm.length
    const windowStartMs = (start / SAMPLE_RATE) * 1000
    const windowMs = (slice.length / SAMPLE_RATE) * 1000
    const keepAfter = index === 0 ? 0 : overlapMs / 2
    const keepBefore = isLast ? windowMs : windowMs - overlapMs / 2
    for (const cue of offsetCues(decoded.cues, windowStartMs)) {
      const mid = (cue.startMs + cue.endMs) / 2 - windowStartMs
      if (mid >= keepAfter && mid < keepBefore) cues.push(cue)
    }
    if (decoded.text) texts.push(decoded.text)
    const packed = packCues(cues)
    const percent = Math.min(100, (end / pcm.length) * 100)
    post({
      type: 'transcribe-progress',
      id,
      percent,
      text: texts.join(' '),
      cues: packed,
    })
    index += 1
    if (isLast) break
  }
  return { text: stitchTranscripts(texts), cues: packCues(cues) }
}

async function runQueued(): Promise<void> {
  if (busy) return
  const job = queued
  queued = null
  if (!job) return
  busy = true
  try {
    const result = await transcribe(job.id, job.pcm, job.captions)
    post({ type: 'result', id: job.id, text: result.text, cues: result.cues })
  } catch (err) {
    post({
      type: 'error',
      id: job.id,
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    busy = false
    if (cancelId === job.id) cancelId = null
    if (queued) void runQueued()
  }
}

async function init(): Promise<void> {
  try {
    const [tok, mel, model] = await Promise.all([
      fetchJson<TokenTable>(MODEL_FILES.tokens),
      fetchJson<MelBank>(MODEL_FILES.melFilters),
      loadOnnxBytes(),
    ])
    tokens = tok
    melFilters = mel
    const created = await createSession(model.bytes)
    session = created.session
    post({ type: 'ready', backend: created.backend, source: model.source })
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type === 'init') {
    if (session || initInFlight) return
    initInFlight = true
    void init().finally(() => {
      initInFlight = false
    })
    return
  }
  if (msg.type === 'cancel') {
    cancelId = msg.id
    return
  }
  if (msg.type === 'transcribe') {
    queued = { id: msg.id, pcm: msg.pcm, captions: Boolean(msg.captions) }
    void runQueued()
  }
}

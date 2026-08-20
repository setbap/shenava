import { BLANK_ID, MS_PER_OUTPUT_STEP } from './constants.ts'
import { tensorDataToFloat32 } from './float16.ts'
import type { Cue } from './subtitles.ts'

export type TokenTable = {
  blank_id: number
  tokens: string[]
}

const SPECIAL = /^<.*>$/
const WORD_MARK = '\u2581'
/** ~2 s of CTC blanks — only real pauses start a new cue. */
const PAUSE_STEPS = 25
const MAX_CUE_MS = 18_000
const MAX_CUE_WORDS = 40
const MERGE_GAP_MS = 2_000

export type DecodeResult = {
  text: string
  cues: Cue[]
}

function argmaxPath(
  logitsData: unknown,
  dims: readonly number[],
  encodedLength: number,
): { ids: number[]; vocab: number; steps: number } {
  const [batch, time, vocab] = dims
  if (batch !== 1 || !time || !vocab) {
    throw new Error(`Unexpected logits shape: [${dims.join(', ')}]`)
  }
  const logits = tensorDataToFloat32(logitsData, time * vocab)
  const steps = Math.max(0, Math.min(encodedLength, time))
  const ids = new Array<number>(steps)
  for (let t = 0; t < steps; t++) {
    const offset = t * vocab
    let best = 0
    let bestVal = -Infinity
    for (let v = 0; v < vocab; v++) {
      const val = logits[offset + v]!
      if (val > bestVal) {
        bestVal = val
        best = v
      }
    }
    ids[t] = best
  }
  return { ids, vocab, steps }
}

function collapseTokens(
  ids: number[],
  tokens: TokenTable,
): { token: string; step: number }[] {
  const blank = tokens.blank_id ?? BLANK_ID
  const kept: { token: string; step: number }[] = []
  let prev = -1
  for (let t = 0; t < ids.length; t++) {
    const id = ids[t]!
    if (id === prev || id === blank) {
      prev = id
      continue
    }
    prev = id
    const tok = tokens.tokens[id]
    if (!tok || SPECIAL.test(tok)) continue
    kept.push({ token: tok, step: t })
  }
  return kept
}

function joinTokens(kept: { token: string }[]): string {
  return kept
    .map((k) => k.token)
    .join('')
    .replaceAll(WORD_MARK, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordsFromTokens(kept: { token: string; step: number }[]): {
  text: string
  startStep: number
  endStep: number
}[] {
  const words: { text: string; startStep: number; endStep: number }[] = []
  let text = ''
  let startStep = -1
  let endStep = -1

  const flush = () => {
    const word = text.trim()
    if (word && startStep >= 0) {
      words.push({ text: word, startStep, endStep })
    }
    text = ''
    startStep = -1
    endStep = -1
  }

  for (const { token, step } of kept) {
    const startsWord = token.startsWith(WORD_MARK)
    const piece = token.replaceAll(WORD_MARK, '')
    if (startsWord) flush()
    if (!piece) continue
    if (startStep < 0) startStep = step
    text += piece
    endStep = step
  }
  flush()
  return words
}

function cuesFromWords(
  words: { text: string; startStep: number; endStep: number }[],
): Cue[] {
  if (words.length === 0) return []
  const cues: Cue[] = []
  let group = [words[0]!]

  const emit = () => {
    if (group.length === 0) return
    const first = group[0]!
    const last = group[group.length - 1]!
    const startMs = first.startStep * MS_PER_OUTPUT_STEP
    const endMs = Math.max(startMs + 240, last.endStep * MS_PER_OUTPUT_STEP + MS_PER_OUTPUT_STEP)
    cues.push({
      startMs,
      endMs,
      text: group.map((w) => w.text).join(' '),
    })
    group = []
  }

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!
    const prev = group[group.length - 1]!
    const gap = word.startStep - prev.endStep
    const dur = (word.endStep - group[0]!.startStep) * MS_PER_OUTPUT_STEP
    if (gap >= PAUSE_STEPS || group.length >= MAX_CUE_WORDS || dur >= MAX_CUE_MS) {
      emit()
    }
    group.push(word)
  }
  emit()
  return packCues(cues)
}

export function packCues(cues: Cue[]): Cue[] {
  if (cues.length === 0) return []
  const merged: Cue[] = []
  let current = { ...cues[0]! }

  for (let i = 1; i < cues.length; i++) {
    const next = cues[i]!
    const gap = next.startMs - current.endMs
    const words = `${current.text} ${next.text}`.trim().split(/\s+/).length
    const dur = next.endMs - current.startMs
    if (gap <= MERGE_GAP_MS && words <= MAX_CUE_WORDS && dur <= MAX_CUE_MS) {
      current = {
        startMs: current.startMs,
        endMs: Math.max(current.endMs, next.endMs),
        text: `${current.text} ${next.text}`.replace(/\s+/g, ' ').trim(),
      }
      continue
    }
    merged.push(current)
    current = { ...next }
  }
  merged.push(current)

  for (let i = 0; i < merged.length - 1; i++) {
    const cue = merged[i]!
    const nextStart = merged[i + 1]!.startMs
    if (nextStart > cue.endMs) merged[i] = { ...cue, endMs: nextStart }
  }
  return merged
}

export function decodeLogits(
  logitsData: unknown,
  dims: readonly number[],
  encodedLength: number,
  tokens: TokenTable,
): DecodeResult {
  const { ids } = argmaxPath(logitsData, dims, encodedLength)
  const kept = collapseTokens(ids, tokens)
  return {
    text: joinTokens(kept),
    cues: cuesFromWords(wordsFromTokens(kept)),
  }
}

export function greedyCtcDecode(
  logitsData: unknown,
  dims: readonly number[],
  encodedLength: number,
  tokens: TokenTable,
): string {
  return decodeLogits(logitsData, dims, encodedLength, tokens).text
}

export function stitchTranscripts(chunks: string[]): string {
  if (chunks.length === 0) return ''
  let acc = chunks[0]!.trim()
  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i]!.trim()
    if (!next) continue
    const overlap = longestOverlap(acc, next)
    acc = overlap >= 4 ? acc + next.slice(overlap) : `${acc} ${next}`
  }
  return acc.replace(/\s+/g, ' ').trim()
}

function longestOverlap(left: string, right: string): number {
  const max = Math.min(left.length, right.length, 48)
  for (let n = max; n >= 4; n--) {
    if (left.slice(-n) === right.slice(0, n)) return n
  }
  return 0
}

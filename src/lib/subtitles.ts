export type Cue = {
  startMs: number
  endMs: number
  text: string
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function hms(ms: number): { h: number; m: number; s: number; ms: number } {
  const t = Math.max(0, Math.round(ms))
  return {
    h: Math.floor(t / 3_600_000),
    m: Math.floor((t % 3_600_000) / 60_000),
    s: Math.floor((t % 60_000) / 1000),
    ms: t % 1000,
  }
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function toFaDigits(value: string): string {
  return value.replace(/\d/g, (digit) => FA_DIGITS[Number(digit)] ?? digit)
}

export function formatFaNumber(value: number): string {
  return toFaDigits(
    new Intl.NumberFormat('en-US', {
      useGrouping: false,
      maximumFractionDigits: 2,
    }).format(value),
  )
}

export function formatClock(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${toFaDigits(String(m).padStart(2, '0'))}:${toFaDigits(String(s).padStart(2, '0'))}`
}

export function formatSrtTime(ms: number): string {
  const t = hms(ms)
  return `${pad(t.h, 2)}:${pad(t.m, 2)}:${pad(t.s, 2)},${pad(t.ms, 3)}`
}

export function formatVttTime(ms: number): string {
  const t = hms(ms)
  return `${pad(t.h, 2)}:${pad(t.m, 2)}:${pad(t.s, 2)}.${pad(t.ms, 3)}`
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((cue, i) => `${i + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}\n`)
    .join('\n')
}

export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues
    .map((cue) => `${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}\n${cue.text}\n`)
    .join('\n')}`
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function stemName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'shenava'
}

function parseSrtTime(value: string): number {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if (!match) return 0
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const fraction = match[4]!.padEnd(3, '0')
  return hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + Number(fraction)
}

export function parseSrt(srt: string): Cue[] {
  const blocks = srt.replace(/^\uFEFF/, '').trim().split(/\r?\n\r?\n/)
  const cues: Cue[] = []
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim().length > 0)
    const timeIndex = lines.findIndex((line) => line.includes('-->'))
    if (timeIndex < 0) continue
    const [startRaw, endRaw] = lines[timeIndex]!.split('-->')
    if (!startRaw || !endRaw) continue
    const text = lines
      .slice(timeIndex + 1)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    cues.push({
      startMs: parseSrtTime(startRaw),
      endMs: parseSrtTime(endRaw),
      text,
    })
  }
  return cues
}

export function textFromCues(cues: Cue[]): string {
  return cues
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function textFromSrt(srt: string): string {
  return textFromCues(parseSrt(srt))
}

export function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fa')
}

export function textMatchesQuery(haystack: string, query: string): boolean {
  const text = normalizeSearchText(haystack)
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every((token) => text.includes(token))
}

export function firstMatchStartMs(cues: Cue[], query: string): number | undefined {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return undefined
  const first = tokens[0]!
  const cue = cues.find((item) => normalizeSearchText(item.text).includes(first))
  return cue?.startMs
}

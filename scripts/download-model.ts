#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const REPO = 'Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16'
const DEST = join(import.meta.dir, '../public/models')
const CACHE_PATH = join(DEST, '.download-cache.json')
const FILES = [
  'preprocessor.json',
  'tokens.json',
  'mel_filters_slaney_80x257.json',
  'shenava_koochik_1_0_ctc_fixed2005_len_att70_13_fp16_full_io_embedded.onnx',
]

type CacheEntry = {
  size: number
  oid: string
  lfsOid?: string
  etag?: string
  lastModified?: string
}

type DownloadCache = {
  repo: string
  files: Record<string, CacheEntry>
}

type HubTreeEntry = {
  path: string
  size: number
  oid: string
  lfs?: { oid: string; size: number }
}

await mkdir(DEST, { recursive: true })

async function loadCache(): Promise<DownloadCache> {
  try {
    const parsed = JSON.parse(await readFile(CACHE_PATH, 'utf8')) as DownloadCache
    if (parsed.repo === REPO && parsed.files) return parsed
  } catch {
    // First run or a corrupt cache file.
  }
  return { repo: REPO, files: {} }
}

async function saveCache(cache: DownloadCache): Promise<void> {
  await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)
}

async function fetchTree(): Promise<Map<string, HubTreeEntry>> {
  const response = await fetch(`https://huggingface.co/api/models/${REPO}/tree/main`)
  if (!response.ok) {
    throw new Error(`Hub tree: ${response.status} ${response.statusText}`)
  }
  const entries = (await response.json()) as HubTreeEntry[]
  return new Map(entries.map((entry) => [entry.path, entry]))
}

function remoteIdentity(entry: HubTreeEntry): CacheEntry {
  return {
    size: entry.lfs?.size ?? entry.size,
    oid: entry.oid,
    lfsOid: entry.lfs?.oid,
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function sameVersion(local: CacheEntry | undefined, remote: CacheEntry): boolean {
  if (!local) return false
  if (local.size !== remote.size || local.oid !== remote.oid) return false
  if (remote.lfsOid && local.lfsOid && local.lfsOid !== remote.lfsOid) return false
  return true
}

async function download(file: string, remote: CacheEntry): Promise<CacheEntry> {
  const dest = join(DEST, file)
  const url = `https://huggingface.co/${REPO}/resolve/main/${file}`
  console.log(`Downloading ${file}…`)
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`${file}: ${response.status} ${response.statusText}`)
  }

  const total = Number(response.headers.get('content-length') ?? remote.size)
  const writer = Bun.file(dest).writer()
  const reader = response.body.getReader()
  let loaded = 0
  let lastPct = -1
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    writer.write(value)
    loaded += value.byteLength
    if (total > 0) {
      const pctNum = Math.floor((loaded / total) * 100)
      if (pctNum !== lastPct) {
        lastPct = pctNum
        const mb = (loaded / 1_048_576).toFixed(1)
        const tot = (total / 1_048_576).toFixed(1)
        process.stdout.write(`\r  ${pctNum}%  ${mb} / ${tot} MB`)
      }
    }
  }
  await writer.end()
  process.stdout.write(`\n  saved ${dest}\n`)

  return {
    ...remote,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
  }
}

const tree = await fetchTree()
const cache = await loadCache()
let downloaded = 0
let skipped = 0

for (const file of FILES) {
  const hub = tree.get(file)
  if (!hub) throw new Error(`Not on Hub: ${file}`)
  const remote = remoteIdentity(hub)
  const dest = Bun.file(join(DEST, file))
  const exists = await dest.exists()
  const localSize = exists ? dest.size : 0
  const cached = cache.files[file]

  const upToDate =
    exists &&
    localSize === remote.size &&
    (sameVersion(cached, remote) || (!cached && localSize === remote.size))

  if (upToDate) {
    cache.files[file] = { ...remote, etag: cached?.etag, lastModified: cached?.lastModified }
    console.log(`Cached ${file} (${formatSize(remote.size)}) — already current`)
    skipped += 1
    continue
  }

  cache.files[file] = await download(file, remote)
  downloaded += 1
}

await saveCache(cache)
console.log(
  `Done. ${downloaded} downloaded, ${skipped} cached. Large ONNX files stay gitignored.`,
)

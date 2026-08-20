import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type NoteKind = 'recording' | 'file'

export type NoteMeta = {
  id: string
  createdAt: number
  title: string
  srt: string
  mime: string
  kind: NoteKind
}

export type NoteRecord = NoteMeta & {
  blob: Blob | null
}

interface ShenavaDB extends DBSchema {
  notes: {
    key: string
    value: NoteMeta
    indexes: { 'by-createdAt': number }
  }
  media: {
    key: string
    value: { id: string; blob: Blob }
  }
}

const DB_NAME = 'shenava-notes'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ShenavaDB>> | null = null

function openNotesDb(): Promise<IDBPDatabase<ShenavaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ShenavaDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('notes')) {
          const notes = database.createObjectStore('notes', { keyPath: 'id' })
          notes.createIndex('by-createdAt', 'createdAt')
        }
        if (!database.objectStoreNames.contains('media')) {
          database.createObjectStore('media', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export function formatNoteTitle(createdAt: number): string {
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(createdAt))
}

export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  } catch {
    // Persistence is best-effort.
  }
}

export async function listNotes(): Promise<NoteMeta[]> {
  const db = await openNotesDb()
  const rows = await db.getAllFromIndex('notes', 'by-createdAt')
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getNote(id: string): Promise<NoteRecord | null> {
  const db = await openNotesDb()
  const meta = await db.get('notes', id)
  if (!meta) return null
  const media = await db.get('media', id)
  return { ...meta, blob: media?.blob ?? null }
}

export async function saveNote(input: {
  id?: string
  createdAt?: number
  srt: string
  mime: string
  kind: NoteKind
  blob?: Blob | null
}): Promise<NoteMeta> {
  const createdAt = input.createdAt ?? Date.now()
  const meta: NoteMeta = {
    id: input.id ?? crypto.randomUUID(),
    createdAt,
    title: formatNoteTitle(createdAt),
    srt: input.srt,
    mime: input.mime,
    kind: input.kind,
  }
  const db = await openNotesDb()
  const tx = db.transaction(['notes', 'media'], 'readwrite')
  await tx.objectStore('notes').put(meta)
  if (input.blob) {
    await tx.objectStore('media').put({ id: meta.id, blob: input.blob })
  }
  await tx.done
  await requestPersistentStorage()
  return meta
}

export async function renameNote(id: string, title: string): Promise<NoteMeta | null> {
  const next = title.trim()
  if (!next) return null
  const db = await openNotesDb()
  const meta = await db.get('notes', id)
  if (!meta) return null
  const updated: NoteMeta = { ...meta, title: next }
  await db.put('notes', updated)
  return updated
}

export async function deleteNote(id: string): Promise<void> {
  const db = await openNotesDb()
  const tx = db.transaction(['notes', 'media'], 'readwrite')
  await tx.objectStore('notes').delete(id)
  await tx.objectStore('media').delete(id)
  await tx.done
}

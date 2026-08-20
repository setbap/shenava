import { useCallback, useEffect, useRef, useState } from 'react'
import { Direction } from 'radix-ui'
import { toast } from 'sonner'
import { AppSidebar, NoteSearchDialog } from '@/components/app-sidebar'
import { ComposePanel } from '@/components/compose-panel'
import { ModelGate, type LoadState } from '@/components/model-gate'
import { NotePanel } from '@/components/note-panel'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsMobile } from '@/components/ui/use-mobile'
import { PanelRightIcon, SearchIcon } from 'lucide-react'
import { AsrClient, type ProgressInfo } from '@/lib/asr-client'
import {
  decodeAudioFile,
  encodeWav,
  isVideoFile,
  MicCapture,
  readMediaDuration,
} from '@/lib/audio'
import {
  MAX_MEDIA_SECONDS,
  MAX_RECORDING_SAMPLES,
  MIC_DECODE_INTERVAL_MS,
  SAMPLE_RATE,
  WINDOW_SAMPLES,
} from '@/lib/constants'
import { isModelCached } from '@/lib/model-cache'
import {
  deleteNote,
  getNote,
  listNotes,
  renameNote,
  requestPersistentStorage,
  saveNote,
  type NoteMeta,
} from '@/lib/notes'
import { downloadText, parseSrt, textFromCues, toSrt, type Cue } from '@/lib/subtitles'

type Mode = 'compose' | 'note'

const DRAWER_LAYOUT_KEY = 'shenava-drawer-layout'
const STORE_VOICE_KEY = 'shenava-store-voice'

function readStoreVoice(): boolean {
  try {
    return localStorage.getItem(STORE_VOICE_KEY) === '1'
  } catch {
    return false
  }
}

function readDrawerLayout(): { drawer: number; main: number } | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAWER_LAYOUT_KEY) ?? '') as {
      drawer?: number
      main?: number
    }
    if (typeof parsed.drawer === 'number' && typeof parsed.main === 'number') {
      return { drawer: parsed.drawer, main: parsed.main }
    }
  } catch {
    // First visit or a corrupt value.
  }
  return undefined
}

function ensureCues(cues: Cue[], text: string, durationMs: number): Cue[] {
  if (cues.length > 0) return cues
  if (!text) return []
  return [{ startMs: 0, endMs: Math.max(durationMs, 1000), text }]
}

export default function App() {
  return (
    <Direction.Provider dir="rtl">
      <TooltipProvider>
        <div className="flex h-full overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <AppShell />
          <Toaster theme="dark" dir="rtl" position="top-center" />
        </div>
      </TooltipProvider>
    </Direction.Provider>
  )
}

function AppShell() {
  const clientRef = useRef<AsrClient | null>(null)
  const micRef = useRef<MicCapture | null>(null)
  const timerRef = useRef<number | null>(null)
  const transcribingRef = useRef(false)
  const mediaObjectUrl = useRef<string | null>(null)

  const [load, setLoad] = useState<LoadState>({ status: 'checking' })
  const [downloadBytes, setDownloadBytes] = useState<{ loaded: number; total: number } | null>(
    null,
  )
  const [mode, setMode] = useState<Mode>('compose')
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cues, setCues] = useState<Cue[]>([])
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mime, setMime] = useState('audio/wav')
  const [liveText, setLiveText] = useState('')
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState<'extract' | 'caption' | null>(null)
  const [captionPercent, setCaptionPercent] = useState(0)
  const [recording, setRecording] = useState(false)
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [storeVoice, setStoreVoice] = useState(readStoreVoice)

  const setMedia = useCallback((url: string | null) => {
    if (mediaObjectUrl.current) URL.revokeObjectURL(mediaObjectUrl.current)
    mediaObjectUrl.current = url
    setMediaUrl(url)
  }, [])

  const startModelLoad = useCallback(() => {
    setLoad({ status: 'loading', phase: 'download', percent: 0 })
    clientRef.current?.init()
  }, [])

  useEffect(() => {
    const client = new AsrClient()
    clientRef.current = client
    client.onProgress = (info: ProgressInfo) => {
      setLoad({
        status: 'loading',
        phase: info.phase,
        percent: info.percent ?? 0,
      })
      if (info.phase === 'download' && info.loaded && info.total) {
        setDownloadBytes({ loaded: info.loaded, total: info.total })
      }
    }
    client.onReady = (backend, source) => {
      setLoad({ status: 'ready', backend, source })
      void requestPersistentStorage()
    }
    client.onError = (message) => {
      setLoad({ status: 'error', message })
    }
    let cancelled = false
    void isModelCached().then((cached) => {
      if (cancelled) return
      if (cached) startModelLoad()
      else setLoad({ status: 'needed' })
    })
    void listNotes().then(setNotes)
    return () => {
      cancelled = true
      if (timerRef.current) window.clearInterval(timerRef.current)
      void micRef.current?.stop()
      client.dispose()
      if (mediaObjectUrl.current) URL.revokeObjectURL(mediaObjectUrl.current)
    }
  }, [startModelLoad])

  const ready = load.status === 'ready'

  const openNote = useCallback(
    async (id: string, seekMs?: number) => {
      const record = await getNote(id)
      if (!record) {
        setNotice('این یادداشت پیدا نشد')
        return
      }
      const parsed = parseSrt(record.srt)
      setSelectedId(id)
      setCues(parsed)
      setMime(record.mime)
      setMedia(record.blob ? URL.createObjectURL(record.blob) : null)
      setJumpToMs(seekMs ?? null)
      setJumpNonce((n) => n + 1)
      setMode('note')
      setNotice(null)
    },
    [setMedia],
  )

  const persistCapture = useCallback(
    async (input: {
      srt: string
      mime: string
      kind: 'recording' | 'file'
      blob: Blob
    }) => {
      const meta = await saveNote({
        ...input,
        blob: storeVoice ? input.blob : null,
      })
      setNotes((current) => [meta, ...current.filter((note) => note.id !== meta.id)])
      setSelectedId(meta.id)
      setMode('note')
      return meta
    },
    [storeVoice],
  )

  const startRecording = useCallback(async () => {
    if (!ready || recording || busy) return
    const mic = new MicCapture()
    mic.onLevel = setVoiceLevel
    micRef.current = mic
    try {
      await mic.start()
    } catch (err) {
      micRef.current = null
      setNotice(err instanceof Error ? err.message : 'دسترسی به میکروفون داده نشد')
      return
    }
    setMode('compose')
    setSelectedId(null)
    setCues([])
    setLiveText('')
    setMedia(null)
    setRecording(true)
    setNotice(null)
    timerRef.current = window.setInterval(() => {
      if (transcribingRef.current) return
      const client = clientRef.current
      if (!client) return
      const pcm = mic.snapshot16k(WINDOW_SAMPLES)
      if (pcm.length < 1600) return
      transcribingRef.current = true
      void client
        .transcribe(pcm)
        .then((text) => setLiveText(text))
        .catch(() => undefined)
        .finally(() => {
          transcribingRef.current = false
        })
    }, MIC_DECODE_INTERVAL_MS)
  }, [busy, ready, recording, setMedia])

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    const mic = micRef.current
    micRef.current = null
    setRecording(false)
    setVoiceLevel(0)
    if (!mic) return
    const client = clientRef.current
    if (!client) return
    const pcm = (await mic.stop()).slice(0, MAX_RECORDING_SAMPLES)
    if (pcm.length < 1600) {
      setNotice('ضبط خیلی کوتاه بود')
      return
    }
    const blob = encodeWav(pcm, SAMPLE_RATE)
    const url = URL.createObjectURL(blob)
    setMedia(url)
    setMime('audio/wav')
    setBusy(true)
    setJob('caption')
    setCaptionPercent(0)
    try {
      const result = await client.caption(pcm, (info) => {
        setCaptionPercent(info.percent)
        setLiveText(info.text)
        setCues(info.cues)
      })
      const nextCues = ensureCues(result.cues, result.text, (pcm.length / SAMPLE_RATE) * 1000)
      const srt = toSrt(nextCues)
      setCues(nextCues)
      await persistCapture({ srt, mime: 'audio/wav', kind: 'recording', blob })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'نویسه ناموفق بود')
      setMode('compose')
    } finally {
      setJob(null)
      setBusy(false)
      setCaptionPercent(0)
    }
  }, [persistCapture, setMedia])

  const onFile = useCallback(
    async (file: File) => {
      if (!ready) return
      const client = clientRef.current
      if (!client) return
      setMode('compose')
      setSelectedId(null)
      setCues([])
      setLiveText('')
      setNotice(null)
      setCaptionPercent(0)
      setBusy(true)
      try {
        const duration = await readMediaDuration(file)
        if (duration > MAX_MEDIA_SECONDS) {
          throw new Error('حداکثر طول فایل ۳ ساعت است')
        }
        const url = URL.createObjectURL(file)
        setMedia(url)
        setMime(file.type || (isVideoFile(file) ? 'video/mp4' : 'audio/mpeg'))
        setJob('extract')
        const pcm = await decodeAudioFile(file)
        if (pcm.length / SAMPLE_RATE > MAX_MEDIA_SECONDS) {
          throw new Error('حداکثر طول فایل ۳ ساعت است')
        }
        setJob('caption')
        const result = await client.caption(pcm, (info) => {
          setCaptionPercent(info.percent)
          setLiveText(info.text)
          setCues(info.cues)
        })
        const nextCues = ensureCues(result.cues, result.text, (pcm.length / SAMPLE_RATE) * 1000)
        setCues(nextCues)
        await persistCapture({
          srt: toSrt(nextCues),
          mime: file.type || (isVideoFile(file) ? 'video/mp4' : 'audio/mpeg'),
          kind: 'file',
          blob: file,
        })
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'نتوانستم فایل را بخوانم')
        setMode('compose')
      } finally {
        setJob(null)
        setBusy(false)
        setCaptionPercent(0)
      }
    },
    [persistCapture, ready, setMedia],
  )

  const goCompose = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (micRef.current) {
      void micRef.current.stop()
      micRef.current = null
    }
    clientRef.current?.cancel()
    setRecording(false)
    setVoiceLevel(0)
    setBusy(false)
    setJob(null)
    setSelectedId(null)
    setCues([])
    setLiveText('')
    setNotice(null)
    setMedia(null)
    setMode('compose')
  }, [setMedia])

  const onDelete = useCallback(
    async (id: string) => {
      await deleteNote(id)
      setNotes((current) => current.filter((note) => note.id !== id))
      if (selectedId === id) goCompose()
    },
    [goCompose, selectedId],
  )

  const onRename = useCallback(async (id: string, title: string) => {
    const updated = await renameNote(id, title)
    if (!updated) return
    setNotes((current) => current.map((note) => (note.id === id ? updated : note)))
  }, [])

  const onCopy = useCallback(async () => {
    const text = textFromCues(cues)
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success('کپی شد')
  }, [cues])

  const onDownloadText = useCallback(() => {
    const text = textFromCues(cues)
    if (!text) return
    downloadText('shenava.txt', text, 'text/plain')
  }, [cues])

  const onDownloadSrt = useCallback(() => {
    if (cues.length === 0) return
    downloadText('shenava.srt', toSrt(cues), 'application/x-subrip')
  }, [cues])

  const isMobile = useIsMobile()
  const [drawerLayout] = useState(readDrawerLayout)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [jumpToMs, setJumpToMs] = useState<number | null>(null)
  const [jumpNonce, setJumpNonce] = useState(0)

  const sidebar = (
    <AppSidebar
      notes={notes}
      selectedId={selectedId}
      onNewVoice={() => {
        goCompose()
        setMobileDrawerOpen(false)
      }}
      onSelect={(id, seekMs) => {
        setMobileDrawerOpen(false)
        void openNote(id, seekMs)
      }}
      onDelete={(id) => void onDelete(id)}
      onRename={(id, title) => void onRename(id, title)}
      hideSearchButton={isMobile}
      onSearch={() => setSearchOpen(true)}
      storeVoice={storeVoice}
      onStoreVoiceChange={(value) => {
        setStoreVoice(value)
        localStorage.setItem(STORE_VOICE_KEY, value ? '1' : '0')
      }}
    />
  )

  const searchDialog = (
    <NoteSearchDialog
      open={searchOpen}
      onOpenChange={setSearchOpen}
      notes={notes}
      onSelect={(id, seekMs) => {
        setMobileDrawerOpen(false)
        void openNote(id, seekMs)
      }}
    />
  )

  const workspace =
    mode === 'note' ? (
      <NotePanel
        cues={cues}
        mediaUrl={mediaUrl}
        mime={mime}
        jumpToMs={jumpToMs}
        jumpNonce={jumpNonce}
        onDownloadText={onDownloadText}
        onDownloadSrt={onDownloadSrt}
        onCopy={() => void onCopy()}
      />
    ) : (
      <ComposePanel
        ready={ready}
        recording={recording}
        voiceLevel={voiceLevel}
        busy={busy}
        job={job}
        captionPercent={captionPercent}
        liveText={
          liveText ||
          (recording
            ? 'گوش می‌دهم…'
            : job === 'extract'
              ? 'در حال جدا کردن صدا…'
              : job
                ? 'در حال نویسه…'
                : '')
        }
        notice={notice}
        onRecordToggle={() => void (recording ? stopRecording() : startRecording())}
        onFile={(file) => void onFile(file)}
        onCancel={() => clientRef.current?.cancel()}
      />
    )

  if (isMobile) {
    return (
      <>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-between gap-2 border-b px-3">
          <div className="flex items-center gap-2">
            <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="ghost" size="icon">
                  <PanelRightIcon />
                  <span className="sr-only">تاریخچه</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>تاریخچه</SheetTitle>
                </SheetHeader>
                {sidebar}
              </SheetContent>
            </Sheet>
            <span className="text-sm font-medium text-primary">شنوا کوچیک</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon />
            <span className="sr-only">جستجو</span>
          </Button>
        </header>
        {workspace}
        {searchDialog}
      </div>
      <ModelGate
        load={load}
        downloadBytes={downloadBytes}
        onDownload={startModelLoad}
      />
    </>
    )
  }

  return (
    <>
    <ResizablePanelGroup
      id="shenava-shell"
      orientation="horizontal"
      dir="ltr"
      className="h-full min-h-0 flex-1"
      defaultLayout={drawerLayout}
      onLayoutChanged={(layout) => {
        if (typeof layout.drawer === 'number' && typeof layout.main === 'number') {
          localStorage.setItem(
            DRAWER_LAYOUT_KEY,
            JSON.stringify({ drawer: layout.drawer, main: layout.main }),
          )
        }
      }}
    >
      <ResizablePanel id="main" defaultSize="80%" minSize="40%" className="min-h-0">
        <div dir="rtl" className="flex h-full min-h-0 flex-col overflow-hidden">
          {workspace}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="drawer"
        defaultSize="20%"
        minSize="14%"
        maxSize="42%"
        className="min-h-0"
      >
        <div dir="rtl" className="h-full min-h-0">
          {sidebar}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
    {searchDialog}
    <ModelGate
      load={load}
      downloadBytes={downloadBytes}
      onDownload={startModelLoad}
    />
    </>
  )
}

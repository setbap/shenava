import { useEffect, useRef, type CSSProperties } from 'react'
import { CircleIcon, UploadIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ModelGate, type LoadState } from '@/components/model-gate'
import { TranscriptView } from '@/components/transcript-view'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

function RecordButton({
  ready,
  busy,
  recording,
  voiceLevel,
  onRecordToggle,
}: {
  ready: boolean
  busy: boolean
  recording: boolean
  voiceLevel: number
  onRecordToggle: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const levelRef = useRef(voiceLevel)
  levelRef.current = voiceLevel

  useEffect(() => {
    const wrap = wrapRef.current
    if (!recording) {
      wrap?.style.setProperty('--beat', '1')
      wrap?.style.setProperty('--ring', '1')
      wrap?.style.setProperty('--glow', '0')
      return
    }
    let frame = 0
    const tick = (now: number) => {
      const level = levelRef.current
      const breath = (Math.sin(now / 430) + 1) / 2
      const beat = 1 + breath * 0.06 * (0.45 + level) + level * 0.16
      const ring = 1.08 + breath * 0.1 + level * 0.7
      wrap?.style.setProperty('--beat', String(beat))
      wrap?.style.setProperty('--ring', String(ring))
      wrap?.style.setProperty('--glow', String(0.2 + breath * 0.15 + level * 0.65))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [recording])

  return (
    <div
      ref={wrapRef}
      className="relative flex size-24 items-center justify-center"
      style={{ '--beat': 1, '--ring': 1, '--glow': 0 } as CSSProperties}
    >
      {recording ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute size-16 rounded-full bg-destructive/35"
            style={{
              transform: 'scale(var(--ring))',
              opacity: 'var(--glow)',
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-16 rounded-full border-2 border-destructive/70"
            style={{
              transform: 'scale(calc(var(--ring) * 0.92))',
              opacity: 'calc(var(--glow) * 0.85)',
            }}
          />
        </>
      ) : null}
      <Button
        type="button"
        size="icon-lg"
        variant={recording ? 'destructive' : 'default'}
        disabled={!ready || busy}
        className="relative z-10 size-16 rounded-full"
        style={recording ? { transform: 'scale(var(--beat))' } : undefined}
        onClick={onRecordToggle}
      >
        <CircleIcon className={cn('size-7', recording ? 'fill-current' : '')} />
        <span className="sr-only">{recording ? 'توقف ضبط' : 'شروع ضبط'}</span>
      </Button>
    </div>
  )
}

export function ComposePanel({
  ready,
  load,
  downloadBytes,
  recording,
  voiceLevel,
  busy,
  job,
  captionPercent,
  liveText,
  notice,
  onRecordToggle,
  onFile,
  onCancel,
}: {
  ready: boolean
  load: LoadState
  downloadBytes: { loaded: number; total: number } | null
  recording: boolean
  voiceLevel: number
  busy: boolean
  job: 'extract' | 'caption' | null
  captionPercent: number
  liveText: string
  notice: string | null
  onRecordToggle: () => void
  onFile: (file: File) => void
  onCancel: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-center border-b px-4 py-3">
        <p className="text-center text-sm text-muted-foreground">
          ضبط صدا یا انتخاب فایل صوتی / ویدیو
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-10">
          {load.status !== 'ready' ? (
            <ModelGate load={load} downloadBytes={downloadBytes} />
          ) : null}
          {notice ? <p className="text-sm text-destructive">{notice}</p> : null}
          {job === 'caption' ? (
            <div className="flex w-full max-w-md flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>در حال ساخت زیرنویس</span>
                <span className="tabular-nums">{Math.round(captionPercent)}٪</span>
              </div>
              <Progress value={captionPercent} />
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                لغو
              </Button>
            </div>
          ) : null}
          <TranscriptView cues={[]} currentMs={0} liveText={liveText} />
        </div>
      </ScrollArea>

      <div className="border-t bg-card/30">
        <div className="flex min-h-24">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-4">
            <RecordButton
              ready={ready}
              busy={busy}
              recording={recording}
              voiceLevel={voiceLevel}
              onRecordToggle={onRecordToggle}
            />
            <span className="text-xs text-muted-foreground">
              {recording ? 'توقف ضبط' : 'ضبط صدا'}
            </span>
          </div>
          <Separator orientation="vertical" />
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-4">
            <label
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'min-w-40 cursor-pointer',
                (!ready || busy || recording) && 'pointer-events-none opacity-50',
              )}
            >
              <input
                type="file"
                accept="audio/*,video/*,.wav,.mp3,.m4a,.ogg,.flac,.webm,.mp4,.m4v,.mkv,.mov"
                className="sr-only"
                disabled={!ready || busy || recording}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onFile(file)
                  event.target.value = ''
                }}
              />
              <UploadIcon data-icon="inline-start" />
              انتخاب فایل
            </label>
            <span className="text-xs text-muted-foreground">صوتی یا ویدیو</span>
          </div>
        </div>
      </div>
    </div>
  )
}

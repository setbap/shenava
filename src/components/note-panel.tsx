import { useEffect, useState } from 'react'
import { CopyIcon, FileTextIcon, SubtitlesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MediaPlayer } from '@/components/media-player'
import { TranscriptView } from '@/components/transcript-view'
import type { Cue } from '@/lib/subtitles'

export function NotePanel({
  cues,
  mediaUrl,
  mime,
  jumpToMs = null,
  jumpNonce = 0,
  onDownloadText,
  onDownloadSrt,
  onCopy,
}: {
  cues: Cue[]
  mediaUrl: string | null
  mime: string
  jumpToMs?: number | null
  jumpNonce?: number
  onDownloadText: () => void
  onDownloadSrt: () => void
  onCopy: () => void
}) {
  const [currentMs, setCurrentMs] = useState(0)
  const [seekMs, setSeekMs] = useState<number | null>(null)
  const [seekNonce, setSeekNonce] = useState(0)

  useEffect(() => {
    setCurrentMs(0)
    setSeekMs(null)
  }, [mediaUrl])

  useEffect(() => {
    if (jumpToMs == null) return
    setSeekMs(jumpToMs)
    setCurrentMs(jumpToMs)
    setSeekNonce((n) => n + 1)
  }, [jumpToMs, jumpNonce])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <Button type="button" variant="outline" onClick={onDownloadText} disabled={cues.length === 0}>
          <FileTextIcon data-icon="inline-start" />
          دانلود متن
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCopy} disabled={cues.length === 0}>
            <CopyIcon data-icon="inline-start" />
            رونوشت
          </Button>
          <Button type="button" variant="outline" onClick={onDownloadSrt} disabled={cues.length === 0}>
            <SubtitlesIcon data-icon="inline-start" />
            دانلود SRT
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-8">
          <TranscriptView
            cues={cues}
            currentMs={currentMs}
            syncPlayback={Boolean(mediaUrl)}
            onSeek={
              mediaUrl
                ? (ms) => {
                    setSeekMs(ms)
                    setSeekNonce((n) => n + 1)
                    setCurrentMs(ms)
                  }
                : undefined
            }
          />
        </div>
      </ScrollArea>

      {mediaUrl ? (
        <MediaPlayer
          src={mediaUrl}
          mime={mime}
          onTime={setCurrentMs}
          seekRequest={seekMs}
          seekNonce={seekNonce}
        />
      ) : (
        <p className="flex h-16 items-center justify-center border-t bg-card/40 px-4 text-center text-sm text-muted-foreground">
          فایل صدا ذخیره نشده
        </p>
      )}
    </div>
  )
}

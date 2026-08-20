import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Cue } from '@/lib/subtitles'

export function TranscriptView({
  cues,
  currentMs,
  onSeek,
  liveText,
  syncPlayback = false,
}: {
  cues: Cue[]
  currentMs: number
  onSeek?: (ms: number) => void
  liveText?: string
  syncPlayback?: boolean
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const activeIndex = syncPlayback
    ? cues.findLastIndex((cue) => currentMs >= cue.startMs)
    : -1

  useEffect(() => {
    if (!syncPlayback) return
    activeRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [activeIndex, syncPlayback])

  if (cues.length === 0) {
    return (
      <p
        className={cn(
          'max-w-3xl text-lg leading-8',
          liveText ? 'text-foreground' : 'text-muted-foreground/50',
        )}
      >
        {liveText || 'متن اینجا ظاهر می‌شود.'}
      </p>
    )
  }

  return (
    <div className="max-w-3xl space-y-3 text-lg leading-8">
      {cues.map((cue, index) => {
        const active = index === activeIndex
        return (
          <button
            key={`${cue.startMs}-${cue.endMs}-${index}`}
            ref={active ? activeRef : undefined}
            type="button"
            className={cn(
              'block w-full text-start',
              !syncPlayback ? 'text-foreground' : active ? 'text-primary' : 'text-muted-foreground/40',
              onSeek && 'hover:text-primary/80',
            )}
            onClick={() => onSeek?.(cue.startMs)}
          >
            {cue.text}
          </button>
        )
      })}
    </div>
  )
}

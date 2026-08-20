import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon, Volume1Icon, Volume2Icon, VolumeXIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { isVideoMime } from '@/lib/audio'
import { formatClock, formatFaNumber } from '@/lib/subtitles'

function VolumeIcon({ volume }: { volume: number }) {
  if (volume === 0) return <VolumeXIcon />
  if (volume < 0.5) return <Volume1Icon />
  return <Volume2Icon />
}

export function MediaPlayer({
  src,
  mime,
  onTime,
  seekRequest,
  seekNonce,
}: {
  src: string
  mime: string
  onTime: (ms: number) => void
  seekRequest: number | null
  seekNonce: number
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const onTimeRef = useRef(onTime)
  const lastAudibleVolume = useRef(1)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [speed, setSpeed] = useState(1)
  const video = isVideoMime(mime)
  onTimeRef.current = onTime

  const publish = (seconds: number) => {
    setCurrent(seconds)
    onTimeRef.current(seconds * 1000)
    const media = mediaRef.current
    const nextDuration = media && Number.isFinite(media.duration) ? media.duration : 0
    setDuration((prev) => (prev === nextDuration ? prev : nextDuration))
  }

  const applyMediaSettings = () => {
    const el = mediaRef.current
    if (!el) return
    el.volume = volume
    el.muted = volume === 0
    el.playbackRate = speed
  }

  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    el.currentTime = 0
    setPlaying(false)
    publish(0)
    applyMediaSettings()
  }, [src])

  useEffect(() => {
    applyMediaSettings()
  }, [volume, speed])

  useEffect(() => {
    if (seekRequest === null) return
    const el = mediaRef.current
    if (!el) return
    el.currentTime = seekRequest / 1000
    publish(seekRequest / 1000)
  }, [seekRequest, seekNonce])

  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    let raf = 0

    const tick = () => {
      publish(el.currentTime)
      raf = requestAnimationFrame(tick)
    }

    const startClock = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    }

    const onPlay = () => {
      setPlaying(true)
      startClock()
    }
    const onPause = () => {
      setPlaying(false)
      cancelAnimationFrame(raf)
      publish(el.currentTime)
    }
    const onEnded = () => {
      setPlaying(false)
      cancelAnimationFrame(raf)
      publish(el.currentTime)
    }
    const onSeeked = () => {
      publish(el.currentTime)
      if (!el.paused) startClock()
    }

    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('loadedmetadata', onSeeked)
    el.addEventListener('seeked', onSeeked)

    if (!el.paused) startClock()

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('loadedmetadata', onSeeked)
      el.removeEventListener('seeked', onSeeked)
    }
  }, [src])

  const toggle = async () => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) await el.play()
    else el.pause()
  }

  return (
    <div className="flex flex-col bg-card/40">
      {video ? (
        <video
          ref={(el) => {
            mediaRef.current = el
          }}
          src={src}
          className="mx-auto max-h-56 w-full rounded-lg bg-black"
          playsInline
        />
      ) : (
        <audio
          ref={(el) => {
            mediaRef.current = el
          }}
          src={src}
          className="hidden"
        />
      )}
      <div dir="ltr" className="flex h-16 items-center gap-3 border-t px-4 select-none">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="outline">
              <VolumeIcon volume={volume} />
              <span className="sr-only">صدا</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" side="top" className="w-12 items-center p-3" dir="ltr">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {formatFaNumber(Math.round(volume * 100))}
            </span>
            <Slider
              orientation="vertical"
              min={0}
              max={1}
              step={0.01}
              className="h-28 min-h-28"
              value={[volume]}
              onValueChange={(value) => {
                const next = value[0] ?? 0
                if (next > 0) lastAudibleVolume.current = next
                setVolume(next)
              }}
            />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="outline" className="text-xs tabular-nums">
              {`${formatFaNumber(speed)}×`}
              <span className="sr-only">سرعت پخش</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" side="top" className="w-12 items-center p-3" dir="ltr">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {`${formatFaNumber(speed)}×`}
            </span>
            <Slider
              orientation="vertical"
              min={0.5}
              max={2}
              step={0.25}
              className="h-28 min-h-28"
              value={[speed]}
              onValueChange={(value) => setSpeed(Number((value[0] ?? 1).toFixed(2)))}
            />
          </PopoverContent>
        </Popover>
        <span className="w-12 text-xs tabular-nums text-muted-foreground">
          {formatClock(duration * 1000)}
        </span>
        <Slider
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.05}
          value={[current]}
          onValueChange={(value) => {
            const next = value[0] ?? 0
            const el = mediaRef.current
            if (el) el.currentTime = next
            publish(next)
          }}
        />
        <span className="w-12 text-end text-xs tabular-nums text-muted-foreground">
          {formatClock(current * 1000)}
        </span>
        <Button type="button" size="icon" variant="outline" onClick={() => void toggle()}>
          {playing ? <PauseIcon className="rotate-180" /> : <PlayIcon className="rotate-180" />}
          <span className="sr-only">{playing ? 'توقف' : 'پخش'}</span>
        </Button>
      </div>
    </div>
  )
}

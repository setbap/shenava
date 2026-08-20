import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { AsrBackend, ModelSource } from '@/lib/protocol'

export type LoadState =
  | { status: 'loading'; phase: 'download' | 'compile'; percent: number }
  | { status: 'ready'; backend: AsrBackend; source: ModelSource }
  | { status: 'error'; message: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} کیلوبایت`
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`
}

function sourceLabel(source: ModelSource): string {
  if (source === 'local') return 'محلی'
  if (source === 'cache') return 'کش دستگاه'
  return 'هاب'
}

export function ModelGate({
  load,
  downloadBytes,
}: {
  load: LoadState
  downloadBytes: { loaded: number; total: number } | null
}) {
  if (load.status === 'ready') {
    return (
      <Badge variant="outline">
        آماده · {load.backend === 'webgpu' ? 'WebGPU' : 'WASM'} · {sourceLabel(load.source)}
      </Badge>
    )
  }

  if (load.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>مدل بارگذاری نشد</AlertTitle>
        <AlertDescription>{load.message}</AlertDescription>
      </Alert>
    )
  }

  const label = load.phase === 'compile' ? 'آماده‌سازی موتور' : 'بارگذاری مدل'
  const extra =
    load.phase === 'download' && downloadBytes && downloadBytes.total > 1
      ? ` ${formatBytes(downloadBytes.loaded)} / ${formatBytes(downloadBytes.total)}`
      : ''

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {label}
          {extra}
        </span>
        <span className="tabular-nums">{Math.round(load.percent)}٪</span>
      </div>
      <Progress value={load.percent} />
    </div>
  )
}

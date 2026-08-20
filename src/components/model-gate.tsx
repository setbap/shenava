import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AsrBackend, ModelSource } from '@/lib/protocol'
import { formatFaNumber } from '@/lib/subtitles'

export type LoadState =
  | { status: 'checking' }
  | { status: 'needed' }
  | { status: 'loading'; phase: 'download' | 'compile'; percent: number }
  | { status: 'ready'; backend: AsrBackend; source: ModelSource }
  | { status: 'error'; message: string }

function formatMegabytes(bytes: number): string {
  return `${formatFaNumber(Math.max(0, Math.round(bytes / (1024 * 1024))))} مگ`
}

export function ModelGate({
  load,
  downloadBytes,
  onDownload,
}: {
  load: LoadState
  downloadBytes: { loaded: number; total: number } | null
  onDownload: () => void
}) {
  if (load.status === 'ready') return null

  const percent = load.status === 'loading' ? load.percent : 0
  const downloaded =
    load.status === 'loading' &&
    load.phase === 'download' &&
    downloadBytes &&
    downloadBytes.total > 1
      ? `${formatMegabytes(downloadBytes.loaded)} از حدود ۲۲۰ مگ`
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-setup-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-popover p-6 text-popover-foreground ring-1 ring-foreground/10"
      >
        {load.status === 'checking' ? (
          <>
            <h1 id="model-setup-title" className="font-heading text-lg font-medium">
              شنوا کوچیک
            </h1>
            <p className="leading-7 text-muted-foreground">یک لحظه…</p>
          </>
        ) : null}

        {load.status === 'needed' ? (
          <>
            <h1 id="model-setup-title" className="font-heading text-lg font-medium">
              خوش اومدی
            </h1>
            <p className="text-pretty leading-8 text-muted-foreground">
              برای این‌که بتونی حرف بزنی و متنش رو ببینی، باید مدل شنوا کوچیک رو روی همین
              دستگاه دانلود کنی. حدود ۲۲۰ مگ حجمشه؛ یه‌بار که اومد، آفلاین هم کار می‌کنه و
              صدات از دستگاهت بیرون نمی‌ره.
            </p>
            <Button type="button" size="lg" className="h-11 min-h-11 text-base" onClick={onDownload}>
              <DownloadIcon data-icon="inline-start" />
              دانلود مدل
            </Button>
          </>
        ) : null}

        {load.status === 'loading' ? (
          <>
            <h1 id="model-setup-title" className="font-heading text-lg font-medium">
              {load.phase === 'compile' ? 'داره آماده می‌شه' : 'داره دانلود می‌شه'}
            </h1>
            <p className="text-pretty leading-8 text-muted-foreground">
              {load.phase === 'compile'
                ? 'داره روی دستگاهت سوار می‌شه. این مرحله گاهی تا یک دقیقه طول می‌کشه، نگران نباش.'
                : 'یه کم طول می‌کشه، ولی فقط همین یه‌باره. حدود ۲۲۰ مگ حجمشه.'}
            </p>
            <div className="flex w-full flex-col gap-2">
              {load.phase === 'download' ? (
                <>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{downloaded ?? 'دانلود مدل'}</span>
                    <span className="tabular-nums">{formatFaNumber(Math.round(percent))}٪</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">آماده‌سازی موتور</span>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-full animate-pulse rounded-full bg-primary/80" />
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}

        {load.status === 'error' ? (
          <>
            <h1 id="model-setup-title" className="font-heading text-lg font-medium">
              دانلود نشد
            </h1>
            <p className="text-pretty leading-8 text-muted-foreground">{load.message}</p>
            <p className="text-pretty text-sm leading-7 text-muted-foreground">
              اینترنتت رو چک کن و دوباره امتحان کن. مدل حدود ۲۲۰ مگه و باید روی دستگاهت
              بمونه.
            </p>
            <Button type="button" size="lg" className="h-11 min-h-11 text-base" onClick={onDownload}>
              تلاش دوباره
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

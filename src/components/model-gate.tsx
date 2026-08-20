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
  prompted,
  onDownload,
}: {
  load: LoadState
  downloadBytes: { loaded: number; total: number } | null
  prompted: boolean
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-setup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-blue-600 px-6 text-white"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        {load.status === 'checking' || (load.status === 'loading' && !prompted) ? (
          <>
            <h1 id="model-setup-title" className="text-2xl font-medium">
              شنوا کوچیک
            </h1>
            <p className="text-white/85">یک لحظه، داره آماده می‌شه…</p>
          </>
        ) : null}

        {load.status === 'needed' ? (
          <>
            <h1 id="model-setup-title" className="text-2xl font-medium">
              خوش اومدی
            </h1>
            <p className="text-pretty leading-8 text-white/90">
              برای این‌که بتونی حرف بزنی و متنش رو ببینی، باید مدل شنوا کوچیک رو روی همین
              دستگاه دانلود کنی. حدود ۲۲۰ مگ حجمشه؛ یه‌بار که اومد، آفلاین هم کار می‌کنه و
              صدات از دستگاهت بیرون نمی‌ره.
            </p>
            <Button
              type="button"
              size="lg"
              className="h-11 min-h-11 bg-white px-6 text-base text-blue-700 hover:bg-white/90"
              onClick={onDownload}
            >
              <DownloadIcon data-icon="inline-start" />
              دانلود مدل
            </Button>
          </>
        ) : null}

        {load.status === 'loading' && prompted ? (
          <>
            <h1 id="model-setup-title" className="text-2xl font-medium">
              {load.phase === 'compile' ? 'داره آماده می‌شه' : 'داره دانلود می‌شه'}
            </h1>
            <p className="text-pretty leading-8 text-white/90">
              {load.phase === 'compile'
                ? 'چند لحظه دیگه موتور روی دستگاهت بالا میاد.'
                : 'یه کم طول می‌کشه، ولی فقط همین یه‌باره. حدود ۲۲۰ مگ حجمشه.'}
            </p>
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-white/85">
                <span>{downloaded ?? (load.phase === 'compile' ? 'آماده‌سازی' : 'دانلود مدل')}</span>
                <span className="tabular-nums">{formatFaNumber(Math.round(percent))}٪</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
              </div>
            </div>
          </>
        ) : null}

        {load.status === 'error' ? (
          <>
            <h1 id="model-setup-title" className="text-2xl font-medium">
              دانلود نشد
            </h1>
            <p className="text-pretty leading-8 text-white/90">{load.message}</p>
            <p className="text-pretty text-sm leading-7 text-white/80">
              اینترنتت رو چک کن و دوباره امتحان کن. مدل حدود ۲۲۰ مگه و باید روی دستگاهت
              بمونه.
            </p>
            <Button
              type="button"
              size="lg"
              className="h-11 min-h-11 bg-white px-6 text-base text-blue-700 hover:bg-white/90"
              onClick={onDownload}
            >
              تلاش دوباره
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

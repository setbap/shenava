import { useEffect, useState, type ReactNode } from 'react'
import {
  AudioLinesIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FileIcon,
  InfoIcon,
  MicIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { NoteMeta } from '@/lib/notes'
import {
  firstMatchStartMs,
  parseSrt,
  textFromSrt,
  textMatchesQuery,
} from '@/lib/subtitles'

export function AppSidebar({
  notes,
  selectedId,
  onNewVoice,
  onSelect,
  onDelete,
  onRename,
  storeVoice,
  onStoreVoiceChange,
  hideSearchButton = false,
  onSearch,
}: {
  notes: NoteMeta[]
  selectedId: string | null
  onNewVoice: () => void
  onSelect: (id: string, seekMs?: number) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  storeVoice: boolean
  onStoreVoiceChange: (value: boolean) => void
  hideSearchButton?: boolean
  onSearch?: () => void
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingRename, setPendingRename] = useState<{ id: string; title: string } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(true)

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card/30 text-sidebar-foreground select-none">
      <div className="flex flex-col gap-4 p-3 pb-4">
        <div className="flex items-center gap-2 px-1">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">شنوا کوچیک</h1>
          <AboutDialog />
        </div>
        <Button type="button" className="w-full bg-foreground text-background hover:bg-foreground/80" onClick={onNewVoice}>
          یادداشت جدید
        </Button>
      </div>
      <div className="flex items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-1 px-2 py-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
          aria-expanded={historyOpen}
        >
          <ChevronDownIcon
            className={cn('size-3.5 transition-transform', !historyOpen && 'ltr:-rotate-90 rtl:rotate-90')}
          />
          تاریخچه
        </button>
        {hideSearchButton ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-primary hover:bg-primary/10 hover:text-primary"
            onClick={onSearch}
          >
            <SearchIcon />
            <span className="sr-only">جستجو</span>
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {historyOpen ? (
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {notes.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-sidebar-foreground/60">
              هنوز یادداشتی نیست
            </p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="group/item relative">
                <button
                  type="button"
                  onClick={() => onSelect(note.id)}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 pe-14 text-start text-sm outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2',
                    selectedId === note.id &&
                      'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                  )}
                >
                  {note.kind === 'recording' ? (
                    <MicIcon
                      className={cn('size-4 shrink-0', selectedId === note.id && 'text-primary')}
                    />
                  ) : (
                    <FileIcon
                      className={cn('size-4 shrink-0', selectedId === note.id && 'text-primary')}
                    />
                  )}
                  <span className="truncate">{note.title}</span>
                </button>
                <div className="absolute end-1 top-1 flex opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setPendingRename({ id: note.id, title: note.title })}
                  >
                    <PencilIcon />
                    <span className="sr-only">تغییر نام</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setPendingDelete(note.id)}
                  >
                    <Trash2Icon />
                    <span className="sr-only">حذف</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        ) : null}
      </ScrollArea>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف یادداشت؟</AlertDialogTitle>
            <AlertDialogDescription>
              متن، زیرنویس و فایل صدا از روی این دستگاه پاک می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete)
                setPendingDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingRename !== null}
        onOpenChange={(open) => !open && setPendingRename(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغییر نام</AlertDialogTitle>
            <AlertDialogDescription>
              نام تازه این یادداشت را بنویسید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={pendingRename?.title ?? ''}
            onChange={(event) =>
              setPendingRename((current) =>
                current ? { ...current, title: event.target.value } : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !pendingRename?.title.trim()) return
              onRename(pendingRename.id, pendingRename.title)
              setPendingRename(null)
            }}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingRename?.title.trim()}
              onClick={() => {
                if (!pendingRename?.title.trim()) return
                onRename(pendingRename.id, pendingRename.title)
                setPendingRename(null)
              }}
            >
              ذخیره
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex h-16 items-center border-t px-4">
        <label
          htmlFor="store-voice"
          className="flex cursor-pointer items-center justify-between gap-3 text-sm"
        >
          <span>ذخیره صدا با یادداشت</span>
          <Switch
            id="store-voice"
            size="sm"
            checked={storeVoice}
            onCheckedChange={onStoreVoiceChange}
          />
        </label>
      </div>
    </div>
  )
}

const HF_MODEL_URL = 'https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0'
const GITHUB_URL = 'https://github.com/setbap/shenava'

function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <InfoIcon className="size-4" />
          <span className="sr-only">درباره و منابع</span>
        </button>
      </DialogTrigger>
      <DialogContent className="gap-5 sm:max-w-md" dir="rtl">
        <DialogHeader className="gap-3 pe-8">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
            <InfoIcon className="size-5" />
          </div>
          <DialogTitle className="text-lg">درباره شنوا کوچیک</DialogTitle>
          <DialogDescription className="text-pretty leading-7">
            یه اپ یادداشت‌برداری ساده که به‌جای این‌که تایپ کنی، صدا ضبط می‌کنی یا فایل می‌فرستی.
            همهٔ کارها تو مرورگر خودت انجام می‌شه (با مدل شنوا کوچیک) و صدا به هیچ جایی
            آپلود نمی‌شه :)
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <AboutLink
            href={HF_MODEL_URL}
            icon={<AudioLinesIcon className="size-5" />}
            title="مدل شنوا کوچیک"
            hint="صفحه مدل روی هاگینگ‌فیس"
          />
          <AboutLink
            href={GITHUB_URL}
            icon={<GitHubMark className="size-5" />}
            title="کد پروژه"
            hint="مخزن گیت‌هاب"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.56 9.56 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  )
}

function AboutLink({
  href,
  icon,
  title,
  hint,
}: {
  href: string
  icon: ReactNode
  title: string
  hint: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-xl bg-muted/50 p-3 ring-1 ring-foreground/8 transition-colors hover:bg-muted hover:ring-foreground/15"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-foreground ring-1 ring-foreground/10">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-start">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </a>
  )
}

export function NoteSearchDialog({
  open,
  onOpenChange,
  notes,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: NoteMeta[]
  onSelect: (id: string, seekMs?: number) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenChange])

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSearchQuery('')
      }}
      title="جستجوی یادداشت"
      description="در متن یادداشت‌ها جستجو کنید"
      className="sm:max-w-lg"
    >
      <Command
        shouldFilter
        filter={(value, search, keywords) => {
          const haystack = `${keywords?.join(' ') ?? ''} ${value}`
          return textMatchesQuery(haystack, search) ? 1 : 0
        }}
      >
        <CommandInput
          placeholder="جستجو در متن یادداشت…"
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>یادداشتی پیدا نشد</CommandEmpty>
          <CommandGroup heading="یادداشت‌ها">
            {notes.map((note) => {
              const text = textFromSrt(note.srt)
              return (
                <CommandItem
                  key={note.id}
                  value={`${note.title} ${note.id}`}
                  keywords={[text]}
                  onSelect={() => {
                    const seekMs = firstMatchStartMs(parseSrt(note.srt), searchQuery)
                    onSelect(note.id, seekMs)
                    onOpenChange(false)
                    setSearchQuery('')
                  }}
                >
                  {note.kind === 'recording' ? <MicIcon /> : <FileIcon />}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{note.title}</span>
                    {text ? (
                      <span className="truncate text-xs text-muted-foreground">{text}</span>
                    ) : null}
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

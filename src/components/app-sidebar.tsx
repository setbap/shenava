import { useEffect, useState } from 'react'
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  FileIcon,
  MicIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
          <a
            href="https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0"
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ExternalLinkIcon className="size-4" />
            <span className="sr-only">مدل در هاگینگ‌فیس</span>
          </a>
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

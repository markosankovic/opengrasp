import { FileUp, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { listRecentDocuments, removeDocument } from '../db'
import type { DocumentMeta } from '../db/schema'
import { shortcutsBlocked } from '../keyboard'
import { handleFromDrop, pickPdf, type PickedFile } from '../pdf/fileAccess'
import { openPdf, type OpenedPdf } from '../pdf/openPdf'
import { reopenInteractive } from '../pdf/reopen'
import HelpButton from './Help'
import Logo from './Logo'

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function timeAgo(timestamp: number): string {
  const minutes = Math.round((timestamp - Date.now()) / 60_000)
  if (minutes > -60) return relativeTime.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours > -24) return relativeTime.format(hours, 'hour')
  return relativeTime.format(Math.round(hours / 24), 'day')
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export default function Library({ onOpened }: { onOpened: (opened: OpenedPdf) => void }) {
  const [recent, setRecent] = useState<DocumentMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    listRecentDocuments()
      .then(setRecent)
      .catch((e: unknown) => setError(`Could not load the library: ${e instanceof Error ? e.message : String(e)}`))
  }, [])

  async function open(picked: PickedFile | null | undefined) {
    if (!picked) return
    const { file } = picked
    if (!isPdf(file)) {
      setError(`${file.name} is not a PDF.`)
      return
    }
    try {
      setError(null)
      onOpened(await openPdf(picked))
    } catch (e) {
      setError(`Could not open ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function pick() {
    try {
      await open(await pickPdf())
    } catch (e) {
      setError(`Could not open the file picker: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** Reopens a library document from its stored file handle, or asks for the file if there is none. */
  async function reopen(doc: DocumentMeta) {
    try {
      const { picked, message } = await reopenInteractive(doc)
      setError(message ?? null)
      await open(picked)
    } catch (e) {
      setError(`Could not open ${doc.fileName}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // o / Ctrl+O loads a PDF, 1–9 open the documents in list order (SPEC.md §5.7).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutsBlocked(e) || e.altKey || confirmingRemove) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'o' && !e.shiftKey) {
        // Ctrl+O would otherwise open the browser's own file dialog.
        e.preventDefault()
        void pick()
        return
      }
      if (mod) return
      const doc = /^[1-9]$/.test(e.key) ? recent[Number(e.key) - 1] : undefined
      if (!doc) return
      e.preventDefault()
      void reopen(doc)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function remove(doc: DocumentMeta) {
    setConfirmingRemove(null)
    await removeDocument(doc.id)
    setRecent((docs) => docs.filter((d) => d.id !== doc.id))
  }

  // Dropping a PDF anywhere in the window opens it (SPEC.md §5.2).
  // The drop area lights up while a file is dragged over the window (enter/leave fire per child, hence the depth count).
  const dragDepth = useRef(0)
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      dragDepth.current++
      setDragging(true)
    }
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      const handle = handleFromDrop(e)
      if (file) void handle.then((h) => open({ file, handle: h }))
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  })

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <header className="flex h-16 items-center justify-between">
        <h1 aria-label="OpenGrasp">
          <Logo />
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void pick()}
            title="Load PDF (o)"
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 font-medium text-muted hover:bg-surface hover:text-text"
          >
            <FileUp size={16} aria-hidden />
            {/* Browsers snap the baseline up to a whole pixel here; the 0.5px nudge was measured to center it exactly. */}
            <span className="text-trim relative top-[0.5px]">Load PDF</span>
          </button>
          <HelpButton className="rounded-lg p-[7px] text-muted hover:bg-surface hover:text-text" />
        </div>
      </header>

      {error && <p className="py-2 text-danger">{error}</p>}

      {recent.length > 0 ? (
        <h2 className="mt-10 mb-3 text-xs font-medium tracking-wider text-muted uppercase">Recent</h2>
      ) : null}

      {recent.length > 0 ? (
        <ul className="-mx-3 flex flex-col gap-1">
          {recent.map((doc, i) => (
            <li key={doc.id} className="group flex items-center gap-2 rounded-lg hover:bg-surface">
              {confirmingRemove === doc.id ? (
                <div
                  className="flex w-full items-center gap-6 rounded-lg bg-surface px-3 py-3.5"
                  onKeyDown={(e) => e.key === 'Escape' && setConfirmingRemove(null)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-snug">
                      Remove <span className="font-medium">{doc.title ?? doc.fileName}</span>?
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted">
                      Its reading position, notes and highlights are deleted. The PDF file is not touched.
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(null)}
                      className="rounded-lg px-3 py-1.5 font-medium text-muted hover:bg-bg hover:text-text"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => void remove(doc)}
                      className="rounded-lg bg-danger/10 px-3 py-1.5 font-medium text-danger hover:bg-danger/15"
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void reopen(doc)}
                    title={i < 9 ? `Open ${doc.fileName} (${i + 1})` : `Open ${doc.fileName}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-6 rounded-lg px-3 py-3.5 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] leading-snug font-medium">
                        {doc.title ?? doc.fileName}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {doc.title ? `${doc.fileName} · ` : ''}
                        {timeAgo(doc.lastOpenedAt)}
                      </span>
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs font-medium text-muted tabular-nums">
                      {Math.round((doc.progress.pageNumber / doc.pageCount) * 100)}%
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(doc.id)}
                    aria-label={`Remove ${doc.title ?? doc.fileName} from the library`}
                    title="Remove from library"
                    className="mr-2 rounded-lg p-2 text-muted opacity-0 group-hover:opacity-100 hover:bg-bg hover:text-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Sits at the bottom of the page; mt-auto pushes it down below the list. */}
      <div className="mt-auto pt-12 pb-10">
        <button
          type="button"
          onClick={() => void pick()}
          className={`group/drop flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors ${
            dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-muted/50 hover:bg-surface/60'
          }`}
        >
          <span
            className={`rounded-2xl p-4 transition-colors ${dragging ? 'bg-accent/15 text-accent' : 'bg-surface text-muted group-hover/drop:text-text'}`}
          >
            <FileUp size={32} strokeWidth={1.5} aria-hidden />
          </span>
          <span className="text-[15px] font-medium">{dragging ? 'Drop to open' : 'Drop a PDF here'}</span>
          <span className="text-xs text-muted">
            or <span className="font-medium text-accent">browse your files</span> · PDFs never leave your device
          </span>
        </button>
        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>
            © 2026{' '}
            <a
              href="https://github.com/markosankovic"
              target="_blank"
              rel="noreferrer"
              className="hover:text-text hover:underline"
            >
              Marko Sanković
            </a>
          </span>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/markosankovic/opengrasp/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text hover:underline"
          >
            MIT License
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/markosankovic/opengrasp"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text hover:underline"
          >
            GitHub
          </a>
        </footer>
      </div>
    </div>
  )
}

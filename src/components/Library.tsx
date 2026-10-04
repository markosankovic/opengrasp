import { ChevronDown, Download, FileUp, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { exportAll, importAll, listRecentDocuments, removeDocument, type ImportCounts } from '../db'
import { ExportFileError, exportFileName, parseExportFile } from '../db/exportFile'
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

function isJson(file: File): boolean {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')
}

/** Opens a picker for an export file. Returns null if the user cancels. */
function pickExportFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.hidden = true
    const done = (file: File | null) => {
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => done(null), { once: true })
    document.body.append(input)
    input.click()
  })
}

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** "Imported 3 documents, 41 highlights and 12 notes." */
function importSummary(counts: ImportCounts): string {
  const parts = (
    [
      [counts.documents, 'document'],
      [counts.highlights, 'highlight'],
      [counts.notes, 'note'],
      [counts.conversations, 'conversation'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, noun]) => `${n} ${noun}${n === 1 ? '' : 's'}`)
  if (parts.length === 0) return 'Nothing to import: the library already has everything in this file.'
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
  return `Imported ${list}.`
}

export default function Library({ onOpened }: { onOpened: (opened: OpenedPdf) => void }) {
  const [recent, setRecent] = useState<DocumentMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hiddenBelow, setHiddenBelow] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRecentDocuments()
      .then(setRecent)
      .catch((e: unknown) => setError(`Could not load the library: ${e instanceof Error ? e.message : String(e)}`))
  }, [])

  async function open(picked: PickedFile | null | undefined) {
    if (!picked) return
    const { file } = picked
    if (isJson(file)) {
      await importFile(file)
      return
    }
    if (!isPdf(file)) {
      setError(`${file.name} is not a PDF.`)
      return
    }
    try {
      setError(null)
      setNotice(null)
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

  /** Downloads everything but the PDFs and file handles as one JSON file (SPEC.md §4.6). */
  async function exportLibrary() {
    try {
      download(exportFileName(), JSON.stringify(await exportAll(), null, 2))
    } catch (e) {
      setError(`Could not export the library: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** Merges an export file into the library; nothing is deleted (SPEC.md §4.6). */
  async function importFile(file: File | null) {
    if (!file) return
    setError(null)
    setNotice(null)
    try {
      const counts = await importAll(parseExportFile(await file.text()))
      setNotice(importSummary(counts))
      setRecent(await listRecentDocuments())
    } catch (e) {
      const reason = e instanceof ExportFileError ? e.message : `Could not import ${file.name}: ${e instanceof Error ? e.message : String(e)}`
      setError(reason)
    }
  }

  async function remove(doc: DocumentMeta) {
    setConfirmingRemove(null)
    await removeDocument(doc.id)
    setRecent((docs) => docs.filter((d) => d.id !== doc.id))
  }

  // How many rows are (partly) hidden under the pinned drop area, for the "N more" pill above it.
  useEffect(() => {
    const update = () => {
      const edge = bottomRef.current?.getBoundingClientRect().top ?? Infinity
      const rows = Array.from(listRef.current?.children ?? [])
      setHiddenBelow(rows.filter((row) => row.getBoundingClientRect().bottom > edge + 1).length)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [recent])

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
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      {/* The header and the drop area stay in place while the list scrolls, on screens tall enough to spare the room. */}
      <header className="top-0 z-10 flex h-16 items-center justify-between bg-bg [@media(min-height:800px)]:sticky">
        <h1 aria-label="OpenGrasp">
          <Logo />
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void pickExportFile().then(importFile)}
            aria-label="Import library"
            title="Import notes, highlights and reading positions from an export file"
            className="btn-icon text-muted hover:bg-surface hover:text-text"
          >
            <Upload size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void exportLibrary()}
            disabled={recent.length === 0}
            aria-label="Export library"
            title="Export notes, highlights and reading positions to a file (PDFs aren't included)"
            className="btn-icon text-muted enabled:hover:bg-surface enabled:hover:text-text disabled:opacity-40"
          >
            <Download size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void pick()}
            title="Load PDF (o)"
            className="btn text-muted hover:bg-surface hover:text-text"
          >
            <FileUp size={16} aria-hidden />
            <span>Load PDF</span>
          </button>
          <HelpButton className="btn-icon text-muted hover:bg-surface hover:text-text" />
        </div>
      </header>

      {error && <p className="py-2 text-danger">{error}</p>}
      {notice && <p className="py-2 text-muted">{notice}</p>}

      {recent.length > 0 ? (
        <h2 className="mt-10 mb-3 px-3 text-xs font-medium tracking-wider text-muted uppercase">
          Recent <span className="ml-1 font-normal tabular-nums">{recent.length}</span>
        </h2>
      ) : null}

      {recent.length > 0 ? (
        <ul ref={listRef} className="flex flex-col gap-1">
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
                      Its reading position, notes, highlights and AI conversations are deleted. The PDF file is not touched.
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(null)}
                      className="btn text-muted hover:bg-bg hover:text-text"
                    >
                      <span>Cancel</span>
                    </button>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => void remove(doc)}
                      className="btn bg-danger/10 text-danger hover:bg-danger/15"
                    >
                      <span>Remove</span>
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void reopen(doc)}
                    title={i < 9 ? `Open ${doc.fileName} (${i + 1})` : `Open ${doc.fileName}`}
                    aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                    className="flex min-w-0 flex-1 items-center gap-6 rounded-lg px-3 py-3.5 text-left"
                  >
                    {/* The key that opens the row; an empty slot past 9 keeps the titles aligned. Hidden without a keyboard. */}
                    <span
                      aria-hidden
                      className="-mr-3 inline-flex size-5 shrink-0 items-center justify-center rounded border border-border font-mono text-[11px] text-muted data-[empty]:invisible [@media(hover:none)]:hidden"
                      data-empty={i < 9 ? undefined : ''}
                    >
                      {i < 9 ? i + 1 : ''}
                    </span>
                    <span className="min-w-0 flex-1">
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
      {/* Pinned, it draws a divider with an "N more" pill while rows are hidden beneath it. */}
      <div
        ref={bottomRef}
        className={`bottom-0 z-10 mt-auto border-t bg-bg pt-8 pb-6 [@media(min-height:800px)]:sticky ${
          hiddenBelow > 0 ? 'border-transparent [@media(min-height:800px)]:border-border' : 'border-transparent'
        }`}
      >
        {hiddenBelow > 0 ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-full hidden h-12 bg-linear-to-t from-bg to-transparent [@media(min-height:800px)]:block"
            />
            <button
              type="button"
              onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
              className="absolute top-0 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-bg py-1 pr-3 pl-2 text-xs font-medium text-muted hover:bg-surface hover:text-text [@media(min-height:800px)]:flex"
            >
              <ChevronDown size={14} aria-hidden />
              <span>{hiddenBelow} more</span>
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void pick()}
          className={`group/drop flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors [@media(max-height:799px)]:gap-2 [@media(max-height:799px)]:py-5 ${
            dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-muted/50 hover:bg-surface/60'
          }`}
        >
          <span
            className={`rounded-2xl p-4 transition-colors [@media(max-height:799px)]:p-2.5 ${dragging ? 'bg-accent/15 text-accent' : 'bg-surface text-muted group-hover/drop:text-text'}`}
          >
            <FileUp size={32} strokeWidth={1.5} aria-hidden className="[@media(max-height:799px)]:size-6" />
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
          <span aria-hidden>·</span>
          <a
            href="https://ko-fi.com/markosankovic"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text hover:underline"
          >
            Support on Ko-fi
          </a>
        </footer>
      </div>
    </div>
  )
}

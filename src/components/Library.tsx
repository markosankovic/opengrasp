import { FileUp, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { deleteFileHandle, getFileHandle, listRecentDocuments, removeDocument } from '../db'
import type { DocumentMeta } from '../db/schema'
import {
  fileFromHandle,
  FileUnavailableError,
  handleFromDrop,
  pickPdfWithHandle,
  supportsFileHandles,
  type PickedFile,
} from '../pdf/fileAccess'
import { openPdf, type OpenedPdf } from '../pdf/openPdf'
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void listRecentDocuments().then(setRecent)
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
    if (!supportsFileHandles) {
      inputRef.current?.click()
      return
    }
    try {
      await open(await pickPdfWithHandle())
    } catch (e) {
      setError(`Could not open the file picker: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** Reopens a library document from its stored file handle, or asks for the file if there is none. */
  async function reopen(doc: DocumentMeta) {
    const handle = supportsFileHandles ? await getFileHandle(doc.id) : undefined
    if (handle) {
      try {
        await open({ file: await fileFromHandle(handle), handle })
        return
      } catch (e) {
        if (!(e instanceof FileUnavailableError)) throw e
        if (e.reason === 'denied') {
          setError(`${e.message} Click ${doc.fileName} again to retry.`)
          return
        }
        await deleteFileHandle(doc.id)
        setError(`${e.message} Select ${doc.fileName} again.`)
      }
    }
    await pick()
  }

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
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4">
      <header className="flex h-14 items-center justify-between">
        <h1 aria-label="OpenGrasp">
          <Logo />
        </h1>
        <button
          type="button"
          onClick={() => void pick()}
          className="flex items-center gap-2 rounded-lg px-3.5 py-2 font-medium text-muted hover:bg-surface hover:text-text"
        >
          <FileUp size={16} aria-hidden />
          {/* Browsers snap the baseline up to a whole pixel here; the 0.5px nudge was measured to center it exactly. */}
          <span className="text-trim relative top-[0.5px]">Load PDF</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void open({ file })
            e.target.value = ''
          }}
        />
      </header>

      {error && <p className="py-2 text-danger">{error}</p>}

      {recent.length > 0 ? (
        <h2 className="mt-6 mb-1 text-xs font-medium tracking-wider text-muted uppercase">Recent</h2>
      ) : null}

      {recent.length > 0 ? (
        <ul className="-mx-3">
          {recent.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-3 rounded-md hover:bg-surface">
              {confirmingRemove === doc.id ? (
                <div
                  className="flex min-h-16 w-full items-center gap-3 px-3"
                  onKeyDown={(e) => e.key === 'Escape' && setConfirmingRemove(null)}
                >
                  <span className="min-w-0 flex-1">
                    Remove <span className="font-semibold">{doc.title ?? doc.fileName}</span> from the library?
                    <span className="block text-xs text-muted">
                      Its reading position, notes and highlights are deleted. The PDF file is not touched.
                    </span>
                  </span>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => void remove(doc)}
                    className="rounded-md px-2 py-1 font-semibold text-danger hover:bg-bg"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(null)}
                    className="rounded-md px-2 py-1 text-muted hover:bg-bg hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void reopen(doc)}
                    title={`Open ${doc.fileName}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-md px-3 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] leading-snug font-medium">
                        {doc.title ?? doc.fileName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {doc.title ? `${doc.fileName} · ` : ''}
                        {timeAgo(doc.lastOpenedAt)}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-muted tabular-nums">
                      {Math.round((doc.progress.pageNumber / doc.pageCount) * 100)}%
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(doc.id)}
                    aria-label={`Remove ${doc.title ?? doc.fileName} from the library`}
                    title="Remove from library"
                    className="mr-2 rounded-md p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:bg-bg hover:text-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
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
      <div className="mt-auto pt-10 pb-8">
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
      </div>
    </div>
  )
}

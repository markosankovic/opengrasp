import { FileUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { deleteFileHandle, getFileHandle, listRecentDocuments } from '../db'
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

  // Dropping a PDF anywhere in the window opens it (SPEC.md §5.2).
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      const handle = handleFromDrop(e)
      if (file) void handle.then((h) => open({ file, handle: h }))
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  })

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4">
      <header className="flex h-12 items-center justify-between">
        <h1 className="font-semibold">OpenGrasp</h1>
        <button
          type="button"
          onClick={() => void pick()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted hover:bg-surface hover:text-text"
        >
          <FileUp size={16} aria-hidden />
          Open PDF
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
        <ul className="-mx-2">
          {recent.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => void reopen(doc)}
                title={`Open ${doc.fileName}`}
                className="flex w-full items-baseline justify-between gap-4 rounded-md px-2 py-2.5 text-left hover:bg-surface"
              >
                <span className="min-w-0">
                  <span className="block truncate">{doc.title ?? doc.fileName}</span>
                  <span className="block truncate text-xs text-muted">
                    {doc.title ? `${doc.fileName} · ` : ''}
                    {timeAgo(doc.lastOpenedAt)}
                  </span>
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {Math.round((doc.progress.pageNumber / doc.pageCount) * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="flex flex-1 items-center justify-center py-12 text-muted">Drop a PDF anywhere, or open one.</p>
    </div>
  )
}

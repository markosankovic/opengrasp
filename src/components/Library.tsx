import { FileUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { listRecentDocuments } from '../db'
import type { DocumentMeta } from '../db/schema'
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

  async function open(file: File | undefined) {
    if (!file) return
    if (!isPdf(file)) {
      setError(`${file.name} is not a PDF.`)
      return
    }
    try {
      setError(null)
      onOpened(await openPdf(file))
    } catch (e) {
      setError(`Could not open ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Dropping a PDF anywhere in the window opens it (SPEC.md §5.2).
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      void open(e.dataTransfer?.files[0])
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
          onClick={() => inputRef.current?.click()}
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
            void open(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </header>

      {error && <p className="py-2 text-danger">{error}</p>}

      {recent.length > 0 ? (
        <ul className="divide-y divide-border">
          {recent.map((doc) => (
            <li key={doc.id} className="flex items-baseline justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate">{doc.title ?? doc.fileName}</p>
                <p className="text-xs text-muted">{timeAgo(doc.lastOpenedAt)}</p>
              </div>
              <span className="text-xs text-muted tabular-nums">
                {Math.round((doc.progress.pageNumber / doc.pageCount) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="flex flex-1 items-center justify-center py-12 text-muted">Drop a PDF anywhere, or open one.</p>
    </div>
  )
}

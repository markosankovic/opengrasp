import { ArrowLeft } from 'lucide-react'
import type { OpenedPdf } from '../pdf/openPdf'

// Placeholder until the custom viewer (SPEC.md §4.7) is built.
export default function Reader({ opened, onClose }: { opened: OpenedPdf; onClose: () => void }) {
  const { meta } = opened

  return (
    <div className="flex h-dvh flex-col bg-reader-bg">
      <header className="flex h-10 items-center gap-2 border-b border-border bg-bg px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to library"
          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-text"
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <span className="truncate">{meta.title ?? meta.fileName}</span>
        <span className="ml-auto text-muted tabular-nums">
          {meta.progress.pageNumber} / {meta.pageCount}
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center text-muted">Viewer coming next.</main>
    </div>
  )
}

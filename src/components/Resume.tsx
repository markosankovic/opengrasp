import { ArrowLeft, BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getDocumentBySlug } from '../db'
import type { DocumentMeta } from '../db/schema'
import { openPdf, type OpenedPdf } from '../pdf/openPdf'
import { reopenInteractive, reopenSilently } from '../pdf/reopen'
import { backToLibrary } from '../router'
import Logo from './Logo'

type State = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; doc: DocumentMeta }

/**
 * Shown for /read/<slug> when the document isn't in memory (reload, link, browser forward). Reopens the file
 * silently when the browser still allows it, otherwise asks for one click, since file access needs a user gesture.
 */
export default function Resume({ slug, onOpened }: { slug: string; onOpened: (opened: OpenedPdf) => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const doc = await getDocumentBySlug(slug)
      if (cancelled) return
      if (!doc) {
        setState({ status: 'missing' })
        return
      }
      const picked = await reopenSilently(doc)
      if (picked && !cancelled) {
        try {
          const opened = await openPdf(picked)
          if (cancelled) void opened.pdf.loadingTask.destroy()
          else onOpened(opened)
          return
        } catch {
          // Fall through to the manual prompt.
        }
      }
      if (!cancelled) setState({ status: 'ready', doc })
    })()
    return () => {
      cancelled = true
    }
  }, [slug, onOpened])

  async function resume(doc: DocumentMeta) {
    try {
      const { picked, message } = await reopenInteractive(doc)
      setError(message ?? null)
      if (picked) onOpened(await openPdf(picked))
    } catch (e) {
      setError(`Could not open ${doc.fileName}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (state.status === 'loading') return null

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4">
      <header className="flex h-14 items-center">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24 text-center">
        {state.status === 'missing' ? (
          <p className="text-muted">This document isn't in your library.</p>
        ) : (
          <>
            <span className="rounded-2xl bg-surface p-4 text-muted">
              <BookOpen size={32} strokeWidth={1.5} aria-hidden />
            </span>
            <div>
              <h1 className="text-[17px] font-medium">{state.doc.title ?? state.doc.fileName}</h1>
              <p className="mt-1 text-xs text-muted">
                {state.doc.fileName} · page {state.doc.progress.pageNumber} of {state.doc.pageCount}
              </p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => void resume(state.doc)}
              className="btn bg-accent text-white hover:opacity-90"
            >
              <span>Continue reading</span>
            </button>
            {error && <p className="text-danger">{error}</p>}
          </>
        )}
        <button
          type="button"
          onClick={backToLibrary}
          className="btn text-muted hover:bg-surface hover:text-text"
        >
          <ArrowLeft size={16} aria-hidden />
          <span>Library</span>
        </button>
      </main>
    </div>
  )
}

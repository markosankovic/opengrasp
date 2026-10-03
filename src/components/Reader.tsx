import { PanelLeft, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveProgress } from '../db'
import type { DocumentMeta } from '../db/schema'
import { shortcutsBlocked } from '../keyboard'
import type { OpenedPdf } from '../pdf/openPdf'
import { loadOutline, type OutlineItem } from '../pdf/outline'
import Viewer, { type ViewerHandle, type ViewerState } from '../viewer/Viewer'
import HelpButton from './Help'
import { LogoMark } from './Logo'
import Outline from './Outline'
import PageInput from './PageInput'

/** Progress writes are debounced (SPEC.md §6) and flushed on pagehide and when leaving the reader. */
const SAVE_DELAY_MS = 500
const SCROLL_STEP = 60
const OUTLINE_OPEN_KEY = 'opengrasp:outline-open'
/** Below this width the outline overlays the page instead of narrowing it (Tailwind's md breakpoint). */
const NARROW = '(max-width: 767px)'

function readOutlineOpen(): boolean {
  try {
    return localStorage.getItem(OUTLINE_OPEN_KEY) === '1' && !matchMedia(NARROW).matches
  } catch {
    return false
  }
}

interface Props {
  opened: OpenedPdf
  onClose: () => void
  /** Keeps the in-memory copy of the progress current, so returning via browser "forward" resumes correctly. */
  onProgressSaved: (id: string, progress: DocumentMeta['progress']) => void
}

export default function Reader({ opened, onClose, onProgressSaved }: Props) {
  const { meta, pdf } = opened
  const viewer = useRef<ViewerHandle>(null)
  const pageInput = useRef<HTMLInputElement>(null)
  const [currentPage, setCurrentPage] = useState(meta.progress.pageNumber)
  const [zoomPercent, setZoomPercent] = useState<number | null>(null)
  const [outline, setOutline] = useState<OutlineItem[] | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(readOutlineOpen)

  useEffect(() => {
    let cancelled = false
    loadOutline(pdf).then(
      (items) => !cancelled && setOutline(items),
      () => !cancelled && setOutline([]),
    )
    return () => {
      cancelled = true
    }
  }, [pdf])

  // The open state is remembered on wide windows only; on narrow ones the panel covers the page.
  useEffect(() => {
    try {
      if (!matchMedia(NARROW).matches) localStorage.setItem(OUTLINE_OPEN_KEY, outlineOpen ? '1' : '0')
    } catch {
      // Storage unavailable (private mode, blocked site data): the panel just starts closed next time.
    }
  }, [outlineOpen])

  const selectOutlineItem = useCallback((item: OutlineItem) => {
    if (item.page !== null) viewer.current?.goToPage(item.page, item.fy)
    else if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
    if (matchMedia(NARROW).matches) setOutlineOpen(false)
    viewer.current?.focus()
  }, [])

  // Progress saving
  const pending = useRef<DocumentMeta['progress'] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (pending.current) {
      void saveProgress(meta.id, pending.current)
      onProgressSaved(meta.id, pending.current)
    }
    pending.current = null
  }, [meta.id, onProgressSaved])

  const onStateChange = useCallback(
    (state: ViewerState) => {
      setCurrentPage(state.currentPage)
      setZoomPercent(Math.round(state.effectiveZoom * 100))
      pending.current = {
        pageNumber: state.pageNumber,
        pageOffset: state.pageOffset,
        zoom: state.zoom,
        updatedAt: Date.now(),
      }
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_DELAY_MS)
    },
    [flush],
  )

  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  useEffect(() => viewer.current?.focus(), [])

  useEffect(() => {
    document.title = `${meta.title ?? meta.fileName} · OpenGrasp`
    return () => {
      document.title = 'OpenGrasp'
    }
  }, [meta.title, meta.fileName])

  // Keyboard shortcuts (SPEC.md §5.7)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const v = viewer.current
      if (!v || shortcutsBlocked(e) || e.altKey) return
      const mod = e.ctrlKey || e.metaKey
      const actions: Record<string, () => void> = mod
        ? { '=': v.zoomIn, '+': v.zoomIn, '-': v.zoomOut, '0': () => v.setZoom('page-width') }
        : {
            n: () => v.stepPage(1),
            ArrowRight: () => v.stepPage(1),
            PageDown: () => v.stepPage(1),
            p: () => v.stepPage(-1),
            ArrowLeft: () => v.stepPage(-1),
            PageUp: () => v.stepPage(-1),
            j: () => v.scrollBy(SCROLL_STEP),
            ArrowDown: () => v.scrollBy(SCROLL_STEP),
            k: () => v.scrollBy(-SCROLL_STEP),
            ArrowUp: () => v.scrollBy(-SCROLL_STEP),
            Home: () => v.goToPage(1),
            End: () => v.goToPage(pdf.numPages),
            g: () => pageInput.current?.select(),
            '+': v.zoomIn,
            '=': v.zoomIn,
            '-': v.zoomOut,
            '0': () => v.setZoom('page-width'),
          }
      if (!mod) {
        actions.t = () => setOutlineOpen((open) => !open)
        actions.Escape = () => setOutlineOpen(false)
        actions.b = () => {
          flush()
          onClose()
        }
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pdf.numPages, flush, onClose])

  const button = 'rounded-md p-1.5 text-muted hover:bg-surface hover:text-text'

  return (
    <div className="flex h-dvh flex-col">
      <header className="grid h-10 shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 border-b border-border bg-bg px-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              flush()
              onClose()
            }}
            aria-label="Back to library"
            title="Back to library (b)"
            className={button}
          >
            <LogoMark className="h-4" />
          </button>
          <button
            type="button"
            onClick={() => setOutlineOpen((open) => !open)}
            aria-label="Table of contents"
            aria-pressed={outlineOpen}
            title="Table of contents (t)"
            className={`${button} ${outlineOpen ? 'bg-surface text-text' : ''}`}
          >
            <PanelLeft size={16} aria-hidden />
          </button>
        </div>

        <span className="truncate text-center font-medium" title={meta.title ?? meta.fileName}>
          {meta.title ?? meta.fileName}
        </span>

        <div className="flex items-center justify-end">
          <PageInput
            ref={pageInput}
            page={currentPage}
            pageCount={pdf.numPages}
            onSubmit={(page) => {
              viewer.current?.goToPage(page)
              viewer.current?.focus()
            }}
            onCancel={() => viewer.current?.focus()}
          />

          <div className="ml-2 flex items-center">
            <button type="button" onClick={() => viewer.current?.zoomOut()} aria-label="Zoom out" title="Zoom out (-)" className={button}>
              <ZoomOut size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => viewer.current?.setZoom('page-width')}
              title="Fit width (0)"
              className="w-12 rounded-md py-1 text-center text-muted tabular-nums hover:bg-surface hover:text-text"
            >
              {zoomPercent ?? ''}%
            </button>
            <button type="button" onClick={() => viewer.current?.zoomIn()} aria-label="Zoom in" title="Zoom in (+)" className={button}>
              <ZoomIn size={16} aria-hidden />
            </button>
          </div>
          <HelpButton className="ml-1 rounded-md p-1.5 text-muted hover:bg-surface hover:text-text" />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {outlineOpen && (
          <div className="absolute inset-0 z-10 bg-black/20 md:hidden" onClick={() => setOutlineOpen(false)} aria-hidden />
        )}
        {outlineOpen && (
          <nav
            aria-label="Table of contents"
            className="w-72 shrink-0 border-r border-border bg-bg max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-10 max-md:shadow-xl"
          >
            <Outline items={outline} currentPage={currentPage} onSelect={selectOutlineItem} />
          </nav>
        )}
        <Viewer ref={viewer} pdf={pdf} initialProgress={meta.progress} onStateChange={onStateChange} />
      </div>
    </div>
  )
}

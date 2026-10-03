import { ArrowLeft, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveProgress } from '../db'
import type { DocumentMeta } from '../db/schema'
import type { OpenedPdf } from '../pdf/openPdf'
import Viewer, { type ViewerHandle, type ViewerState } from '../viewer/Viewer'
import PageInput from './PageInput'

/** Progress writes are debounced (SPEC.md §6) and flushed on pagehide and when leaving the reader. */
const SAVE_DELAY_MS = 500
const SCROLL_STEP = 60

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

export default function Reader({ opened, onClose }: { opened: OpenedPdf; onClose: () => void }) {
  const { meta, pdf } = opened
  const viewer = useRef<ViewerHandle>(null)
  const pageInput = useRef<HTMLInputElement>(null)
  const [currentPage, setCurrentPage] = useState(meta.progress.pageNumber)
  const [zoomPercent, setZoomPercent] = useState<number | null>(null)

  // Progress saving
  const pending = useRef<DocumentMeta['progress'] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (pending.current) void saveProgress(meta.id, pending.current)
    pending.current = null
  }, [meta.id])

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

  // Keyboard shortcuts (SPEC.md §5.7)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const v = viewer.current
      if (!v || isEditable(e.target) || e.altKey) return
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
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pdf.numPages])

  const button = 'rounded-md p-1.5 text-muted hover:bg-surface hover:text-text'

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-bg px-2">
        <button
          type="button"
          onClick={() => {
            flush()
            onClose()
          }}
          aria-label="Back to library"
          title="Back to library"
          className={button}
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate px-1">{meta.title ?? meta.fileName}</span>

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
      </header>

      <Viewer ref={viewer} pdf={pdf} initialProgress={meta.progress} onStateChange={onStateChange} />
    </div>
  )
}

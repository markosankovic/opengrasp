import { MessagesSquare, PanelLeft, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveProgress } from '../db'
import type { DocumentMeta } from '../db/schema'
import { shortcutsBlocked } from '../keyboard'
import type { OpenedPdf } from '../pdf/openPdf'
import { loadOutline, type OutlineItem } from '../pdf/outline'
import { pdfSelection } from '../viewer/selection'
import Viewer, { type ViewerHandle, type ViewerState } from '../viewer/Viewer'
import type { Quote } from '../ai/types'
import AskPanel, { type AskRequest } from './AskPanel'
import HelpButton from './Help'
import { LogoMark } from './Logo'
import Outline from './Outline'
import PageInput from './PageInput'
import SelectionPopover from './SelectionPopover'

/** Progress writes are debounced (SPEC.md §6) and flushed on pagehide and when leaving the reader. */
const SAVE_DELAY_MS = 500
const SCROLL_STEP = 60
const OUTLINE_OPEN_KEY = 'opengrasp:outline-open'
const ASK_OPEN_KEY = 'opengrasp:ask-open'
/** Below this width the side panels overlay the page instead of narrowing it (Tailwind's md breakpoint). */
const NARROW = '(max-width: 767px)'

function readOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1' && !matchMedia(NARROW).matches
  } catch {
    return false
  }
}

/** Panel open states are remembered on wide windows only; on narrow ones the panels cover the page. */
function writeOpen(key: string, open: boolean): void {
  try {
    if (!matchMedia(NARROW).matches) localStorage.setItem(key, open ? '1' : '0')
  } catch {
    // Storage unavailable (private mode, blocked site data): the panel just starts closed next time.
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
  const [outlineOpen, setOutlineOpen] = useState(() => readOpen(OUTLINE_OPEN_KEY))
  const [askOpen, setAskOpen] = useState(() => readOpen(ASK_OPEN_KEY))
  // Mounted from the first open on, and only hidden when closed, so the conversation survives closing the panel.
  const [askMounted, setAskMounted] = useState(askOpen)
  const [askRequest, setAskRequest] = useState<AskRequest | null>(null)
  const askId = useRef(0)

  useEffect(() => writeOpen(ASK_OPEN_KEY, askOpen), [askOpen])
  if (askOpen && !askMounted) setAskMounted(true)

  const ask = useCallback((quote?: Quote, question?: string) => {
    setAskOpen(true)
    setAskRequest({ id: ++askId.current, quote, question })
  }, [])

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

  useEffect(() => writeOpen(OUTLINE_OPEN_KEY, outlineOpen), [outlineOpen])

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
    document.title = meta.title ?? meta.fileName
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
        // With text selected, asks about it; otherwise opens or closes the panel.
        actions.a = () => {
          const selection = pdfSelection()
          if (selection) {
            ask({ text: selection.text, pageNumber: selection.pageNumber })
            document.getSelection()?.removeAllRanges()
          } else setAskOpen((open) => !open)
        }
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
  }, [pdf.numPages, flush, onClose, ask])

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

        <div className="flex items-center justify-end gap-4">
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

          <div className="flex items-center">
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAskOpen((open) => !open)}
              aria-label="Ask AI"
              aria-pressed={askOpen}
              title="Ask AI (a)"
              className={`${button} ${askOpen ? 'bg-surface text-text' : ''}`}
            >
              <MessagesSquare size={16} aria-hidden />
            </button>
            <HelpButton className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-text" />
          </div>
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
        {askOpen && (
          <div className="absolute inset-0 z-10 bg-black/20 md:hidden" onClick={() => setAskOpen(false)} aria-hidden />
        )}
        {askMounted && (
          <aside
            aria-label="Ask AI"
            hidden={!askOpen}
            className="w-[min(576px,40vw)] shrink-0 border-l border-border bg-bg max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-10 max-md:w-[min(576px,100%)] max-md:shadow-xl"
          >
            <AskPanel
              pdf={pdf}
              documentId={meta.id}
              title={meta.title ?? meta.fileName}
              outline={outline}
              currentPage={currentPage}
              request={askRequest}
              onClose={() => {
                setAskOpen(false)
                viewer.current?.focus()
              }}
              onDone={() => viewer.current?.focus()}
            />
          </aside>
        )}
      </div>
      <SelectionPopover onExplain={(quote) => ask(quote, 'Explain this.')} onAsk={(quote) => ask(quote)} />
    </div>
  )
}

import { MessagesSquare, NotebookPen, PanelLeft, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { putNote, saveProgress } from '../db'
import type { DocumentMeta } from '../db/schema'
import { shortcutsBlocked } from '../keyboard'
import type { OpenedPdf } from '../pdf/openPdf'
import { loadOutline, type OutlineItem } from '../pdf/outline'
import { pdfSelection } from '../viewer/selection'
import Viewer, { type ViewerHandle, type ViewerState } from '../viewer/Viewer'
import { noteFromAnswer } from '../ai/note'
import type { Quote } from '../ai/types'
import AskPanel, { type AskRequest } from './AskPanel'
import HelpButton from './Help'
import NotesPanel, { type NotesSignal } from './NotesPanel'
import PanelTabs, { type SidePanel } from './PanelTabs'
import { LogoMark } from './Logo'
import Outline from './Outline'
import PageInput from './PageInput'
import SelectionPopover from './SelectionPopover'

/** Progress writes are debounced (SPEC.md §6) and flushed on pagehide and when leaving the reader. */
const SAVE_DELAY_MS = 500
const SCROLL_STEP = 60
const OUTLINE_OPEN_KEY = 'opengrasp:outline-open'
const SIDE_PANEL_KEY = 'opengrasp:side-panel'
/** Before Notes existed, only the Ask panel's open state was remembered. */
const LEGACY_ASK_OPEN_KEY = 'opengrasp:ask-open'
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
  writeValue(key, open ? '1' : '0')
}

function writeValue(key: string, value: string): void {
  try {
    if (!matchMedia(NARROW).matches) localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode, blocked site data): the panel just starts closed next time.
  }
}

/** Which tab of the right-hand panel was open, if any. */
function readSidePanel(): SidePanel | null {
  try {
    if (matchMedia(NARROW).matches) return null
    const saved = localStorage.getItem(SIDE_PANEL_KEY)
    if (saved === 'ask' || saved === 'notes') return saved
    return saved === null && localStorage.getItem(LEGACY_ASK_OPEN_KEY) === '1' ? 'ask' : null
  } catch {
    return null
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
  // The right-hand panel: Ask or Notes, one tab at a time (SPEC.md §5.2).
  const [side, setSide] = useState<SidePanel | null>(readSidePanel)
  // Each tab is mounted from its first open on, and only hidden after, so a conversation or a note being written
  // survives switching tabs or closing the panel.
  const [mounted, setMounted] = useState<Record<SidePanel, boolean>>({ ask: side === 'ask', notes: side === 'notes' })
  const [askRequest, setAskRequest] = useState<AskRequest | null>(null)
  const askId = useRef(0)
  const [notesSignal, setNotesSignal] = useState<NotesSignal>({ revision: 0 })

  useEffect(() => writeValue(SIDE_PANEL_KEY, side ?? ''), [side])
  if (side && !mounted[side]) setMounted({ ...mounted, [side]: true })

  const toggleSide = useCallback((panel: SidePanel) => setSide((open) => (open === panel ? null : panel)), [])

  const ask = useCallback((quote?: Quote, question?: string) => {
    setSide('ask')
    setAskRequest({ id: ++askId.current, quote, question })
  }, [])

  const closeSide = useCallback(() => {
    setSide(null)
    viewer.current?.focus()
  }, [])

  const saveNote = useCallback(
    async (turn: Parameters<typeof noteFromAnswer>[0]) => {
      const note = noteFromAnswer(turn, meta.id)
      await putNote(note)
      setNotesSignal((s) => ({ revision: s.revision + 1 }))
      return note.id
    },
    [meta.id],
  )

  const showNote = useCallback((id: string) => {
    setSide('notes')
    setNotesSignal((s) => ({ revision: s.revision + 1, focusId: id }))
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
          } else toggleSide('ask')
        }
        actions.m = () => toggleSide('notes')
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
  }, [pdf.numPages, flush, onClose, ask, toggleSide])

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
              onClick={() => toggleSide('ask')}
              aria-label="Ask AI"
              aria-pressed={side === 'ask'}
              title="Ask AI (a)"
              className={`${button} ${side === 'ask' ? 'bg-surface text-text' : ''}`}
            >
              <MessagesSquare size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => toggleSide('notes')}
              aria-label="Notes"
              aria-pressed={side === 'notes'}
              title="Notes (m)"
              className={`${button} ${side === 'notes' ? 'bg-surface text-text' : ''}`}
            >
              <NotebookPen size={16} aria-hidden />
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
        {side && <div className="absolute inset-0 z-10 bg-black/20 md:hidden" onClick={() => setSide(null)} aria-hidden />}
        {(mounted.ask || mounted.notes) && (
          <aside
            aria-label={side === 'notes' ? 'Notes' : 'Ask AI'}
            hidden={!side}
            className="w-[min(576px,40vw)] shrink-0 border-l border-border bg-bg max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-10 max-md:w-[min(576px,100%)] max-md:shadow-xl"
          >
            {mounted.ask && (
              <div hidden={side !== 'ask'} className="h-full">
                <AskPanel
                  pdf={pdf}
                  documentId={meta.id}
                  title={meta.title ?? meta.fileName}
                  outline={outline}
                  currentPage={currentPage}
                  request={askRequest}
                  tabs={<PanelTabs active="ask" onSelect={setSide} />}
                  onSaveNote={saveNote}
                  onShowNote={showNote}
                  onClose={closeSide}
                  onDone={() => viewer.current?.focus()}
                />
              </div>
            )}
            {mounted.notes && (
              <div hidden={side !== 'notes'} className="h-full">
                <NotesPanel
                  documentId={meta.id}
                  currentPage={currentPage}
                  tabs={<PanelTabs active="notes" onSelect={setSide} />}
                  signal={notesSignal}
                  onGoToPage={(page) => {
                    viewer.current?.goToPage(page)
                    if (matchMedia(NARROW).matches) setSide(null)
                  }}
                  onClose={closeSide}
                  onDone={() => viewer.current?.focus()}
                />
              </div>
            )}
          </aside>
        )}
      </div>
      <SelectionPopover onExplain={(quote) => ask(quote, 'Explain this.')} onAsk={(quote) => ask(quote)} />
    </div>
  )
}

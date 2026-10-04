import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { findOnPage, normalizeQuery, type FindResults, type PageMatch } from '../pdf/find'

/** Wait for a pause in typing before scanning the document. */
const SEARCH_DELAY_MS = 150
/** While scanning, hand matches to the viewer at most this often, so a common word doesn't re-render per page. */
const PUBLISH_INTERVAL_MS = 100

interface Props {
  pdf: PDFDocumentProxy
  /** The scan starts here and wraps around, so the first match shown is the next one from where the reader is. */
  currentPage: number
  query: string
  onQueryChange: (query: string) => void
  onResults: (results: FindResults | null) => void
  onReveal: (page: number, match: PageMatch) => void
  onClose: () => void
  ref?: Ref<HTMLInputElement>
}

/** The results of one scan, tagged with the query they belong to. */
interface Scan extends FindResults {
  needle: string
  done: boolean
}

const NO_MATCHES = new Map<number, PageMatch[]>()

/** The find bar (SPEC.md §4.7): floats centered under the title, over the viewer and any open panels, opened with / or Ctrl+F. */
export default function FindBar({ pdf, currentPage, query, onQueryChange, onResults, onReveal, onClose, ref }: Props) {
  const [scan, setScan] = useState<Scan>({ needle: '', byPage: NO_MATCHES, current: null, done: true })
  const latest = useRef({ currentPage, onResults, onReveal })
  useEffect(() => {
    latest.current = { currentPage, onResults, onReveal }
  })

  const needle = normalizeQuery(query)
  // Until the scan for a new query gets going, the previous query's results no longer apply.
  const { byPage, current, done } = scan.needle === needle ? scan : { byPage: NO_MATCHES, current: null, done: !needle }

  // Scan every page for the query, starting at the current one. Page text is cached, so later queries are fast.
  useEffect(() => {
    if (!needle) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const found = new Map<number, PageMatch[]>()
      const start = latest.current.currentPage
      let published = 0
      for (let k = 0; k < pdf.numPages; k++) {
        const page = ((start - 1 + k) % pdf.numPages) + 1
        const matches = await findOnPage(pdf, page, needle)
        if (cancelled) return
        if (matches.length === 0) continue
        found.set(page, matches)
        const first = found.size === 1
        if (first) latest.current.onReveal(page, matches[0]!)
        if (first || Date.now() - published > PUBLISH_INTERVAL_MS) {
          published = Date.now()
          const byPage = new Map(found)
          setScan((s) => ({ needle, byPage, current: s.needle === needle && s.current ? s.current : { page, index: 0 }, done: false }))
        }
      }
      setScan((s) => ({ needle, byPage: found, current: s.needle === needle ? s.current : null, done: true }))
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pdf, needle])

  useEffect(() => latest.current.onResults(needle ? { byPage, current } : null), [needle, byPage, current])
  useEffect(() => () => latest.current.onResults(null), [])

  const pages = useMemo(() => [...byPage.keys()].sort((a, b) => a - b), [byPage])
  const total = useMemo(() => pages.reduce((sum, p) => sum + byPage.get(p)!.length, 0), [pages, byPage])
  const position = current
    ? pages.reduce((sum, p) => (p < current.page ? sum + byPage.get(p)!.length : sum), 0) + current.index + 1
    : 0

  function step(delta: 1 | -1) {
    if (!current || pages.length === 0) return
    let { page, index } = current
    index += delta
    if (index < 0 || index >= (byPage.get(page)?.length ?? 0)) {
      const at = pages.indexOf(page)
      page = pages[(at + delta + pages.length) % pages.length]!
      index = delta > 0 ? 0 : byPage.get(page)!.length - 1
    }
    setScan((s) => ({ ...s, current: { page, index } }))
    onReveal(page, byPage.get(page)![index]!)
  }

  const button = 'rounded-md p-1 text-muted hover:bg-surface hover:text-text disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div
      role="search"
      className="absolute top-2 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-bg py-1 pr-1 pl-2 shadow-lg"
    >
      <input
        ref={ref}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            e.currentTarget.select()
          }
        }}
        autoFocus
        spellCheck={false}
        placeholder="Find in document"
        aria-label="Find in document"
        className="w-80 min-w-0 bg-transparent py-0.5 outline-none placeholder:text-muted"
      />
      <span className={`min-w-14 text-right text-xs tabular-nums ${needle && done && total === 0 ? 'text-danger' : 'text-muted'}`} aria-live="polite">
        {!needle ? '' : total > 0 ? `${position} / ${total}${done ? '' : '…'}` : !done ? '…' : 'No matches'}
      </span>
      <button type="button" onClick={() => step(-1)} disabled={total === 0} aria-label="Previous match" title="Previous match (Shift+Enter)" className={button}>
        <ChevronUp size={16} aria-hidden />
      </button>
      <button type="button" onClick={() => step(1)} disabled={total === 0} aria-label="Next match" title="Next match (Enter)" className={button}>
        <ChevronDown size={16} aria-hidden />
      </button>
      <button type="button" onClick={onClose} aria-label="Close find" title="Close (Esc)" className={button}>
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}

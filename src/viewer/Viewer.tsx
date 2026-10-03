import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { DocumentMeta, Zoom } from '../db/schema'
import {
  applyAnchor,
  captureAnchor,
  clampZoom,
  computeLayout,
  GAP,
  PDF_TO_CSS,
  pageAt,
  resolveScale,
  stepZoom,
  type Anchor,
  type Layout,
  type PageSize,
} from './layout'
import PdfPage from './PdfPage'
import { RenderQueue } from './renderQueue'

/** Load page sizes in batches after the first page, so huge documents don't flood the worker. */
const SIZE_BATCH = 50

export interface ViewerState {
  /** Page at the top edge of the viewport and how far down it the edge is (0–1), for saving progress. */
  pageNumber: number
  pageOffset: number
  /** Page shown in the UI: the one with the largest visible fraction (the earlier one on ties). */
  currentPage: number
  zoom: Zoom
  /** Resolved zoom factor (1 = 100%), also for 'page-width' / 'page-fit'. */
  effectiveZoom: number
}

export interface ViewerHandle {
  goToPage(page: number): void
  /** Next (+1) / previous (-1) page, relative to the page currently shown. */
  stepPage(delta: 1 | -1): void
  scrollBy(dy: number): void
  zoomIn(): void
  zoomOut(): void
  setZoom(zoom: Zoom): void
  focus(): void
}

interface Props {
  pdf: PDFDocumentProxy
  initialProgress: DocumentMeta['progress']
  onStateChange: (state: ViewerState) => void
  ref?: Ref<ViewerHandle>
}

async function pageSize(pdf: PDFDocumentProxy, page: number): Promise<PageSize> {
  const viewport = (await pdf.getPage(page)).getViewport({ scale: 1 })
  return { w: viewport.width, h: viewport.height }
}

function mostVisiblePage(layout: Layout, top: number, height: number): number {
  let best = pageAt(layout, top)
  let bestFraction = -1
  for (let p = best; p <= pageAt(layout, top + height); p++) {
    const pageTop = layout.tops[p - 1]!
    const pageHeight = layout.heights[p - 1]!
    const visible = Math.min(top + height, pageTop + pageHeight) - Math.max(top, pageTop)
    // Browsers round scrollTop to whole pixels; a page cut off by a pixel or two still counts as fully visible.
    const fraction = Math.min(pageHeight, visible + 2) / pageHeight
    if (fraction > bestFraction + 0.001) {
      best = p
      bestFraction = fraction
    }
  }
  return best
}

export default function Viewer({ pdf, initialProgress, onStateChange, ref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [queue] = useState(() => new RenderQueue())
  const [sizes, setSizes] = useState<PageSize[] | null>(null)
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoomState] = useState<Zoom>(initialProgress.zoom)
  const [range, setRange] = useState({ first: 1, last: 0 })

  // Mirrors of the latest values for event handlers, updated after each commit.
  const latest = useRef({
    layout: null as Layout | null,
    sizes: null as PageSize[] | null,
    viewport: null as { w: number; h: number } | null,
    zoom,
    onStateChange,
  })
  // Restores the saved position on first layout (SPEC.md §4.7), then keeps the view stable across zoom/resize.
  const pendingAnchor = useRef<Anchor | null>({ page: initialProgress.pageNumber, fy: initialProgress.pageOffset, vy: 0 })

  const scale = useMemo(() => (sizes && viewport ? resolveScale(zoom, sizes, viewport) : null), [zoom, sizes, viewport])
  const layout = useMemo(
    () => (sizes && viewport && scale ? computeLayout(sizes, scale, viewport.w) : null),
    [sizes, viewport, scale],
  )

  useEffect(() => {
    latest.current.zoom = zoom
    latest.current.onStateChange = onStateChange
  })

  /** Remembers the current view so the next layout change can restore it. */
  function holdAnchor(at?: { x: number; y: number }) {
    const el = containerRef.current
    const current = latest.current.layout
    if (el && current && !pendingAnchor.current) pendingAnchor.current = captureAnchor(el, current, at)
  }

  function sync() {
    const el = containerRef.current
    const current = latest.current.layout
    if (!el || !current) return
    const top = el.scrollTop
    const h = el.clientHeight
    // Mount one screen above and below the viewport.
    const first = pageAt(current, top - h)
    const last = pageAt(current, top + 2 * h)
    setRange((r) => (r.first === first && r.last === last ? r : { first, last }))
    queue.setVisibleRange(pageAt(current, top), pageAt(current, top + h))

    const pageNumber = pageAt(current, top)
    const i = pageNumber - 1
    latest.current.onStateChange({
      pageNumber,
      pageOffset: Math.min(1, Math.max(0, (top - current.tops[i]!) / current.heights[i]!)),
      currentPage: mostVisiblePage(current, top, h),
      zoom: latest.current.zoom,
      effectiveZoom: current.scale / PDF_TO_CSS,
    })
  }

  function changeZoom(next: Zoom, at?: { x: number; y: number }) {
    const value = typeof next === 'number' ? clampZoom(next) : next
    const { zoom: currentZoom, sizes: currentSizes, viewport: currentViewport, layout: current } = latest.current
    if (value === currentZoom) return
    // Only hold an anchor if the layout will actually change, otherwise it would linger until some later change.
    if (current && currentSizes && currentViewport && resolveScale(value, currentSizes, currentViewport) !== current.scale) {
      holdAnchor(at)
    }
    latest.current.zoom = value
    setZoomState(value)
  }

  function numericZoom(): number {
    const { zoom: z, layout: current } = latest.current
    return typeof z === 'number' ? z : (current?.scale ?? PDF_TO_CSS) / PDF_TO_CSS
  }

  function goToPage(page: number) {
    const el = containerRef.current
    const current = latest.current.layout
    if (!el || !current) return
    const i = Math.min(Math.max(page, 1), current.tops.length) - 1
    el.scrollTop = current.tops[i]! - GAP / 2
  }

  useImperativeHandle(ref, () => ({
    goToPage,
    stepPage(delta) {
      // Read the live scroll position: React state may lag behind rapid key presses.
      const el = containerRef.current
      const current = latest.current.layout
      if (el && current) goToPage(mostVisiblePage(current, el.scrollTop, el.clientHeight) + delta)
    },
    scrollBy(dy) {
      containerRef.current?.scrollBy({ top: dy })
    },
    zoomIn: () => changeZoom(stepZoom(numericZoom(), 1)),
    zoomOut: () => changeZoom(stepZoom(numericZoom(), -1)),
    setZoom: (z) => changeZoom(z),
    focus: () => containerRef.current?.focus({ preventScroll: true }),
  }))

  // Page sizes: page 1 first so the layout can appear immediately, the rest in the background.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const first = await pageSize(pdf, 1)
      if (cancelled) return
      const all: PageSize[] = Array.from({ length: pdf.numPages }, () => first)
      latest.current.sizes = all
      setSizes(all)
      let differs = false
      for (let start = 2; start <= pdf.numPages; start += SIZE_BATCH) {
        const pages = Array.from({ length: Math.min(SIZE_BATCH, pdf.numPages - start + 1) }, (_, k) => start + k)
        const batch = await Promise.all(pages.map((p) => pageSize(pdf, p)))
        if (cancelled) return
        batch.forEach((size, k) => {
          all[start - 1 + k] = size
          differs ||= size.w !== first.w || size.h !== first.h
        })
      }
      if (differs) {
        holdAnchor()
        latest.current.sizes = [...all]
        setSizes(latest.current.sizes)
      }
    })()
    return () => {
      cancelled = true
    }
     
  }, [pdf])

  // Track the viewport size; 'page-width' and 'page-fit' depend on it.
  useLayoutEffect(() => {
    const el = containerRef.current!
    const observer = new ResizeObserver(() => {
      const prev = latest.current.viewport
      const next = { w: el.clientWidth, h: el.clientHeight }
      if (prev && prev.w === next.w && prev.h === next.h) return
      if (prev) holdAnchor()
      latest.current.viewport = next
      setViewport(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
     
  }, [])

  // Ctrl/⌘ + wheel (and trackpad pinch, which browsers report the same way) zooms around the cursor.
  useEffect(() => {
    const el = containerRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const delta = Math.max(-50, Math.min(50, e.deltaY))
      changeZoom(numericZoom() * Math.exp(-delta * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only read refs
  }, [])

  // After every layout change: restore the held anchor before paint, then update the mounted range.
  useLayoutEffect(() => {
    latest.current.layout = layout
    const el = containerRef.current
    if (!layout || !el) return
    if (pendingAnchor.current) {
      applyAnchor(el, layout, pendingAnchor.current)
      pendingAnchor.current = null
    }
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only reads refs
  }, [layout])

  const frame = useRef(0)
  function onScroll() {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(sync)
  }

  const pages: number[] = []
  if (layout) for (let p = range.first; p <= range.last; p++) pages.push(p)

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onScroll={onScroll}
      className="relative min-h-0 flex-1 overflow-auto bg-reader-bg outline-none [scrollbar-gutter:stable]"
    >
      {layout && (
        <div className="relative" style={{ width: layout.totalWidth, height: layout.totalHeight }}>
          {pages.map((p) => (
            <PdfPage
              key={p}
              pdf={pdf}
              pageNumber={p}
              scale={layout.scale}
              top={layout.tops[p - 1]!}
              left={layout.lefts[p - 1]!}
              width={layout.widths[p - 1]!}
              height={layout.heights[p - 1]!}
              queue={queue}
            />
          ))}
        </div>
      )}
    </div>
  )
}

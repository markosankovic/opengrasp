import type { Zoom } from '../db/schema'

// Pure layout math for the continuous-scroll viewer (SPEC.md §4.7). All values are CSS pixels unless noted.

/** PDF points → CSS pixels, so zoom 1 (100%) shows a page at its physical size. */
export const PDF_TO_CSS = 96 / 72
export const PADDING = 16
export const GAP = 12
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 5
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

/** Page size in PDF points (scale 1). */
export interface PageSize {
  w: number
  h: number
}

export interface Layout {
  scale: number
  tops: number[]
  lefts: number[]
  widths: number[]
  heights: number[]
  totalWidth: number
  totalHeight: number
}

/** A point on a page, kept fixed on screen across zoom and layout changes. */
export interface Anchor {
  page: number
  /** Position on the page as a fraction of its height / width. */
  fy: number
  fx?: number
  /** Where that point sits in the scroll container's viewport. */
  vy: number
  vx?: number
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Next preset zoom level. Levels within 1% of the current zoom are skipped, so every step is visible. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const next =
    direction > 0
      ? ZOOM_STEPS.find((z) => z > current * 1.01)
      : ZOOM_STEPS.findLast((z) => z < current * 0.99)
  return next ?? current
}

/** CSS scale for a zoom setting, given page sizes and the viewport (clientWidth/clientHeight). */
export function resolveScale(zoom: Zoom, sizes: PageSize[], viewport: { w: number; h: number }): number {
  if (typeof zoom === 'number') return clampZoom(zoom) * PDF_TO_CSS
  // Fit to the first page, not the widest: sizes load in the background, so this is stable from the first frame,
  // and a single landscape fold-out page doesn't shrink the whole book (it scrolls horizontally instead).
  const first = sizes[0] ?? { w: 612, h: 792 }
  const fitWidth = (viewport.w - 2 * PADDING) / first.w
  const scale = zoom === 'page-width' ? fitWidth : Math.min(fitWidth, (viewport.h - 2 * PADDING) / first.h)
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale / PDF_TO_CSS)) * PDF_TO_CSS
}

export function computeLayout(sizes: PageSize[], scale: number, viewportWidth: number): Layout {
  const widths = sizes.map((s) => s.w * scale)
  const heights = sizes.map((s) => s.h * scale)
  const totalWidth = Math.max(viewportWidth, Math.max(...widths) + 2 * PADDING)
  const tops: number[] = []
  let y = PADDING
  for (const h of heights) {
    tops.push(y)
    y += h + GAP
  }
  return {
    scale,
    tops,
    lefts: widths.map((w) => (totalWidth - w) / 2),
    widths,
    heights,
    totalWidth,
    totalHeight: y - GAP + PADDING,
  }
}

/** 1-based page at vertical position y. The gap above a page belongs to that page. */
export function pageAt(layout: Layout, y: number): number {
  const { tops } = layout
  let lo = 0
  let hi = tops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tops[mid]! - GAP <= y) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

export function captureAnchor(el: HTMLElement, layout: Layout, at?: { x: number; y: number }): Anchor {
  const vy = at?.y ?? 0
  const page = pageAt(layout, el.scrollTop + vy)
  const i = page - 1
  const anchor: Anchor = { page, vy, fy: (el.scrollTop + vy - layout.tops[i]!) / layout.heights[i]! }
  if (at) {
    anchor.vx = at.x
    anchor.fx = (el.scrollLeft + at.x - layout.lefts[i]!) / layout.widths[i]!
  }
  return anchor
}

export function applyAnchor(el: HTMLElement, layout: Layout, anchor: Anchor): void {
  const i = Math.min(Math.max(anchor.page, 1), layout.tops.length) - 1
  el.scrollTop = layout.tops[i]! + anchor.fy * layout.heights[i]! - anchor.vy
  el.scrollLeft =
    anchor.fx !== undefined && anchor.vx !== undefined
      ? layout.lefts[i]! + anchor.fx * layout.widths[i]! - anchor.vx
      : (layout.totalWidth - el.clientWidth) / 2
}

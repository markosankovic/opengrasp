import type { Quote } from '../ai/types'

/** The current selection inside the PDF's text layer, or null when there is none. */
export function pdfSelection(): (Quote & { rect: DOMRect }) | null {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const start = range.startContainer.parentElement?.closest<HTMLElement>('[data-page]')
  if (!start?.querySelector('.textLayer')?.contains(range.startContainer)) return null
  const text = selection.toString().trim()
  if (!text) return null
  return { text, pageNumber: Number(start.dataset.page), rect: range.getBoundingClientRect() }
}

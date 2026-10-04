import type { PDFDocumentProxy } from 'pdfjs-dist'

// Plain-text extraction (SPEC.md §4.5). The one place page text comes from, for AI context and find.

/** A text item of a page, in content-stream order: the same order and strings as the text layer's spans. */
export interface TextItem {
  str: string
  hasEOL: boolean
  /** Origin of the item (baseline start) in PDF user space. */
  x: number
  y: number
}

const itemCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<TextItem[]>>>()
const textCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<string>>>()

function cached<T>(cache: WeakMap<PDFDocumentProxy, Map<number, Promise<T>>>, pdf: PDFDocumentProxy, page: number, load: () => Promise<T>): Promise<T> {
  let pages = cache.get(pdf)
  if (!pages) cache.set(pdf, (pages = new Map()))
  let value = pages.get(page)
  if (!value) pages.set(page, (value = load()))
  return value
}

/** The text items of a page. Cached per document, so find and AI context extract each page only once. */
export function pageItems(pdf: PDFDocumentProxy, pageNumber: number): Promise<TextItem[]> {
  return cached(itemCache, pdf, pageNumber, () =>
    pdf
      .getPage(pageNumber)
      .then((page) => page.getTextContent())
      .then(({ items }) =>
        items.flatMap((item) =>
          'str' in item ? [{ str: item.str, hasEOL: item.hasEOL, x: item.transform[4] as number, y: item.transform[5] as number }] : [],
        ),
      ),
  )
}

/** The text of a page in reading order, with line breaks where the PDF marks them. Cached per document. */
export function pageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  return cached(textCache, pdf, pageNumber, () =>
    pageItems(pdf, pageNumber).then((items) =>
      items
        .map((item) => item.str + (item.hasEOL ? '\n' : ''))
        .join('')
        .replace(/[ \t]+/g, ' ')
        .trim(),
    ),
  )
}

/**
 * The passage around a selection: up to `radius` characters on each side, widened to whole lines. Matching ignores
 * whitespace differences, since the selection's text and the extracted text break lines differently.
 */
export function passageAround(text: string, selection: string, radius = 600): string | null {
  const needle = selection.replace(/\s+/g, ' ').trim()
  if (!needle) return null
  // Map positions in the whitespace-collapsed text back to the original.
  const positions: number[] = []
  let flat = ''
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!)) {
      if (flat.endsWith(' ')) continue
      flat += ' '
    } else flat += text[i]
    positions.push(i)
  }
  const at = flat.indexOf(needle)
  if (at === -1) return null
  const start = positions[at]!
  const end = positions[at + needle.length - 1]! + 1
  const from = text.lastIndexOf('\n', Math.max(0, start - radius)) + 1
  const to = text.indexOf('\n', Math.min(text.length, end + radius))
  return text.slice(from, to === -1 ? text.length : to).trim()
}

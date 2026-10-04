import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pageItems, type TextItem } from './text'

// Find in document (SPEC.md §4.7). Matching ignores case and whitespace differences, so a phrase broken across
// lines still matches.

/** A position in a page's text: index into its text items (= the text layer's spans) and offset into that string. */
export type TextPosition = [item: number, offset: number]

export interface PageMatch {
  start: TextPosition
  /** Exclusive. */
  end: TextPosition
  /** Baseline origin of the first item, in PDF user space, for scrolling to the match before its page renders. */
  x: number
  y: number
}

/** A page's text flattened for matching, with each character mapped back to where it came from. */
interface PageIndex {
  items: TextItem[]
  flat: string
  item: Int32Array
  from: Int32Array
  to: Int32Array
}

const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageIndex>>>()

function buildIndex(items: TextItem[]): PageIndex {
  let flat = ''
  const item: number[] = []
  const from: number[] = []
  const to: number[] = []
  const push = (s: string, i: number, a: number, b: number) => {
    for (let k = 0; k < s.length; k++) {
      item.push(i)
      from.push(a)
      to.push(b)
    }
    flat += s
  }
  items.forEach(({ str, hasEOL }, i) => {
    let offset = 0
    for (const ch of str) {
      if (/\s/.test(ch)) {
        if (flat && !flat.endsWith(' ')) push(' ', i, offset, offset + ch.length)
      } else push(ch.toLowerCase(), i, offset, offset + ch.length)
      offset += ch.length
    }
    if (hasEOL && flat && !flat.endsWith(' ')) push(' ', i, offset, offset)
  })
  return { items, flat, item: Int32Array.from(item), from: Int32Array.from(from), to: Int32Array.from(to) }
}

function pageIndex(pdf: PDFDocumentProxy, pageNumber: number): Promise<PageIndex> {
  let pages = cache.get(pdf)
  if (!pages) cache.set(pdf, (pages = new Map()))
  let index = pages.get(pageNumber)
  if (!index) pages.set(pageNumber, (index = pageItems(pdf, pageNumber).then(buildIndex)))
  return index
}

/** The query in the form pages are matched in; empty means nothing to search for. */
export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** All matches of a normalized query on a page, in reading order and not overlapping. */
export async function findOnPage(pdf: PDFDocumentProxy, pageNumber: number, needle: string): Promise<PageMatch[]> {
  const { items, flat, item, from, to } = await pageIndex(pdf, pageNumber)
  const matches: PageMatch[] = []
  if (!needle) return matches
  for (let at = flat.indexOf(needle); at !== -1; at = flat.indexOf(needle, at + needle.length)) {
    const last = at + needle.length - 1
    const first = items[item[at]!]!
    matches.push({ start: [item[at]!, from[at]!], end: [item[last]!, to[last]!], x: first.x, y: first.y })
  }
  return matches
}

/** What the viewer highlights: matches found so far by page, and the current match. */
export interface FindResults {
  byPage: Map<number, PageMatch[]>
  current: { page: number; index: number } | null
}

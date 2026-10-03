import type { PDFDocumentProxy } from 'pdfjs-dist'

/** A table-of-contents entry with its destination resolved to a page, ready for display and navigation. */
export interface OutlineItem {
  /** Path in the tree ("0.3.1"), stable for the document and unique, so it can key expanded state. */
  id: string
  title: string
  bold: boolean
  italic: boolean
  /** Target page (1-based), or null when the destination is missing or broken. */
  page: number | null
  /** Target position on the page as a fraction of its height from the top, when the destination has one. */
  fy: number | null
  /** External link, for entries that point outside the document. */
  url: string | null
  children: OutlineItem[]
}

type RawOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>

async function resolveDest(pdf: PDFDocumentProxy, dest: string | unknown[] | null): Promise<{ page: number; fy: number | null } | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    if (!Array.isArray(explicit)) return null
    const [ref, mode, ...args] = explicit as [unknown, { name?: string } | undefined, ...unknown[]]
    // The first element is a page reference, or a 0-based page index in some (non-conforming) files.
    const index = typeof ref === 'number' ? ref : await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])
    const page = index + 1

    // Only XYZ (x, y, zoom), FitH and FitBH (top) name a vertical position; the rest show the page from the top.
    const top = mode?.name === 'XYZ' ? args[1] : mode?.name === 'FitH' || mode?.name === 'FitBH' ? args[0] : null
    if (typeof top !== 'number') return { page, fy: null }
    const viewport = (await pdf.getPage(page)).getViewport({ scale: 1 })
    const [, y] = viewport.convertToViewportPoint(0, top)
    return { page, fy: Math.min(1, Math.max(0, y! / viewport.height)) }
  } catch {
    return null
  }
}

async function resolve(pdf: PDFDocumentProxy, raw: RawOutline, prefix: string): Promise<OutlineItem[]> {
  return Promise.all(
    raw.map(async (node, i) => {
      const id = prefix ? `${prefix}.${i}` : String(i)
      const [target, children] = await Promise.all([
        node.dest ? resolveDest(pdf, node.dest) : null,
        resolve(pdf, node.items as RawOutline, id),
      ])
      return {
        id,
        title: node.title.replace(/\s+/g, ' ').trim(),
        bold: node.bold,
        italic: node.italic,
        page: target?.page ?? null,
        fy: target?.fy ?? null,
        url: node.url,
        children,
      }
    }),
  )
}

/** The document's outline (bookmarks), or an empty array when it has none. */
export async function loadOutline(pdf: PDFDocumentProxy): Promise<OutlineItem[]> {
  const raw = await pdf.getOutline()
  return raw ? resolve(pdf, raw, '') : []
}

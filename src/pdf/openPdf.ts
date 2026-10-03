import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getDocument, putDocument, putFileHandle } from '../db'
import type { DocumentMeta } from '../db/schema'
import type { PickedFile } from './fileAccess'
import { sha256Hex } from './hash'
import { loadPdfjs } from './pdfjs'

export interface OpenedPdf {
  meta: DocumentMeta
  pdf: PDFDocumentProxy
}

/**
 * Loads a local PDF into memory, identifies it, and creates or updates its metadata. The file itself is never
 * stored; only a handle to it, when the browser provides one, so the library can reopen it.
 */
export async function openPdf({ file, handle }: PickedFile): Promise<OpenedPdf> {
  const data = await file.arrayBuffer()
  // digest() copies the bytes when called, so the buffer can be handed to the PDF.js worker right after.
  const [id, pdfjs] = await Promise.all([sha256Hex(data), loadPdfjs()])
  const pdf = await pdfjs.getDocument({ data }).promise

  const now = Date.now()
  const existing = await getDocument(id)
  const info = (await pdf.getMetadata()).info as { Title?: unknown }
  const title = typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined

  const meta: DocumentMeta = existing
    ? { ...existing, fileName: file.name, lastOpenedAt: now }
    : {
        id,
        fingerprints: pdf.fingerprints.filter((f): f is string => f !== null),
        fileName: file.name,
        fileSize: file.size,
        title,
        pageCount: pdf.numPages,
        createdAt: now,
        lastOpenedAt: now,
        progress: { pageNumber: 1, pageOffset: 0, zoom: 'page-width', updatedAt: now },
      }
  await putDocument(meta)
  if (handle) await putFileHandle(id, handle)
  return { meta, pdf }
}

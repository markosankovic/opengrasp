import type * as PdfjsLib from 'pdfjs-dist'

// PDF.js is loaded lazily, only when the first document is opened (SPEC.md §6).

let pdfjsPromise: Promise<typeof PdfjsLib> | undefined

export function loadPdfjs(): Promise<typeof PdfjsLib> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })
  return pdfjsPromise
}

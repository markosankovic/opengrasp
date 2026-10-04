import type { PDFDocumentProxy, TextLayer } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import type { PageMatch } from '../pdf/find'
import { loadPdfjs } from '../pdf/pdfjs'
import type { RenderQueue } from './renderQueue'
import { registerTextLayer } from './textSelection'
import './textLayer.css'

/** Upper bound on canvas pixels per page, so high zoom levels don't exhaust memory (SPEC.md §4.7). */
const MAX_CANVAS_PIXELS = 16_777_216
/** After a zoom, wait this long before re-rendering sharply; meanwhile the old canvas is stretched. */
const ZOOM_SETTLE_MS = 150

interface Props {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  top: number
  left: number
  width: number
  height: number
  queue: RenderQueue
  /** Find matches on this page, and which of them is the current one (-1: none). */
  matches?: PageMatch[]
  currentMatch?: number
}

interface Rendered {
  canvas?: HTMLCanvasElement
  textLayer?: TextLayer
  textContainer?: HTMLDivElement
  unregisterText?: () => void
  findLayer?: HTMLDivElement
  scale?: number
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  // Frees the backing store immediately instead of waiting for GC.
  canvas.width = 0
  canvas.height = 0
  canvas.remove()
}

export default function PdfPage({ pdf, pageNumber, scale, top, left, width, height, queue, matches, currentMatch = -1 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendered = useRef<Rendered>({})
  // Bumped whenever a text layer finishes rendering, since find highlights are measured from its spans.
  const [textVersion, setTextVersion] = useState(0)

  useEffect(() => {
    const state = rendered.current
    if (state.scale === scale) return

    const job = async (signal: AbortSignal) => {
      const page = await pdf.getPage(pageNumber)
      if (signal.aborted) return
      const viewport = page.getViewport({ scale })
      const outputScale = Math.min(
        window.devicePixelRatio || 1,
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
      )

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.className = 'absolute inset-0 h-full w-full'

      const task = page.render({
        canvas,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      })
      const onAbort = () => task.cancel()
      signal.addEventListener('abort', onAbort)
      try {
        await task.promise
      } catch (error) {
        releaseCanvas(canvas)
        if (signal.aborted) return
        throw error
      } finally {
        signal.removeEventListener('abort', onAbort)
      }

      const host = hostRef.current
      if (!host || signal.aborted) {
        releaseCanvas(canvas)
        return
      }
      // Swap in the new canvas only when it's complete, so the page never flashes blank.
      if (state.canvas) {
        host.replaceChild(canvas, state.canvas)
        releaseCanvas(state.canvas)
      } else {
        host.prepend(canvas)
      }
      state.canvas = canvas
      state.scale = scale

      if (state.textLayer) {
        state.textLayer.update({ viewport })
        return
      }
      const { TextLayer } = await loadPdfjs()
      const container = document.createElement('div')
      container.className = 'textLayer'
      host.append(container)
      const textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport })
      state.textLayer = textLayer
      state.textContainer = container
      const onAbortText = () => textLayer.cancel()
      signal.addEventListener('abort', onAbortText)
      try {
        await textLayer.render()
      } catch (error) {
        // A cancelled layer can't be updated later, so drop it and let the next render build a fresh one.
        container.remove()
        state.textLayer = undefined
        state.textContainer = undefined
        if (signal.aborted) return
        throw error
      } finally {
        signal.removeEventListener('abort', onAbortText)
      }
      state.unregisterText = registerTextLayer(container)
      setTextVersion((v) => v + 1)
    }

    const timer = setTimeout(() => queue.schedule(pageNumber, job), state.canvas ? ZOOM_SETTLE_MS : 0)
    return () => {
      clearTimeout(timer)
      queue.cancel(pageNumber)
    }
  }, [pdf, pageNumber, scale, queue])

  // Find highlights, positioned in percent of the page so they follow zoom without being measured again.
  useEffect(() => {
    const state = rendered.current
    const host = hostRef.current
    state.findLayer?.remove()
    state.findLayer = undefined
    if (!host || !state.textLayer || !matches?.length) return
    const spans = state.textLayer.textDivs
    const box = host.getBoundingClientRect()
    const layer = document.createElement('div')
    layer.className = 'findLayer'
    matches.forEach((match, k) => {
      for (let i = match.start[0]; i <= match.end[0]; i++) {
        const node = spans[i]?.firstChild
        if (!(node instanceof Text)) continue
        const range = document.createRange()
        range.setStart(node, i === match.start[0] ? match.start[1] : 0)
        range.setEnd(node, i === match.end[0] ? match.end[1] : node.length)
        for (const r of range.getClientRects()) {
          const mark = document.createElement('div')
          if (k === currentMatch) mark.className = 'current'
          mark.style.left = `${((r.left - box.left) / box.width) * 100}%`
          mark.style.top = `${((r.top - box.top) / box.height) * 100}%`
          mark.style.width = `${(r.width / box.width) * 100}%`
          mark.style.height = `${(r.height / box.height) * 100}%`
          layer.append(mark)
        }
      }
    })
    // Under the text layer, so the text stays selectable.
    host.insertBefore(layer, state.textContainer ?? null)
    state.findLayer = layer
  }, [matches, currentMatch, textVersion])

  useEffect(() => {
    const state = rendered.current
    return () => {
      state.findLayer?.remove()
      state.textLayer?.cancel()
      state.unregisterText?.()
      state.textContainer?.remove()
      if (state.canvas) releaseCanvas(state.canvas)
      rendered.current = {}
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className="absolute overflow-hidden bg-white shadow-sm"
      style={{ top, left, width, height, ['--total-scale-factor' as string]: scale }}
      data-page={pageNumber}
    />
  )
}

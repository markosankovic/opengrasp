/*
 * Keeps text selection from jumping when the pointer leaves the text spans (e.g. dragging past the end of
 * a line). Ported from TextLayerBuilder in pdfjs-dist/web/pdf_viewer.mjs (Apache-2.0, Mozilla): while a
 * selection is active, the layer gets `.selecting`, which stretches its `.endOfContent` element over the
 * page (see textLayer.css); older WebKit/Chromium also need that element moved next to the selection end.
 */

const layers = new Map<HTMLElement, HTMLElement>()
let controller: AbortController | null = null

function reset(end: HTMLElement, layer: HTMLElement) {
  layer.append(end)
  end.style.width = ''
  end.style.height = ''
  layer.classList.remove('selecting')
}

function resetAll() {
  layers.forEach(reset)
}

function needsEndMoving(): boolean {
  const sample = layers.values().next().value
  if (sample && getComputedStyle(sample).getPropertyValue('-moz-user-select') === 'none') return false // Firefox
  const chromium = /\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1]
  return !chromium || parseInt(chromium, 10) < 148
}

function enable() {
  if (controller) return
  controller = new AbortController()
  const { signal } = controller
  let pointerDown = false
  let moveEnd: boolean | undefined
  let prevRange: Range | undefined

  document.addEventListener('pointerdown', () => (pointerDown = true), { signal })
  document.addEventListener('pointerup', () => {
    pointerDown = false
    resetAll()
  }, { signal })
  window.addEventListener('blur', () => {
    pointerDown = false
    resetAll()
  }, { signal })
  document.addEventListener('keyup', () => {
    if (!pointerDown) resetAll()
  }, { signal })

  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) {
      resetAll()
      return
    }
    const active = new Set<HTMLElement>()
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i)
      for (const layer of layers.keys()) {
        if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer)
      }
    }
    for (const [layer, end] of layers) {
      if (active.has(layer)) layer.classList.add('selecting')
      else reset(end, layer)
    }

    moveEnd ??= needsEndMoving()
    if (!moveEnd) return

    const range = selection.getRangeAt(0)
    const modifyStart =
      !!prevRange &&
      (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
        range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0)
    let anchor: Node = modifyStart ? range.startContainer : range.endContainer
    if (anchor.nodeType === Node.TEXT_NODE && anchor.parentNode) anchor = anchor.parentNode
    if (!modifyStart && range.endOffset === 0) {
      do {
        while (!anchor.previousSibling && anchor.parentNode) anchor = anchor.parentNode
        if (!anchor.previousSibling) break
        anchor = anchor.previousSibling
      } while (!anchor.childNodes.length)
    }
    const layer = anchor.parentElement?.closest<HTMLElement>('.textLayer')
    const end = layer && layers.get(layer)
    if (layer && end && anchor.parentElement) {
      end.style.width = layer.style.width
      end.style.height = layer.style.height
      anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling)
    }
    prevRange = range.cloneRange()
  }, { signal })
}

/** Adds the end-of-content element and selection handling to a rendered text layer. Returns a cleanup function. */
export function registerTextLayer(layer: HTMLElement): () => void {
  const end = document.createElement('div')
  end.className = 'endOfContent'
  layer.append(end)
  const onMouseDown = () => layer.classList.add('selecting')
  layer.addEventListener('mousedown', onMouseDown)
  layers.set(layer, end)
  enable()
  return () => {
    layer.removeEventListener('mousedown', onMouseDown)
    layers.delete(layer)
    if (layers.size === 0) {
      controller?.abort()
      controller = null
    }
  }
}

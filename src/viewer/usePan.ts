import { useEffect, type RefObject } from 'react'
import { shortcutsBlocked } from '../keyboard'

/** Space taps shorter than this scroll a screen, like the browser's own Space; longer holds are only for panning. */
const TAP_MS = 300
/** Overlap kept on screen when Space scrolls by a screen, so the reader doesn't lose their line. */
const SCREEN_OVERLAP = 40

/**
 * Drag-to-pan for the scroll container (SPEC.md §4.7): hold Space and drag, drag with the middle button, or drag the
 * gray area around the pages. A plain left drag on a page still selects text. The state is kept in `data-pan`
 * ("ready" while Space is held, "active" while dragging) so the cursor can follow it without re-rendering.
 */
export function usePan(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = containerRef.current!
    let spaceDown = 0 // time Space went down, 0 when it's up
    let dragged = false
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null

    const setMode = (mode: 'ready' | 'active' | null) => {
      if (mode) el.dataset.pan = mode
      else delete el.dataset.pan
    }

    const onPointerDown = (e: PointerEvent) => {
      const background = e.target === el || e.target === el.firstElementChild
      const pan = e.button === 1 || (e.button === 0 && (spaceDown > 0 || background))
      if (!pan || e.pointerType === 'touch') return
      // Stops text selection, and the middle button's autoscroll / paste on some platforms.
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
      dragged = true
      setMode('active')
    }

    const onPointerMove = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return
      el.scrollLeft = drag.left - (e.clientX - drag.x)
      el.scrollTop = drag.top - (e.clientY - drag.y)
    }

    const endDrag = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return
      drag = null
      setMode(spaceDown ? 'ready' : null)
    }

    // Some platforms start autoscroll on the middle button's mousedown even when pointerdown is cancelled.
    const onMouseDown = (e: MouseEvent) => e.button === 1 && e.preventDefault()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' || shortcutsBlocked(e) || e.ctrlKey || e.metaKey || e.altKey) return
      // A focused button or link keeps Space for activating it.
      if (e.target instanceof HTMLElement && e.target.closest('button, a, summary, [role="button"]')) return
      e.preventDefault()
      if (spaceDown) return // key repeat
      spaceDown = performance.now()
      dragged = false
      if (!drag) setMode('ready')
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !spaceDown) return
      const tap = !dragged && performance.now() - spaceDown < TAP_MS
      spaceDown = 0
      if (!drag) setMode(null)
      if (tap) el.scrollBy({ top: (e.shiftKey ? -1 : 1) * (el.clientHeight - SCREEN_OVERLAP) })
    }

    const reset = () => {
      spaceDown = 0
      drag = null
      setMode(null)
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', reset)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', reset)
    }
  }, [containerRef])
}

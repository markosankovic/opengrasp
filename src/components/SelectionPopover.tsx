import { MessageSquare, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Quote } from '../ai/types'
import { pdfSelection } from '../viewer/selection'

interface Props {
  onExplain: (quote: Quote) => void
  onAsk: (quote: Quote) => void
}

/** A small bar above selected PDF text with AI actions (SPEC.md §5.2). Later also highlight, note and copy. */
export default function SelectionPopover({ onExplain, onAsk }: Props) {
  const [selection, setSelection] = useState<ReturnType<typeof pdfSelection>>(null)

  useEffect(() => {
    let frame = 0
    let pointerDown = false
    // Shown once the pointer is released, so it doesn't jump around while the selection is being dragged out.
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSelection(pointerDown ? null : pdfSelection()))
    }
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as Element).closest?.('[data-selection-popover]')) return
      pointerDown = true
      setSelection(null)
    }
    const onPointerUp = () => {
      pointerDown = false
      update()
    }
    document.addEventListener('selectionchange', update)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    // The viewer scrolls the selection along; capture catches scrolls of any element.
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', update)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [])

  if (!selection) return null
  const { rect, ...quote } = selection
  // Above the selection, or below it when there is no room under the top bar.
  const above = rect.top > 96
  const style = {
    left: Math.min(Math.max(rect.left + rect.width / 2, 100), window.innerWidth - 100),
    top: above ? rect.top - 8 : rect.bottom + 8,
  }
  const done = () => document.getSelection()?.removeAllRanges()

  return (
    <div
      data-selection-popover
      role="toolbar"
      aria-label="Selection"
      // Keeps the selection: a mousedown on a button would otherwise clear it before the click.
      onMouseDown={(e) => e.preventDefault()}
      className={`fixed z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-bg p-1 shadow-lg ${above ? '-translate-y-full' : ''}`}
      style={style}
    >
      <button
        type="button"
        onClick={() => {
          onExplain(quote)
          done()
        }}
        title="Explain the selection"
        className="btn h-7 gap-1.5 px-2 text-xs text-text hover:bg-surface"
      >
        <Sparkles size={14} className="text-accent" aria-hidden />
        <span>Explain</span>
      </button>
      <button
        type="button"
        onClick={() => {
          onAsk(quote)
          done()
        }}
        title="Ask about the selection (a)"
        className="btn h-7 gap-1.5 px-2 text-xs text-text hover:bg-surface"
      >
        <MessageSquare size={14} aria-hidden />
        <span>Ask</span>
      </button>
    </div>
  )
}

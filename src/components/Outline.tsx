import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { OutlineItem } from '../pdf/outline'

interface Props {
  /** null while the outline is loading. */
  items: OutlineItem[] | null
  currentPage: number
  onSelect: (item: OutlineItem) => void
}

/** The entry the reader is in: the last one, in document order, that starts on or before the current page. */
function findCurrent(items: OutlineItem[], page: number): OutlineItem[] {
  let best: OutlineItem[] = []
  const walk = (list: OutlineItem[], path: OutlineItem[]) => {
    for (const item of list) {
      const here = [...path, item]
      if (item.page !== null && item.page <= page) best = here
      walk(item.children, here)
    }
  }
  walk(items, [])
  return best
}

/** Table of contents panel on the left of the reader (shortcut: t). */
export default function Outline({ items, currentPage, onSelect }: Props) {
  const currentPath = useMemo(() => (items ? findCurrent(items, currentPage) : []), [items, currentPage])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Inside a collapsed entry, its nearest visible ancestor is marked instead.
  const collapsedAt = currentPath.findIndex((item) => !expanded.has(item.id))
  const current = collapsedAt === -1 ? currentPath.at(-1) : currentPath[collapsedAt]
  const listRef = useRef<HTMLDivElement>(null)

  // Opening the panel (or loading the outline) reveals the current entry once; after that, expansion is the user's.
  const revealed = useRef(false)
  useEffect(() => {
    if (!items || revealed.current) return
    revealed.current = true
    setExpanded(new Set(currentPath.slice(0, -1).map((item) => item.id)))
    requestAnimationFrame(() => listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' }))
  }, [items, currentPath])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function renderList(list: OutlineItem[], depth: number) {
    return (
      <ul>
        {list.map((item) => {
          const isOpen = expanded.has(item.id)
          const isCurrent = item === current
          return (
            <li key={item.id}>
              <div
                className={`group flex items-start rounded-md ${isCurrent ? 'bg-surface' : 'hover:bg-surface'}`}
                style={{ paddingLeft: depth * 12 }}
              >
                {item.children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-label={isOpen ? `Collapse ${item.title}` : `Expand ${item.title}`}
                    aria-expanded={isOpen}
                    className="shrink-0 rounded p-1 text-muted hover:text-text"
                  >
                    <ChevronRight size={14} aria-hidden className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                ) : (
                  <span className="w-[22px] shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  disabled={item.page === null && !item.url}
                  aria-current={isCurrent || undefined}
                  className={`flex min-w-0 flex-1 items-baseline gap-2 py-1 pr-2 text-left ${item.bold ? 'font-semibold' : ''} ${item.italic ? 'italic' : ''} ${isCurrent ? 'font-medium text-accent' : ''}`}
                >
                  <span className="min-w-0 flex-1 line-clamp-2">{item.title}</span>
                  {item.page !== null && <span className="shrink-0 text-xs text-muted tabular-nums">{item.page}</span>}
                </button>
              </div>
              {isOpen && renderList(item.children, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div ref={listRef} className="h-full overflow-y-auto p-2 text-[13px]">
      {items === null ? null : items.length === 0 ? (
        <p className="px-2 py-4 text-muted">This PDF has no table of contents.</p>
      ) : (
        renderList(items, 0)
      )}
    </div>
  )
}

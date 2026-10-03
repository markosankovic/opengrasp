import { useState, type Ref } from 'react'

interface Props {
  page: number
  pageCount: number
  onSubmit: (page: number) => void
  onCancel: () => void
  ref?: Ref<HTMLInputElement>
}

/** "n / total" in the top bar; editable to jump to a page (shortcut: g). */
export default function PageInput({ page, pageCount, onSubmit, onCancel, ref }: Props) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <label className="flex items-center gap-1 text-muted tabular-nums">
      <input
        ref={ref}
        value={draft ?? String(page)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onFocus={(e) => e.target.select()}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = Number(draft)
            if (n >= 1 && n <= pageCount) onSubmit(n)
            setDraft(null)
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
            onCancel()
          }
        }}
        inputMode="numeric"
        aria-label="Page number"
        title="Go to page (g)"
        className="w-10 rounded-md bg-transparent px-1 py-0.5 text-right text-text hover:bg-surface focus:bg-surface"
        style={{ width: `${String(pageCount).length + 1.5}ch` }}
      />
      <span>/ {pageCount}</span>
    </label>
  )
}

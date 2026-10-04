export type SidePanel = 'ask' | 'notes'

const TABS: [SidePanel, string, string][] = [
  ['ask', 'Ask', 'Ask AI (a)'],
  ['notes', 'Notes', 'Notes (N)'],
]

/** The tabs of the right-hand panel, shown in place of each panel's title (SPEC.md §5.2). */
export default function PanelTabs({ active, onSelect }: { active: SidePanel; onSelect: (panel: SidePanel) => void }) {
  return (
    <div role="tablist" aria-label="Side panel" className="flex items-center gap-0.5">
      {TABS.map(([panel, name, title]) => (
        <button
          key={panel}
          type="button"
          role="tab"
          aria-selected={panel === active}
          onClick={() => onSelect(panel)}
          title={title}
          className={`rounded-md px-2 py-1 font-medium ${panel === active ? 'bg-surface text-text' : 'text-muted hover:text-text'}`}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

import { useRegisterSW } from 'virtual:pwa-register/react'

/** One quiet line when a new version is available (SPEC.md §7). */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed right-4 bottom-4 flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm">
      New version available.
      <button type="button" onClick={() => void updateServiceWorker(true)} className="font-semibold text-accent">
        Reload
      </button>
    </div>
  )
}

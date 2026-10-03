import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** If the new worker never takes control (e.g. it was already activated elsewhere), reload anyway after this. */
const FALLBACK_RELOAD_MS = 3000

/**
 * Activates the waiting service worker and reloads once it controls the page. Doesn't rely on workbox-window's
 * `controlling` event, which only fires in some update scenarios; without a waiting worker it simply reloads.
 */
async function activateUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration()
  const waiting = registration?.waiting
  if (!waiting) {
    window.location.reload()
    return
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
  setTimeout(() => window.location.reload(), FALLBACK_RELOAD_MS)
}

/** One quiet line when a new version is available (SPEC.md §7). */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW()
  const [updating, setUpdating] = useState(false)

  if (!needRefresh) return null

  return (
    <div className="fixed right-4 bottom-4 z-10 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      New version available.
      <button
        type="button"
        disabled={updating}
        onClick={() => {
          setUpdating(true)
          void activateUpdate()
        }}
        className="font-semibold text-accent disabled:text-muted"
      >
        {updating ? 'Updating…' : 'Reload'}
      </button>
    </div>
  )
}

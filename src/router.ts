import { useSyncExternalStore } from 'react'

// Minimal History API routing (SPEC.md §4.8). Two routes, so no router library:
//   <base>             library
//   <base>read/<slug>  reader

const BASE = import.meta.env.BASE_URL

export type Route = { name: 'library' } | { name: 'reader'; slug: string }

interface HistoryState {
  /** True when this entry was pushed from the library, so in-app "back" can simply go back in history. */
  fromLibrary?: boolean
}

const listeners = new Set<() => void>()
window.addEventListener('popstate', () => listeners.forEach((listener) => listener()))

function parse(pathname: string): Route {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, '')
  const match = /^read\/([^/]+)\/?$/.exec(path)
  return match ? { name: 'reader', slug: decodeURIComponent(match[1]!) } : { name: 'library' }
}

// useSyncExternalStore needs a stable snapshot, so the parsed route is cached per pathname.
let cached = { pathname: '', route: { name: 'library' } as Route }
function snapshot(): Route {
  if (cached.pathname !== location.pathname) cached = { pathname: location.pathname, route: parse(location.pathname) }
  return cached.route
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot)
}

export function routePath(route: Route): string {
  return route.name === 'reader' ? `${BASE}read/${encodeURIComponent(route.slug)}` : BASE
}

export function navigate(route: Route, { replace = false, fromLibrary = false } = {}): void {
  const state: HistoryState = { fromLibrary }
  if (replace) history.replaceState(state, '', routePath(route))
  else history.pushState(state, '', routePath(route))
  listeners.forEach((listener) => listener())
}

/** Whether the current history entry was opened from the library. */
export function openedFromLibrary(): boolean {
  return (history.state as HistoryState | null)?.fromLibrary === true
}

/**
 * In-app "back to library". Goes back in history when the reader was opened from the library, so the browser's
 * forward button still works; if the reader was loaded directly (link, reload), it replaces the entry instead of
 * leaving the app.
 */
export function backToLibrary(): void {
  if (openedFromLibrary()) history.back()
  else navigate({ name: 'library' }, { replace: true })
}

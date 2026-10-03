// AI settings (SPEC.md §4.9). Kept in Web Storage, not IndexedDB: they are per-browser preferences, never exported.

const SETTINGS_KEY = 'opengrasp:ai'
const API_KEY = 'opengrasp:ai:gemini-key'

export interface AiSettings {
  model: string
  /** Send the whole current page, not just the passage around the selection. */
  includePage: boolean
  /** Keep the API key in localStorage; otherwise it lives in sessionStorage and is gone when the tab closes. */
  rememberKey: boolean
}

export const DEFAULT_SETTINGS: AiSettings = { model: '', includePage: true, rememberKey: true }

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    // Storage unavailable (private mode, blocked site data): the setting lasts until the page reloads.
  }
}

export function loadSettings(): AiSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(read(() => localStorage, SETTINGS_KEY) ?? '{}') as Partial<AiSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AiSettings): void {
  write(() => localStorage, SETTINGS_KEY, JSON.stringify(settings))
}

export function loadApiKey(): string {
  return read(() => sessionStorage, API_KEY) ?? read(() => localStorage, API_KEY) ?? ''
}

/** Stores the key in exactly one place, so turning "remember" off also removes the saved copy. */
export function saveApiKey(key: string, remember: boolean): void {
  write(() => (remember ? localStorage : sessionStorage), API_KEY, key || null)
  write(() => (remember ? sessionStorage : localStorage), API_KEY, null)
}

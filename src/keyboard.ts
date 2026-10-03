/** True when a key press belongs to a text field rather than to the app's shortcuts. */
export function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/** True when a key press shouldn't trigger page shortcuts: typing in a field, or a modal dialog is open. */
export function shortcutsBlocked(e: KeyboardEvent): boolean {
  return isEditable(e.target) || document.querySelector('dialog[open]') !== null
}

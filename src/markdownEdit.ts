/*
 * Markdown formatting for a plain textarea: wrap or unwrap the selection, prefix lines. Edits go through the browser's
 * own text insertion where it exists, so Ctrl+Z undoes them like typing.
 */

export type Format = 'bold' | 'italic' | 'code' | 'link' | 'list' | 'codeBlock'

/** Replaces `from`–`to` with `text`, then selects `selStart`–`selEnd`. `onInput` gets the new value when the browser can't insert. */
function replace(
  el: HTMLTextAreaElement,
  from: number,
  to: number,
  text: string,
  selStart: number,
  selEnd: number,
  onInput: (value: string) => void,
) {
  el.focus()
  el.setSelectionRange(from, to)
  if (!document.execCommand('insertText', false, text)) {
    el.setRangeText(text, from, to)
    onInput(el.value)
  }
  el.setSelectionRange(selStart, selEnd)
}

/** Wraps the selection in `marker`, or removes it when the selection is already wrapped. */
function wrap(el: HTMLTextAreaElement, marker: string, onInput: (value: string) => void) {
  const { value, selectionStart: s } = el
  let e = el.selectionEnd
  // A double-click often selects the space after a word; keep it outside the markers.
  while (e > s && /\s/.test(value[e - 1]!)) e--
  const selected = value.slice(s, e)
  const m = marker.length
  if (value.slice(s - m, s) === marker && value.slice(e, e + m) === marker) {
    replace(el, s - m, e + m, selected, s - m, e - m, onInput)
  } else if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    replace(el, s, e, selected.slice(m, -m), s, e - 2 * m, onInput)
  } else {
    replace(el, s, e, marker + selected + marker, s + m, e + m, onInput)
  }
}

/** The start of the first and the end of the last line the selection touches. */
function selectedLines(el: HTMLTextAreaElement): [number, number] {
  const { value, selectionStart: s, selectionEnd: e } = el
  const start = value.lastIndexOf('\n', s - 1) + 1
  // A selection ending at the start of a line doesn't include that line.
  const last = e > s && value[e - 1] === '\n' ? e - 1 : e
  const end = value.indexOf('\n', last)
  return [start, end === -1 ? value.length : end]
}

/** Adds "- " to each selected line, or removes it when every non-empty line has it. */
function toggleList(el: HTMLTextAreaElement, onInput: (value: string) => void) {
  const [start, end] = selectedLines(el)
  const lines = el.value.slice(start, end).split('\n')
  const filled = lines.filter((line) => line.trim())
  const listed = filled.length > 0 && filled.every((line) => /^\s*[-*] /.test(line))
  const text = lines
    .map((line) => (listed ? line.replace(/^(\s*)[-*] /, '$1') : (line.trim() || lines.length === 1) ? `- ${line}` : line))
    .join('\n')
  const caret = el.selectionStart === el.selectionEnd && lines.length === 1
  const at = caret ? Math.max(start, el.selectionStart + text.length - (end - start)) : start
  replace(el, start, end, text, at, caret ? at : start + text.length, onInput)
}

/** Puts the selected lines in a fenced code block, or takes them out of one. */
function toggleCodeBlock(el: HTMLTextAreaElement, onInput: (value: string) => void) {
  const [start, end] = selectedLines(el)
  const block = el.value.slice(start, end)
  const fenced = /^```[^\n]*\n([\s\S]*)\n```$/.exec(block)
  if (fenced) {
    replace(el, start, end, fenced[1]!, start, start + fenced[1]!.length, onInput)
    return
  }
  const text = `\`\`\`\n${block}\n\`\`\``
  // An empty block leaves the caret on its blank line.
  const inner = start + 4
  replace(el, start, end, text, inner, block ? inner + block.length : inner, onInput)
}

/** A link from the selection: its text, or its address when a URL is selected. */
function link(el: HTMLTextAreaElement, onInput: (value: string) => void) {
  const { value, selectionStart: s, selectionEnd: e } = el
  const selected = value.slice(s, e)
  if (/^https?:\/\/\S+$/.test(selected)) {
    replace(el, s, e, `[](${selected})`, s + 1, s + 1, onInput)
  } else {
    // The caret goes where the address is typed, or into the brackets when there's no text yet.
    const at = selected ? s + selected.length + 3 : s + 1
    replace(el, s, e, `[${selected}]()`, at, at, onInput)
  }
}

export function applyFormat(el: HTMLTextAreaElement, format: Format, onInput: (value: string) => void): void {
  const multiline = el.value.slice(el.selectionStart, el.selectionEnd).includes('\n')
  switch (format) {
    case 'bold':
      return wrap(el, '**', onInput)
    // Underscores, so italics never get mixed up with the asterisks of bold.
    case 'italic':
      return wrap(el, '_', onInput)
    case 'code':
      return multiline ? toggleCodeBlock(el, onInput) : wrap(el, '`', onInput)
    case 'link':
      return link(el, onInput)
    case 'list':
      return toggleList(el, onInput)
    case 'codeBlock':
      return toggleCodeBlock(el, onInput)
  }
}

/** The format for a Ctrl/Cmd shortcut in the note editor, if any. */
export function formatForKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): Format | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return null
  const formats: Record<string, Format> = { b: 'bold', i: 'italic', e: 'code', k: 'link' }
  return formats[e.key.toLowerCase()] ?? null
}

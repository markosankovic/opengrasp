import type { ReactNode } from 'react'

/*
 * A small Markdown renderer for AI answers: paragraphs, headings, lists, block quotes, fenced code, inline code,
 * bold, italics and links. It builds React elements and never sets HTML, so model output can't inject markup or
 * scripts (SPEC.md §4.9). Unfinished syntax while an answer streams in simply shows as text until it closes.
 */

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s\n][^*\n]*\*|_[^_\s\n][^_\n]*_)|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [token, code, bold, italic, linkText, href] = m
    const key = m.index
    if (code) out.push(<code key={key} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em]">{code.slice(1, -1)}</code>)
    else if (bold) out.push(<strong key={key} className="font-semibold">{inline(bold.slice(2, -2))}</strong>)
    else if (italic) out.push(<em key={key}>{inline(italic.slice(1, -1))}</em>)
    else if (linkText && href)
      out.push(
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          {linkText}
        </a>,
      )
    else out.push(token)
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block =
  | { type: 'code'; lang: string; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'paragraph'; text: string }

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const fence = /^\s*```(\S*)/.exec(line)
    if (fence) {
      const body: string[] = []
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]!); i++) body.push(lines[i]!)
      i++ // closing fence (or the end, while streaming)
      blocks.push({ type: 'code', lang: fence[1] ?? '', text: body.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length, text: heading[2]! })
      i++
      continue
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (item) {
      const ordered = /\d/.test(item[1]!)
      const items: string[] = []
      while (i < lines.length) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]!)
        if (m && /\d/.test(m[1]!) === ordered) items.push(m[2]!)
        else if (lines[i]!.trim() && /^\s{2,}/.test(lines[i]!) && items.length) items[items.length - 1] += ' ' + lines[i]!.trim()
        else break
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = []
      for (; i < lines.length && /^>\s?/.test(lines[i]!); i++) body.push(lines[i]!.replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: body.join(' ') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const body: string[] = []
    for (; i < lines.length && lines[i]!.trim() && !/^(\s*```|#{1,6}\s|\s*([-*+]|\d+[.)])\s|>)/.test(lines[i]!); i++) {
      body.push(lines[i]!.trim())
    }
    blocks.push({ type: 'paragraph', text: body.join(' ') })
  }
  return blocks
}

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {parse(text).map((block, i) => {
        switch (block.type) {
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed">
                <code>{block.text}</code>
              </pre>
            )
          case 'heading':
            return (
              <p key={i} className="font-semibold">
                {inline(block.text)}
              </p>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={i} className={`flex flex-col gap-1 pl-5 marker:text-muted ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
                {block.items.map((item, k) => (
                  <li key={k}>{inline(item)}</li>
                ))}
              </List>
            )
          }
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-border pl-3 text-muted">
                {inline(block.text)}
              </blockquote>
            )
          default:
            return <p key={i}>{inline(block.text)}</p>
        }
      })}
    </div>
  )
}

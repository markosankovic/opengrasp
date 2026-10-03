import type { Quote } from './types'

/** Longest page text sent as context; a dense page is ~4–6k characters, so this cuts off only outliers. */
const MAX_PAGE_CHARS = 8000

export interface DocumentContext {
  title: string
  /** Outline path to the current section, e.g. ["5 Templates", "5.4 Concepts and Generic Programming"]. */
  section: string[]
  pageCount: number
}

export function systemPrompt({ title, section, pageCount }: DocumentContext): string {
  return [
    `You are a study companion inside OpenGrasp, a PDF reader. The reader is studying "${title}" (${pageCount} pages)` +
      (section.length ? `, currently in the section "${section.join(' › ')}".` : '.'),
    'They ask about terms and passages the document uses but does not fully explain.',
    '',
    '- Explain in the context of this document and its subject, using its terminology and level.',
    '- Be concise: start with a direct answer in a sentence or two, then add detail or a short example only if it helps.',
    '- If the document likely covers the topic elsewhere, say so briefly.',
    '- Use Markdown. Put code in fenced code blocks with a language.',
    '- If you are not sure, say so instead of guessing.',
  ].join('\n')
}

function fence(text: string): string {
  return `"""\n${text.trim()}\n"""`
}

/** The text sent for one question: where the reader is, what they selected, the surrounding text, the question. */
export function userMessage(options: {
  question: string
  pageNumber: number
  quote?: Quote
  /** Text around the selection, when it could be located on the page. */
  passage?: string | null
  /** The whole page, when the reader allows sending it. */
  pageText?: string | null
}): string {
  const { question, pageNumber, quote, passage, pageText } = options
  const parts = [`Page ${quote?.pageNumber ?? pageNumber}.`]
  if (quote) parts.push(`Selected text:\n${fence(quote.text)}`)
  if (pageText) parts.push(`Text of the page:\n${fence(pageText.slice(0, MAX_PAGE_CHARS))}`)
  else if (passage) parts.push(`Passage around the selection:\n${fence(passage)}`)
  parts.push(`Question: ${question}`)
  return parts.join('\n\n')
}

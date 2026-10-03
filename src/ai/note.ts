import type { ConversationTurn, Note } from '../db/schema'

/** An Ask AI answer as a note on the page it was about: the quote, the question in bold, then the answer. */
export function noteFromAnswer(turn: ConversationTurn, documentId: string): Note {
  const quote = turn.quote ? `${turn.quote.text.trim().replace(/^/gm, '> ')}\n\n` : ''
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    documentId,
    // Turns saved before pageNumber was recorded still name the page at the start of the text sent.
    pageNumber: turn.pageNumber ?? turn.quote?.pageNumber ?? pageInPrompt(turn.prompt),
    content: `${quote}**${turn.question.replace(/\s+/g, ' ').trim()}**\n\n${turn.answer.trim()}`,
    source: { kind: 'ask', model: turn.model },
    createdAt: now,
    updatedAt: now,
  }
}

function pageInPrompt(prompt: string): number | undefined {
  const page = /^Page (\d+)\./.exec(prompt)?.[1]
  return page ? Number(page) : undefined
}

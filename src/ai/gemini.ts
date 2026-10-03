import type { ChatMessage } from './types'

// Google Gemini API, called directly from the browser with the user's own key (SPEC.md §4.9).

const API = 'https://generativelanguage.googleapis.com/v1beta'

export interface GeminiModel {
  /** API id without the "models/" prefix, e.g. "gemini-2.5-flash". */
  id: string
  label: string
}

async function apiError(response: Response): Promise<Error> {
  let message = `${response.status} ${response.statusText}`
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body.error?.message) message = body.error.message
  } catch {
    // Not JSON: keep the status line.
  }
  return new Error(message)
}

/** Models the key can use for chat, best first. Also the check that a key works. */
export async function listGeminiModels(apiKey: string, signal?: AbortSignal): Promise<GeminiModel[]> {
  const models: GeminiModel[] = []
  let pageToken = ''
  do {
    const response = await fetch(`${API}/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`, {
      headers: { 'x-goog-api-key': apiKey },
      signal,
    })
    if (!response.ok) throw await apiError(response)
    const body = (await response.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
      nextPageToken?: string
    }
    for (const m of body.models ?? []) {
      const id = m.name.replace(/^models\//, '')
      // Text chat models only: skip embedding, image, speech and live-audio variants.
      if (!m.supportedGenerationMethods?.includes('generateContent')) continue
      if (/embedding|image|tts|audio|live|aqa|robotics|computer-use/i.test(id)) continue
      models.push({ id, label: m.displayName ?? id })
    }
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)
  return models.sort((a, b) => rank(a.id) - rank(b.id) || b.id.localeCompare(a.id, undefined, { numeric: true }))
}

/** Fast, cheap "flash" models first, they suit quick questions while reading; previews and experiments last. */
function rank(id: string): number {
  let score = /flash/.test(id) ? 0 : /pro/.test(id) ? 1 : 2
  if (/lite/.test(id)) score += 0.5
  if (/preview|exp|latest/.test(id)) score += 3
  if (/gemma/.test(id)) score += 5
  return score
}

/** Streams the answer's text as it arrives. Thought summaries, if a model sends any, are skipped. */
export async function* streamGemini(options: {
  apiKey: string
  model: string
  system: string
  messages: ChatMessage[]
  signal: AbortSignal
}): AsyncGenerator<string> {
  const { apiKey, model, system, messages, signal } = options
  const response = await fetch(`${API}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    }),
    signal,
  })
  if (!response.ok || !response.body) throw await apiError(response)

  let buffer = ''
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      // Server-sent events are separated by a blank line; each carries one JSON chunk in its data line(s).
      let end: number
      while ((end = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const event = buffer.slice(0, end)
        buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '')
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) yield* parseChunk(data)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function* parseChunk(data: string): Generator<string> {
  const chunk = JSON.parse(data) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
    error?: { message?: string }
  }
  if (chunk.error?.message) throw new Error(chunk.error.message)
  if (chunk.promptFeedback?.blockReason) throw new Error(`Gemini declined the request (${chunk.promptFeedback.blockReason}).`)
  const candidate = chunk.candidates?.[0]
  for (const part of candidate?.content?.parts ?? []) if (part.text && !part.thought) yield part.text
  if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
    throw new Error(`Gemini stopped the answer (${candidate.finishReason}).`)
  }
}

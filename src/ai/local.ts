import { sseData } from './sse'
import type { ChatMessage } from './types'

// A local model server with an OpenAI-compatible API: Ollama, LM Studio, llama.cpp (SPEC.md §4.9).
// Called straight from the browser; the server must allow this page's origin (OLLAMA_ORIGINS for Ollama).

export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1'

/** "http://localhost:11434" and "http://localhost:11434/v1/" both mean the API at /v1. */
export function normalizeLocalUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  try {
    return new URL(trimmed).pathname === '/' ? `${trimmed}/v1` : trimmed
  } catch {
    return trimmed
  }
}

/** fetch() rejects without a status when the server is down or refuses this origin; the two look the same here. */
async function request(baseUrl: string, path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, init)
  } catch (e) {
    if (init.signal?.aborted) throw e
    throw new Error(`Can't reach ${baseUrl}. Check that the server is running${isLocalOrigin() ? '' : ' and allows this site'}.`, {
      cause: e,
    })
  }
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { error?: { message?: string } | string }
      const detail = typeof body.error === 'string' ? body.error : body.error?.message
      if (detail) message = detail
    } catch {
      // Not JSON: keep the status line.
    }
    throw new Error(message)
  }
  return response
}

/** Ollama allows localhost origins by default; any other origin has to be added to OLLAMA_ORIGINS. */
export function isLocalOrigin(): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
}

/** Chat models on the server, in the server's order. Also the check that it can be reached. */
export async function listLocalModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const response = await request(baseUrl, '/models', { signal })
  const body = (await response.json()) as { data?: { id: string }[] }
  return (body.data ?? []).map((m) => m.id).filter((id) => !/embed/i.test(id))
}

/** Streams the answer's text as it arrives. Reasoning from thinking models arrives separately and is skipped. */
export async function* streamLocal(options: {
  baseUrl: string
  model: string
  system: string
  messages: ChatMessage[]
  signal: AbortSignal
}): AsyncGenerator<string> {
  const { baseUrl, model, system, messages, signal } = options
  const response = await request(baseUrl, '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
      ],
    }),
    signal,
  })
  if (!response.body) throw new Error('The server sent no answer.')

  for await (const data of sseData(response.body)) {
    if (data === '[DONE]') break
    const chunk = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null } }[]
      error?: { message?: string } | string
    }
    if (chunk.error) throw new Error(typeof chunk.error === 'string' ? chunk.error : (chunk.error.message ?? 'The server failed.'))
    const text = chunk.choices?.[0]?.delta?.content
    if (text) yield text
  }
}

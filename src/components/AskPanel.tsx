import { ArrowUp, Check, Copy, Settings, Square, SquarePen, X } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { listGeminiModels, streamGemini, type GeminiModel } from '../ai/gemini'
import { DEFAULT_LOCAL_URL, isLocalOrigin, listLocalModels, normalizeLocalUrl, streamLocal } from '../ai/local'
import { systemPrompt, userMessage } from '../ai/prompt'
import {
  loadApiKey,
  loadSettings,
  saveApiKey,
  saveSettings,
  type AiProvider,
  type AiSettings,
} from '../ai/settings'
import type { ChatMessage, Quote } from '../ai/types'
import { sectionPath, type OutlineItem } from '../pdf/outline'
import { pageText, passageAround } from '../pdf/text'
import Markdown from './Markdown'

/** Asked from outside the panel: the selection popover or the `a` shortcut. */
export interface AskRequest {
  /** Changes on every request, so asking about the same text twice still triggers. */
  id: number
  quote?: Quote
  /** Sent right away when set ("Explain"); otherwise the quote is attached and the input focused. */
  question?: string
}

interface Turn {
  id: number
  question: string
  quote?: Quote
  /** The full text sent to the model for this turn, kept so follow-ups resend the same context. */
  prompt: string
  answer: string
  status: 'streaming' | 'done' | 'stopped' | 'error'
  error?: string
}

interface Props {
  pdf: PDFDocumentProxy
  title: string
  outline: OutlineItem[] | null
  currentPage: number
  request: AskRequest | null
  onClose: () => void
  /** Hands keyboard focus back to the page, e.g. after Esc in the input. */
  onDone: () => void
}

const GET_KEY_URL = 'https://aistudio.google.com/apikey'
const OLLAMA_URL = 'https://ollama.com/download'

function isReady(settings: AiSettings, apiKey: string): boolean {
  return settings.provider === 'gemini' ? Boolean(apiKey && settings.model) : Boolean(settings.localModel)
}

/** Where questions go, for the header and the privacy notes: "Google" or the local server's host. */
function destination(settings: AiSettings): string {
  if (settings.provider === 'gemini') return 'Google'
  try {
    return new URL(settings.localUrl).host
  } catch {
    return settings.localUrl
  }
}

function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Right-hand panel for asking an AI model about the document (SPEC.md §4.9): Gemini or a local model server. */
export default function AskPanel({ pdf, title, outline, currentPage, request, onClose, onDone }: Props) {
  const [settings, setSettings] = useState<AiSettings>(loadSettings)
  const [apiKey, setApiKey] = useState(loadApiKey)
  const [view, setView] = useState<'chat' | 'settings'>(() => (isReady(loadSettings(), loadApiKey()) ? 'chat' : 'settings'))
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [quote, setQuote] = useState<Quote | undefined>()
  const input = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const abort = useRef<AbortController | null>(null)
  const streaming = turns.at(-1)?.status === 'streaming'
  const ready = isReady(settings, apiKey)

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => () => abort.current?.abort(), [])

  // Follow a streaming answer while the reader is at the bottom; leave them be if they scrolled up to read.
  const pinned = useRef(true)
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [turns])

  async function send(question: string, attached?: Quote) {
    if (!ready || streaming || !question.trim()) return
    const page = attached?.pageNumber ?? currentPage
    const text = await pageText(pdf, page).catch(() => null)
    const prompt = userMessage({
      question: question.trim(),
      pageNumber: page,
      quote: attached,
      passage: attached && text ? passageAround(text, attached.text) : null,
      pageText: settings.includePage ? text : null,
    })
    const history: ChatMessage[] = turns
      .filter((t) => t.status === 'done')
      .flatMap((t) => [
        { role: 'user' as const, text: t.prompt },
        { role: 'model' as const, text: t.answer },
      ])
    const id = nextId.current++
    setTurns((all) => [...all, { id, question: question.trim(), quote: attached, prompt, answer: '', status: 'streaming' }])
    setDraft('')
    setQuote(undefined)
    pinned.current = true

    const update = (patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)))
    const controller = new AbortController()
    abort.current = controller
    try {
      const system = systemPrompt({
        title,
        section: sectionPath(outline ?? [], page).map((item) => item.title),
        pageCount: pdf.numPages,
      })
      const messages: ChatMessage[] = [...history, { role: 'user', text: prompt }]
      const chunks =
        settings.provider === 'gemini'
          ? streamGemini({ apiKey, model: settings.model, system, messages, signal: controller.signal })
          : streamLocal({ baseUrl: settings.localUrl, model: settings.localModel, system, messages, signal: controller.signal })
      for await (const chunk of chunks) update((t) => ({ answer: t.answer + chunk }))
      update({ status: 'done' })
    } catch (e) {
      if (controller.signal.aborted) update({ status: 'stopped' })
      else update({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    } finally {
      if (abort.current === controller) abort.current = null
    }
  }

  // Requests from the selection popover or the shortcut: "Ask" attaches the quote (here, while rendering), "Explain"
  // sends at once (in the effect below).
  const [handledRequest, setHandledRequest] = useState(request?.id ?? 0)
  if (request && request.id !== handledRequest) {
    setHandledRequest(request.id)
    if (!(request.question && ready)) setQuote(request.quote)
  }
  useEffect(() => {
    if (!request) return
    if (request.question && ready) void send(request.question, request.quote)
    else if (ready) requestAnimationFrame(() => input.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per request; send reads current state
  }, [request])

  // Grow the input with its content, up to a few lines.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  const iconButton = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text'

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <div className="min-w-0 flex-1 px-1">
          <span className="font-medium">Ask</span>
          {ready && (
            <span
              className="ml-2 truncate text-xs text-muted"
              title={`Questions and the selected text are sent to ${destination(settings)}`}
            >
              {settings.provider === 'gemini' ? `Gemini · ${settings.model}` : `Local · ${settings.localModel}`}
            </span>
          )}
        </div>
        {view === 'chat' && turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              abort.current?.abort()
              setTurns([])
            }}
            aria-label="New conversation"
            title="New conversation"
            className={iconButton}
          >
            <SquarePen size={15} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setView(view === 'settings' && ready ? 'chat' : 'settings')}
          aria-label="AI settings"
          aria-pressed={view === 'settings'}
          title="AI settings"
          className={`${iconButton} ${view === 'settings' ? 'bg-surface text-text' : ''}`}
        >
          <Settings size={15} aria-hidden />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" title="Close (a)" className={iconButton}>
          <X size={15} aria-hidden />
        </button>
      </header>

      {view === 'settings' ? (
        <AiSettingsForm
          settings={settings}
          apiKey={apiKey}
          onChange={setSettings}
          onConnected={(patch, key) => {
            if (key !== undefined) setApiKey(key)
            setSettings((s) => ({ ...s, ...patch }))
            setView('chat')
            requestAnimationFrame(() => input.current?.focus())
          }}
          onRemoveKey={() => {
            saveApiKey('', false)
            setApiKey('')
          }}
        />
      ) : (
        <>
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
            }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 leading-relaxed"
          >
            {turns.length === 0 ? (
              <div className="flex flex-col gap-2 pt-6 text-center text-muted">
                <p>Select text in the PDF and choose Explain or Ask, or type a question about this page.</p>
                <p className="text-xs">The question, the selected text and {settings.includePage ? 'the current page' : 'the text around it'} are sent to {settings.provider === 'gemini' ? 'Google Gemini' : `your local model at ${destination(settings)}`}.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {turns.map((turn) => (
                  <TurnView key={turn.id} turn={turn} />
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft, quote)
            }}
            className="shrink-0 border-t border-border p-3"
          >
            {quote && (
              <div className="mb-2 flex items-start gap-2 rounded-lg bg-surface px-2.5 py-2 text-xs">
                <span className="min-w-0 flex-1 text-muted">
                  <span className="font-medium text-text">Page {quote.pageNumber}</span> · “{excerpt(quote.text)}”
                </span>
                <button
                  type="button"
                  onClick={() => setQuote(undefined)}
                  aria-label="Remove the selected text"
                  className="-m-1 rounded p-1 text-muted hover:text-text"
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-accent">
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void send(draft, quote)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    e.currentTarget.blur()
                    onDone()
                  }
                }}
                rows={1}
                placeholder={quote ? 'Ask about the selection…' : 'Ask about this page…'}
                aria-label="Question"
                className="min-h-5 flex-1 resize-none bg-transparent leading-5 outline-none placeholder:text-muted"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abort.current?.abort()}
                  aria-label="Stop"
                  title="Stop"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-text text-bg"
                >
                  <Square size={11} fill="currentColor" aria-hidden />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Send"
                  title="Send (Enter)"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:bg-surface disabled:text-muted"
                >
                  <ArrowUp size={15} aria-hidden />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  )
}

function TurnView({ turn }: { turn: Turn }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="self-end rounded-xl bg-surface px-3 py-2">
        {turn.quote && (
          <p className="mb-1 border-l-2 border-border pl-2 text-xs text-muted">
            p. {turn.quote.pageNumber} · “{excerpt(turn.quote.text, 220)}”
          </p>
        )}
        <p className="whitespace-pre-wrap">{turn.question}</p>
      </div>
      <div className="group/answer">
        {turn.answer ? (
          <Markdown text={turn.answer} />
        ) : (
          turn.status === 'streaming' && <p className="animate-pulse text-muted">Thinking…</p>
        )}
        {turn.status === 'error' && <p className="mt-2 text-danger">{turn.error}</p>}
        {turn.status === 'stopped' && <p className="mt-2 text-xs text-muted">Stopped.</p>}
        {turn.status === 'done' && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(turn.answer).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }}
            aria-label="Copy answer"
            title="Copy answer"
            className="mt-2 -ml-1 rounded-md p-1 text-muted opacity-0 group-hover/answer:opacity-100 hover:text-text focus-visible:opacity-100"
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          </button>
        )}
      </div>
    </div>
  )
}

const label = 'mb-1.5 block text-xs font-medium text-muted'
const field = 'w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent'

function AiSettingsForm({
  settings,
  apiKey,
  onChange,
  onConnected,
  onRemoveKey,
}: {
  settings: AiSettings
  apiKey: string
  onChange: (settings: AiSettings) => void
  /** A provider was checked and chosen; `apiKey` is set when Gemini connected with a (new) key. */
  onConnected: (patch: Partial<AiSettings>, apiKey?: string) => void
  onRemoveKey: () => void
}) {
  // The tab only shows a provider's settings; questions switch to it once it connects.
  const [provider, setProvider] = useState<AiProvider>(settings.provider)

  const options = (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={settings.includePage}
        onChange={(e) => onChange({ ...settings, includePage: e.target.checked })}
        className="mt-0.5 accent-accent"
      />
      <span>
        Send the whole current page
        <span className="block text-xs text-muted">Better answers. Otherwise only the text around the selection is sent.</span>
      </span>
    </label>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div role="radiogroup" aria-label="Model provider" className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
        {(
          [
            ['gemini', 'Google Gemini'],
            ['local', 'Local model'],
          ] as const
        ).map(([value, name]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={provider === value}
            onClick={() => setProvider(value)}
            className={`rounded-md px-3 py-1.5 text-sm ${provider === value ? 'bg-bg font-medium text-text shadow-sm' : 'text-muted hover:text-text'}`}
          >
            {name}
          </button>
        ))}
      </div>

      {provider === 'gemini' ? (
        <GeminiSettings
          settings={settings}
          apiKey={apiKey}
          onChange={onChange}
          onConnected={(model, key) => onConnected({ provider: 'gemini', model }, key)}
          onRemoveKey={onRemoveKey}
        >
          {options}
        </GeminiSettings>
      ) : (
        <LocalSettings settings={settings} onConnected={(localUrl, localModel) => onConnected({ provider: 'local', localUrl, localModel })}>
          {options}
        </LocalSettings>
      )}
    </div>
  )
}

function GeminiSettings({
  settings,
  apiKey,
  onChange,
  onConnected,
  onRemoveKey,
  children,
}: {
  settings: AiSettings
  apiKey: string
  onChange: (settings: AiSettings) => void
  onConnected: (model: string, apiKey: string) => void
  onRemoveKey: () => void
  children: ReactNode
}) {
  const [key, setKey] = useState(apiKey)
  const [models, setModels] = useState<GeminiModel[] | null>(null)
  const [model, setModel] = useState(settings.model)
  const [status, setStatus] = useState<{ busy?: boolean; error?: string }>({ busy: Boolean(apiKey) })

  async function connect(k: string) {
    setStatus({ busy: true })
    try {
      const list = await listGeminiModels(k.trim())
      if (list.length === 0) throw new Error('This key has no chat models available.')
      setModels(list)
      setModel((m) => (list.some((x) => x.id === m) ? m : list[0]!.id))
      setStatus({})
      return list
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : String(e) })
      return null
    }
  }

  /** Checks the key (unless its model list is already loaded), stores it and returns to the conversation. */
  async function save(k: string) {
    const trimmed = k.trim()
    const list = models && trimmed === apiKey ? models : await connect(trimmed)
    if (!list) return
    const chosen = list.some((x) => x.id === model) ? model : list[0]!.id
    saveApiKey(trimmed, settings.rememberKey)
    onConnected(chosen, trimmed)
  }

  // With a saved key, load the model list straight away so the model can be changed.
  useEffect(() => {
    if (!apiKey) return
    let cancelled = false
    listGeminiModels(apiKey).then(
      (list) => {
        if (cancelled) return
        setModels(list)
        setModel((m) => (list.some((x) => x.id === m) ? m : (list[0]?.id ?? m)))
        setStatus({})
      },
      (e: unknown) => !cancelled && setStatus({ error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [apiKey])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save(key)
      }}
      className="flex flex-1 flex-col gap-5"
    >
      <p className="leading-relaxed text-muted">
        OpenGrasp asks Google Gemini directly from your browser, with your own API key. There is no OpenGrasp server in
        between.
      </p>

      <div>
        <label htmlFor="gemini-key" className={label}>
          Gemini API key
        </label>
        <input
          id="gemini-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => {
            setKey(e.target.value)
            setModels(null)
          }}
          // Paste-to-connect: pasting something key-shaped replaces the field and connects right away.
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text').trim()
            if (!/^\S{20,}$/.test(pasted)) return
            e.preventDefault()
            setKey(pasted)
            setModels(null)
            void save(pasted)
          }}
          placeholder="Paste your key"
          className={`${field} font-mono`}
        />
        <p className="mt-1.5 text-xs text-muted">
          Get a free key in{' '}
          <a href={GET_KEY_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Google AI Studio
          </a>
          , then paste it here. OpenGrasp connects as soon as you paste.
        </p>
      </div>

      {models && (
        <div>
          <label htmlFor="gemini-model" className={label}>
            Model
          </label>
          <select id="gemini-model" value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.id})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {children}
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={settings.rememberKey}
            onChange={(e) => {
              onChange({ ...settings, rememberKey: e.target.checked })
              if (apiKey) saveApiKey(apiKey, e.target.checked)
            }}
            className="mt-0.5 accent-accent"
          />
          <span>
            Remember the key on this device
            <span className="block text-xs text-muted">
              Stored in this browser only. Off: it is forgotten when the tab closes.
            </span>
          </span>
        </label>
      </div>

      {status.error && <p className="text-danger">{status.error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!key.trim() || status.busy}
          className="btn bg-accent text-white hover:opacity-90 disabled:opacity-50"
        >
          <span>
            {status.busy ? 'Checking…' : models && key.trim() === apiKey && settings.provider === 'gemini' ? 'Save' : 'Connect'}
          </span>
        </button>
        {apiKey && (
          <button
            type="button"
            onClick={() => {
              onRemoveKey()
              setKey('')
              setModels(null)
            }}
            className="btn text-muted hover:bg-surface hover:text-danger"
          >
            <span>Remove key</span>
          </button>
        )}
      </div>

      <p className="mt-auto text-xs leading-relaxed text-muted">
        When you ask, your question, the selected text and {settings.includePage ? 'the current page' : 'the text around it'}{' '}
        are sent to Google. Your PDF itself is never uploaded.
      </p>
    </form>
  )
}

function LocalSettings({
  settings,
  onConnected,
  children,
}: {
  settings: AiSettings
  onConnected: (url: string, model: string) => void
  children: ReactNode
}) {
  const [url, setUrl] = useState(settings.localUrl)
  const [models, setModels] = useState<string[] | null>(null)
  const [model, setModel] = useState(settings.localModel)
  const [status, setStatus] = useState<{ busy?: boolean; error?: string }>({ busy: true })
  const [checked, setChecked] = useState('')

  /** Takes the server's model list, keeping the chosen model if it is still there. */
  function found(base: string, list: string[]) {
    if (list.length === 0) throw new Error('The server has no chat models. With Ollama: ollama pull qwen3:8b')
    setChecked(base)
    setModels(list)
    setModel((m) => (list.includes(m) ? m : list[0]!))
    setStatus({})
    return list
  }

  function failed(e: unknown) {
    setModels(null)
    setStatus({ error: e instanceof Error ? e.message : String(e) })
    return null
  }

  async function connect(base: string) {
    setStatus({ busy: true })
    try {
      return found(base, await listLocalModels(base))
    } catch (e) {
      return failed(e)
    }
  }

  async function save() {
    const base = normalizeLocalUrl(url)
    const list = models && checked === base ? models : await connect(base)
    if (!list) return
    setUrl(base)
    onConnected(base, list.includes(model) ? model : list[0]!)
  }

  // Look for the server as soon as the tab opens: there is no key to wait for.
  useEffect(() => {
    const controller = new AbortController()
    const base = normalizeLocalUrl(settings.localUrl)
    listLocalModels(base, controller.signal)
      .then((list) => found(base, list))
      .catch((e: unknown) => !controller.signal.aborted && failed(e))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the saved URL
  }, [])

  const mono = 'rounded bg-surface px-1 py-0.5 font-mono text-[0.85em]'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-1 flex-col gap-5"
    >
      <p className="leading-relaxed text-muted">
        Ask a model running on your own computer, with{' '}
        <a href={OLLAMA_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          Ollama
        </a>
        , LM Studio or llama.cpp. Nothing leaves your machine, and it works offline.
      </p>

      <div>
        <label htmlFor="local-url" className={label}>
          Server
        </label>
        <input
          id="local-url"
          type="url"
          spellCheck={false}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setModels(null)
          }}
          placeholder={DEFAULT_LOCAL_URL}
          className={`${field} font-mono`}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Ollama: <span className={mono}>http://localhost:11434/v1</span> · LM Studio:{' '}
          <span className={mono}>http://localhost:1234/v1</span>
        </p>
      </div>

      {models && (
        <div>
          <label htmlFor="local-model" className={label}>
            Model
          </label>
          <select id="local-model" value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-3">{children}</div>

      {status.error && (
        <div className="flex flex-col gap-2">
          <p className="text-danger">{status.error}</p>
          {!isLocalOrigin() && (
            <p className="text-xs leading-relaxed text-muted">
              Ollama only answers pages it allows. Start it with{' '}
              <span className={`${mono} select-all`}>OLLAMA_ORIGINS={location.origin} ollama serve</span>, or add that
              variable to the Ollama service's environment and restart it. Your browser may also ask to allow access to
              local network devices.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!url.trim() || status.busy}
          className="btn bg-accent text-white hover:opacity-90 disabled:opacity-50"
        >
          <span>
            {status.busy
              ? 'Checking…'
              : models && checked === normalizeLocalUrl(url)
                ? settings.provider === 'local'
                  ? 'Save'
                  : 'Use this model'
                : 'Connect'}
          </span>
        </button>
      </div>

      <p className="mt-auto text-xs leading-relaxed text-muted">
        When you ask, your question, the selected text and {settings.includePage ? 'the current page' : 'the text around it'}{' '}
        are sent to this server only. Your PDF itself is never uploaded.
      </p>
    </form>
  )
}

import { CircleHelp, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { isEditable } from '../keyboard'
import Logo from './Logo'

const LIBRARY_SHORTCUTS: [keys: string[], action: string][] = [
  [['o'], 'Load PDF (also Ctrl+O)'],
  [['1', '…', '9'], 'Open a document from the list'],
  [['?'], 'This help'],
]

const READER_SHORTCUTS: [keys: string[], action: string][] = [
  [['j', 'k'], 'Scroll down / up (also ↓ ↑)'],
  [['Space'], 'Scroll a screen (Shift+Space back); hold and drag to pan'],
  [['n', 'p'], 'Next / previous page (also → ←, PgDn PgUp)'],
  [['Home', 'End'], 'First / last page'],
  [['g'], 'Go to page'],
  [['+', '-'], 'Zoom in / out (also Ctrl + wheel)'],
  [['0'], 'Fit width'],
  [['t'], 'Table of contents'],
  [['a'], 'Ask AI about the selection, or open the Ask panel'],
  [['N'], 'Notes (Shift+N)'],
  [['c'], 'New note on the current page'],
  [['b'], 'Back to the library'],
  [['Esc'], 'Close the table of contents'],
  [['?'], 'This help'],
]

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-surface px-1.5 font-mono text-xs text-text">
      {children}
    </kbd>
  )
}

function Shortcuts({ title, rows }: { title: string; rows: [string[], string][] }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">{title}</h3>
      <dl className="flex flex-col gap-1.5">
        {rows.map(([keys, action]) => (
          <div key={action} className="flex items-center gap-4">
            <dt className="flex w-24 shrink-0 gap-1">
              {keys.map((k) => (k === '…' ? <span key={k} className="self-center text-muted">–</span> : <Kbd key={k}>{k}</Kbd>))}
            </dt>
            <dd className="text-muted">{action}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** "?" button for the top bar: opens a dialog explaining the app and its shortcuts (also opened with ?). */
export default function HelpButton({
  className = 'rounded-md p-1.5 text-muted hover:bg-surface hover:text-text',
}: {
  className?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const content = useRef<HTMLDivElement>(null)

  function open() {
    dialog.current?.showModal()
    // Focus the content rather than the first control, so the close button doesn't open with a focus ring.
    content.current?.focus()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?' || isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      const d = dialog.current
      if (d?.open) d.close()
      else open()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Help"
        title="Help (?)"
        className={className}
      >
        <CircleHelp size={16} aria-hidden />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="help-title"
        // A click on the backdrop lands on the dialog element itself.
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-auto max-h-[85dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl [scrollbar-width:thin] border border-border bg-bg p-0 text-text shadow-2xl backdrop:bg-black/40"
      >
        <div ref={content} tabIndex={-1} className="flex flex-col gap-6 p-6 text-sm leading-relaxed outline-none">
          <header className="flex items-center justify-between">
            <h2 id="help-title" aria-label="OpenGrasp help">
              <Logo />
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              title="Close (Esc)"
              className="-mr-2 rounded-md p-1.5 text-muted hover:bg-surface hover:text-text"
            >
              <X size={16} aria-hidden />
            </button>
          </header>

          <p>
            A PDF reader for deep technical study: books, standards, papers and documentation you read over many
            sessions. It remembers exactly where you left off in every document.
          </p>

          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">How it works</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted">
              <li>
                <span className="font-medium">Open a PDF</span> by dropping it anywhere on the library page, or with{' '}
                <span className="font-medium">Load PDF</span>.
              </li>
              <li>
                <span className="font-medium">Your place is saved automatically</span>: page, position on the page and
                zoom. Open the document again and you continue where you stopped.
              </li>
              <li>
                <span className="font-medium">Your PDFs never leave your device.</span> Only the reading position is
                stored, in this browser. Because the file itself isn't stored, the browser may ask you to pick it again
                when you reopen it.
              </li>
              <li>
                <span className="font-medium">Pan a zoomed-in page</span> by holding Space and dragging, dragging with
                the middle mouse button, or dragging the gray area around the pages.
              </li>
              <li>
                <span className="font-medium">Table of contents</span>: the panel on the left lists the document's
                chapters and marks the one you're in.
              </li>
              <li>
                <span className="font-medium">Ask AI</span> (optional): select a term or passage and choose Explain or
                Ask, or type a question in the panel on the right. It uses Google Gemini with your own API key, or a
                model on your own computer (Ollama, LM Studio, llama.cpp); only your question, the selection and the
                current page are sent. Conversations are saved per document in this browser.
              </li>
              <li>
                <span className="font-medium">Notes</span>: write Markdown notes for a page or the whole document in the
                Notes tab next to Ask (m), or save an AI answer as a note with one click.
              </li>
              <li>
                <span className="font-medium">Works offline</span> and can be installed as an app from the browser's
                address bar.
              </li>
            </ul>
          </section>

          <div className="flex flex-col gap-6">
            <Shortcuts title="Library" rows={LIBRARY_SHORTCUTS} />
            <Shortcuts title="Reader" rows={READER_SHORTCUTS} />
          </div>

          <footer className="border-t border-border pt-4 text-xs text-muted">
            Open source under the MIT License ·{' '}
            <a
              href="https://github.com/markosankovic/opengrasp"
              target="_blank"
              rel="noreferrer"
              className="hover:text-text hover:underline"
            >
              Source and issues on GitHub
            </a>{' '}
            ·{' '}
            <a
              href="https://ko-fi.com/markosankovic"
              target="_blank"
              rel="noreferrer"
              className="hover:text-text hover:underline"
            >
              Support on Ko-fi
            </a>
          </footer>
        </div>
      </dialog>
    </>
  )
}

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CircleHelp, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { isEditable } from '../keyboard'
import Logo from './Logo'

/** Apple keyboards use ⌘ where others use Ctrl; the app accepts both everywhere. */
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

interface Shortcut {
  keys: string[]
  action: string
  /** Other keys that do the same, shown after the action. */
  also?: string[]
}

const SHORTCUT_GROUPS: { title: string; rows: Shortcut[] }[] = [
  {
    title: 'Reading',
    rows: [
      { keys: ['j', 'k'], action: 'Scroll down / up', also: ['↓', '↑'] },
      { keys: ['Space'], action: 'Scroll a screen down / up', also: ['Shift+Space'] },
      { keys: ['n', 'p'], action: 'Next / previous page', also: ['→', '←', 'PgDn', 'PgUp'] },
      { keys: ['Home', 'End'], action: 'First / last page' },
      { keys: ['g'], action: 'Go to page' },
      { keys: ['/'], action: 'Find in document', also: [`${MOD}+F`] },
      { keys: ['Enter'], action: 'Next match while finding', also: ['Shift+Enter'] },
    ],
  },
  {
    title: 'Panels',
    rows: [
      { keys: ['t'], action: 'Table of contents' },
      { keys: ['a'], action: 'Ask AI about the selection, or open the Ask panel' },
      { keys: ['N'], action: 'Notes panel', also: ['Shift+N'] },
      { keys: ['c'], action: 'New note on the current page' },
      { keys: ['b'], action: 'Back to the library' },
    ],
  },
  {
    title: 'Zoom and pan',
    rows: [
      { keys: ['+', '-'], action: `Zoom in / out; also ${MOD} + wheel or pinch` },
      { keys: ['0'], action: 'Fit width' },
      { keys: ['Space'], action: 'Hold and drag to pan; or drag with the middle button or on the gray area' },
    ],
  },
  {
    title: 'Writing notes',
    rows: [
      { keys: [`${MOD}+B`], action: 'Bold' },
      { keys: [`${MOD}+I`], action: 'Italic' },
      { keys: [`${MOD}+E`], action: 'Code; a code block over several lines' },
      { keys: [`${MOD}+K`], action: 'Link' },
      { keys: [`${MOD}+Enter`], action: 'Save the note' },
      { keys: ['Esc'], action: 'Cancel the edit' },
    ],
  },
  {
    title: 'Library',
    rows: [
      { keys: ['o'], action: 'Load PDF', also: [`${MOD}+O`] },
      { keys: ['1', '…', '9'], action: 'Open a document from the list' },
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      { keys: ['?'], action: 'This help' },
      { keys: ['Esc'], action: 'Close the find bar, table of contents or this help' },
    ],
  },
]

const FEATURES: [title: string, text: ReactNode][] = [
  ['Open a PDF', <>Drop it anywhere on the library page, or use Load PDF.</>],
  ['Continue where you stopped', <>Page, position on the page and zoom are saved as you read, for every document.</>],
  [
    'Private by design',
    <>
      Your PDFs never leave your device. Your place, notes and conversations are kept in this browser. The file itself
      isn't stored, so the browser may ask you to pick it again when you reopen it.
    </>,
  ],
  ['Find', <>Search the whole document; every match is highlighted and Enter steps through them.</>],
  ['Table of contents', <>The panel on the left lists the chapters and marks the one you're in.</>],
  [
    'Notes',
    <>Markdown notes for a page or the whole document, in the panel on the right. An AI answer saves as a note in one click.</>,
  ],
  [
    'Ask AI (optional)',
    <>
      Select a passage and choose Explain or Ask, or type a question. Google Gemini with your own API key, or a model
      on your computer (Ollama, LM Studio, llama.cpp). Sent with each question: the title and section, your selection
      and the text around it (or the whole page, if turned on) and the conversation so far.
    </>,
  ],
  ['Works offline', <>Install it as an app from the browser's address bar.</>],
]

/** Arrow glyphs are tiny in both Geist fonts, so arrow keys show icons. */
const ARROWS: Record<string, typeof ArrowUp> = { '←': ArrowLeft, '→': ArrowRight, '↑': ArrowUp, '↓': ArrowDown }

function Kbd({ children, small = false }: { children: string; small?: boolean }) {
  const Arrow = ARROWS[children]
  return (
    <kbd
      className={`inline-flex items-center justify-center rounded-md border border-border bg-surface font-mono text-xs text-text ${small ? 'h-5 min-w-5 px-1' : 'h-6 min-w-6 px-1.5'}`}
    >
      {Arrow ? <Arrow size={12} aria-label={children} /> : children}
    </kbd>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">{children}</h3>
}

function Shortcuts({ title, rows }: { title: string; rows: Shortcut[] }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <Heading>{title}</Heading>
      <dl className="flex flex-col gap-1.5">
        {rows.map(({ keys, action, also }) => (
          <div key={action} className="flex items-start gap-3">
            <dt className="flex w-24 shrink-0 flex-wrap gap-1">
              {keys.map((k) => (k === '…' ? <span key={k} className="self-center text-muted">–</span> : <Kbd key={k}>{k}</Kbd>))}
            </dt>
            <dd className="pt-0.5 text-muted">
              {action}
              {also && (
                <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                  {also.map((k) => (
                    <Kbd key={k} small>
                      {k}
                    </Kbd>
                  ))}
                </span>
              )}
            </dd>
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
        className="m-auto max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl [scrollbar-width:thin] border border-border bg-bg p-0 text-text shadow-2xl backdrop:bg-black/40"
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

          <p className="text-base">
            A PDF reader for deep technical study: books, standards, papers and documentation you read over many
            sessions. It remembers exactly where you left off in every document.
          </p>

          <section>
            <Heading>How it works</Heading>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {FEATURES.map(([title, text]) => (
                <div key={title}>
                  <dt className="font-medium">{title}</dt>
                  <dd className="text-muted">{text}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="-mb-2 gap-8 sm:columns-2">
            {SHORTCUT_GROUPS.map((group) => (
              <Shortcuts key={group.title} {...group} />
            ))}
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

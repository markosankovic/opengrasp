import { Bold, Code, Italic, Link, List, Pencil, Plus, SquareCode, Trash2, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { deleteNote, listNotes, putNote } from '../db'
import type { Note } from '../db/schema'
import { applyFormat, formatForKey, type Format } from '../markdownEdit'
import Markdown from './Markdown'

/** Tells the panel to reload, e.g. after an answer was saved as a note; `focusId` scrolls to that note. */
export interface NotesSignal {
  revision: number
  focusId?: string
}

interface Props {
  documentId: string
  currentPage: number
  /** The panel tabs, shown in place of a title. */
  tabs: ReactNode
  signal: NotesSignal
  /** Bumped to start a new note on the current page (the `c` shortcut). */
  newNoteRequest: number
  onGoToPage: (page: number) => void
  onClose: () => void
  /** Hands keyboard focus back to the page, e.g. after Esc in the editor. */
  onDone: () => void
}

const FORMATS: [Format, LucideIcon, string][] = [
  ['bold', Bold, 'Bold (Ctrl+B)'],
  ['italic', Italic, 'Italic (Ctrl+I)'],
  ['code', Code, 'Code (Ctrl+E)'],
  ['link', Link, 'Link (Ctrl+K)'],
  ['list', List, 'List'],
  ['codeBlock', SquareCode, 'Code block'],
]

/** A note being written: an existing one, or a new one that is saved only once it has text. */
interface Draft {
  id?: string
  pageNumber?: number
  content: string
}

/** Right-hand panel with the document's notes (SPEC.md F6): Markdown text, per page or for the whole document. */
export default function NotesPanel({
  documentId,
  currentPage,
  tabs,
  signal,
  newNoteRequest,
  onGoToPage,
  onClose,
  onDone,
}: Props) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    listNotes(documentId).then(
      (all) => {
        if (cancelled) return
        setNotes(all)
        if (signal.focusId) {
          const id = signal.focusId
          requestAnimationFrame(() =>
            list.current?.querySelector(`[data-note="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }),
          )
        }
      },
      (e: unknown) => !cancelled && setError(`Could not load notes: ${e instanceof Error ? e.message : String(e)}`),
    )
    return () => {
      cancelled = true
    }
  }, [documentId, signal])

  /** Saves the draft; an emptied note is deleted, an empty new one simply disappears. */
  async function save(d: Draft) {
    setDraft(null)
    const content = d.content.trim()
    const existing = d.id ? notes?.find((n) => n.id === d.id) : undefined
    if (!content) {
      if (existing) await remove(existing.id)
      return
    }
    if (existing && existing.content === content && existing.pageNumber === d.pageNumber) return
    const now = Date.now()
    const note: Note = existing
      ? { ...existing, content, pageNumber: d.pageNumber, updatedAt: now }
      : { id: crypto.randomUUID(), documentId, pageNumber: d.pageNumber, content, createdAt: now, updatedAt: now }
    await putNote(note)
    setNotes(await listNotes(documentId))
  }

  /** Starts a note on the current page; a new note already being written is focused instead of replaced. */
  function startNew() {
    if (draft && !draft.id) {
      list.current?.querySelector<HTMLTextAreaElement>('[data-new-note] textarea')?.focus()
      return
    }
    if (draft) void save(draft)
    setDraft({ pageNumber: currentPage, content: '' })
  }

  // The request is also current when the panel mounts on it, so a first `c` opens the panel with the editor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startNew() may save the note being edited and focus the editor
    if (newNoteRequest) startNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request starts a note
  }, [newNoteRequest])

  function edit(note: Note) {
    setDraft({ id: note.id, pageNumber: note.pageNumber, content: note.content })
  }

  async function remove(id: string) {
    setConfirmingDelete(null)
    await deleteNote(id)
    setNotes((all) => all?.filter((n) => n.id !== id) ?? null)
  }

  const iconButton = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text'

  // Group by page; document-level notes (no page) come first.
  const groups: { page?: number; notes: Note[] }[] = []
  for (const note of notes ?? []) {
    const last = groups.at(-1)
    if (last && last.page === note.pageNumber) last.notes.push(note)
    else groups.push({ page: note.pageNumber, notes: [note] })
  }
  const newDraft = draft && !draft.id ? draft : null

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <div className="min-w-0 flex-1">{tabs}</div>
        <button
          type="button"
          onClick={startNew}
          aria-label="New note"
          title="New note on this page (c)"
          className={iconButton}
        >
          <Plus size={15} aria-hidden />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" title="Close (N)" className={iconButton}>
          <X size={15} aria-hidden />
        </button>
      </header>

      <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 leading-relaxed">
        {error && <p className="text-danger">{error}</p>}
        {notes && notes.length === 0 && !newDraft && (
          <div className="flex flex-col items-center gap-3 pt-6 text-center text-muted">
            <p>No notes for this document yet.</p>
            <p className="text-xs">Write one for the current page, or save an answer from Ask.</p>
          </div>
        )}
        {newDraft && (
          <div data-new-note className="mb-6">
            <NoteEditor draft={newDraft} currentPage={currentPage} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} onDone={onDone} />
          </div>
        )}
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.page ?? 'document'} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted">
                {group.page === undefined ? (
                  'Whole document'
                ) : (
                  <button type="button" onClick={() => onGoToPage(group.page!)} className="hover:text-accent" title="Go to this page">
                    Page {group.page}
                  </button>
                )}
              </h3>
              {group.notes.map((note) =>
                draft?.id === note.id ? (
                  <NoteEditor
                    key={note.id}
                    draft={draft}
                    currentPage={currentPage}
                    onChange={setDraft}
                    onSave={save}
                    onCancel={() => setDraft(null)}
                    onDone={onDone}
                  />
                ) : confirmingDelete === note.id ? (
                  <div
                    key={note.id}
                    className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5"
                    onKeyDown={(e) => e.key === 'Escape' && setConfirmingDelete(null)}
                  >
                    <span className="min-w-0 flex-1">Delete this note?</span>
                    <button type="button" onClick={() => setConfirmingDelete(null)} className="btn text-muted hover:bg-bg">
                      <span>Cancel</span>
                    </button>
                    <button type="button" onClick={() => void remove(note.id)} autoFocus className="btn bg-danger text-white hover:opacity-90">
                      <span>Delete</span>
                    </button>
                  </div>
                ) : (
                  // Clicking the text edits it (links inside still open); the pencil does the same from the keyboard.
                  <article
                    key={note.id}
                    data-note={note.id}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest('a, button') && !document.getSelection()?.toString()) edit(note)
                    }}
                    className="group/note cursor-text rounded-lg px-3 py-2 hover:bg-surface"
                  >
                    <Markdown text={note.content} />
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                      {note.source && <span>from Ask · {note.source.model}</span>}
                      <button
                        type="button"
                        onClick={() => edit(note)}
                        aria-label="Edit note"
                        title="Edit note"
                        className="-my-1 ml-auto rounded-md p-1 opacity-0 group-hover/note:opacity-100 hover:text-text focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <Pencil size={13} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(note.id)}
                        aria-label="Delete note"
                        title="Delete note"
                        className="-my-1 rounded-md p-1 opacity-0 group-hover/note:opacity-100 hover:text-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  </article>
                ),
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function NoteEditor({
  draft,
  currentPage,
  onChange,
  onSave,
  onCancel,
  onDone,
}: {
  draft: Draft
  currentPage: number
  onChange: (draft: Draft) => void
  onSave: (draft: Draft) => void
  onCancel: () => void
  onDone: () => void
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  // Set once saved or cancelled from the keyboard, so the blur that follows (focus returns to the page) doesn't save again.
  const finished = useRef(false)
  const finish = (action: () => void) => {
    finished.current = true
    action()
    onDone()
  }
  const format = (f: Format) => {
    if (input.current) applyFormat(input.current, f, (content) => onChange({ ...draft, content }))
  }
  // The page a note can be attached to: its own, or the current one for a document-level note.
  const page = draft.pageNumber ?? currentPage

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // Grow with the content, up to most of the panel.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 480)}px`
  }, [draft.content])

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-accent p-2"
      // Saving on blur, unless focus only moved to the page toggle inside the editor.
      onBlur={(e) => {
        if (!finished.current && !e.currentTarget.contains(e.relatedTarget)) onSave(draft)
      }}
    >
      <textarea
        ref={input}
        value={draft.content}
        onChange={(e) => onChange({ ...draft, content: e.target.value })}
        onKeyDown={(e) => {
          const f = formatForKey(e)
          if (f) {
            e.preventDefault()
            format(f)
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            finish(() => onSave(draft))
          } else if (e.key === 'Escape') {
            e.preventDefault()
            finish(onCancel)
          }
        }}
        rows={3}
        placeholder="Write a note… (Markdown)"
        aria-label="Note"
        className="min-h-16 resize-none bg-transparent font-mono text-sm leading-relaxed outline-none placeholder:text-muted"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <div className="flex items-center" role="toolbar" aria-label="Formatting">
          {FORMATS.map(([f, Icon, label]) => (
            <button
              key={f}
              type="button"
              // Keeps the focus, and with it the selection, in the textarea.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(f)}
              aria-label={label}
              title={label}
              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-surface hover:text-text"
            >
              <Icon size={14} aria-hidden />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...draft, pageNumber: draft.pageNumber === undefined ? page : undefined })}
          title="Attach the note to a page or to the whole document"
          className="rounded-md bg-surface px-2 py-0.5 hover:text-text"
        >
          {draft.pageNumber === undefined ? 'Whole document' : `Page ${draft.pageNumber}`}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => finish(onCancel)} title="Cancel (Esc)" className="btn h-7 px-2.5 hover:bg-surface hover:text-text">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            onClick={() => finish(() => onSave(draft))}
            title="Save (Ctrl+Enter)"
            className="btn h-7 bg-accent px-2.5 text-white hover:opacity-90"
          >
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  )
}

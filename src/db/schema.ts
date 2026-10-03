import type { DBSchema } from 'idb'

// Data model, see SPEC.md §4.4.

export type Zoom = number | 'page-width' | 'page-fit'
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface DocumentMeta {
  /** SHA-256 of the full file, hex-encoded (SPEC.md §4.2). */
  id: string
  /** Unique, URL-friendly name used in the reader route: /read/<slug> (SPEC.md §4.8). */
  slug: string
  fingerprints?: string[]
  fileName: string
  fileSize: number
  title?: string
  pageCount: number
  createdAt: number
  lastOpenedAt: number
  progress: {
    pageNumber: number
    /** 0–1: how far down the page the top of the viewport is. */
    pageOffset: number
    zoom: Zoom
    updatedAt: number
  }
}

/** A rectangle in PDF page coordinates (scale-independent). */
export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Highlight {
  id: string
  documentId: string
  pageNumber: number
  selectedText: string
  rects: PdfRect[]
  color: HighlightColor
  note?: string
  createdAt: number
  updatedAt: number
}

export interface Note {
  id: string
  documentId: string
  /** Undefined for a document-level note. */
  pageNumber?: number
  content: string
  createdAt: number
  updatedAt: number
}

/** One question and its answer in an Ask AI conversation (SPEC.md §4.9). */
export interface ConversationTurn {
  question: string
  quote?: { text: string; pageNumber: number }
  /** The full text sent to the model, including page text, so follow-ups resend the same context. */
  prompt: string
  answer: string
  /** "stopped": the reader stopped the answer part-way. Failed answers aren't saved. */
  status: 'done' | 'stopped'
  provider: 'gemini' | 'local'
  model: string
  createdAt: number
}

export interface Conversation {
  id: string
  documentId: string
  turns: ConversationTurn[]
  createdAt: number
  updatedAt: number
}

export interface FileHandleEntry {
  documentId: string
  handle: FileSystemFileHandle
}

export interface OpenGraspDB extends DBSchema {
  documents: {
    key: string
    value: DocumentMeta
    indexes: { lastOpenedAt: number; slug: string }
  }
  highlights: {
    key: string
    value: Highlight
    indexes: { documentId: string; documentPage: [string, number] }
  }
  notes: {
    key: string
    value: Note
    indexes: { documentId: string }
  }
  fileHandles: {
    key: string
    value: FileHandleEntry
  }
  conversations: {
    key: string
    value: Conversation
    indexes: { documentId: string }
  }
}

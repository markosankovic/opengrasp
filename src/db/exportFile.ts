import type { Conversation, DocumentMeta, Highlight, Note } from './schema'

// The export file format (SPEC.md §4.6). Its version is independent of the IndexedDB schema version.

export const EXPORT_FORMAT = 'opengrasp-export'
export const EXPORT_VERSION = 1

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: number
  documents: DocumentMeta[]
  highlights: Highlight[]
  notes: Note[]
  conversations: Conversation[]
  // File handles are device-specific and are never exported.
}

/** Thrown for a file that isn't an export this version of the app can read. The message is shown to the reader. */
export class ExportFileError extends Error {}

type Guard = (value: Record<string, unknown>) => boolean

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isOptional = (value: unknown, guard: (value: unknown) => boolean) => value === undefined || guard(value)

// Only the fields the app relies on are checked: ids that link records, numbers used for ordering and merging,
// and the text that is rendered.
const GUARDS = {
  documents: (d) =>
    isString(d.id) &&
    isString(d.slug) &&
    isString(d.fileName) &&
    isNumber(d.fileSize) &&
    isOptional(d.title, isString) &&
    isNumber(d.pageCount) &&
    isNumber(d.createdAt) &&
    isNumber(d.lastOpenedAt) &&
    isObject(d.progress) &&
    isNumber(d.progress.pageNumber) &&
    isNumber(d.progress.pageOffset) &&
    (isNumber(d.progress.zoom) || d.progress.zoom === 'page-width' || d.progress.zoom === 'page-fit') &&
    isNumber(d.progress.updatedAt),
  highlights: (h) =>
    isString(h.id) &&
    isString(h.documentId) &&
    isNumber(h.pageNumber) &&
    isString(h.selectedText) &&
    Array.isArray(h.rects) &&
    h.rects.every((r) => isObject(r) && isNumber(r.x) && isNumber(r.y) && isNumber(r.w) && isNumber(r.h)) &&
    isString(h.color) &&
    isOptional(h.note, isString) &&
    isNumber(h.createdAt) &&
    isNumber(h.updatedAt),
  notes: (n) =>
    isString(n.id) &&
    isString(n.documentId) &&
    isOptional(n.pageNumber, isNumber) &&
    isString(n.content) &&
    isNumber(n.createdAt) &&
    isNumber(n.updatedAt),
  conversations: (c) =>
    isString(c.id) &&
    isString(c.documentId) &&
    Array.isArray(c.turns) &&
    c.turns.every((t) => isObject(t) && isString(t.question) && isString(t.prompt) && isString(t.answer)) &&
    isNumber(c.createdAt) &&
    isNumber(c.updatedAt),
} satisfies Record<string, Guard>

/** Parses and validates the text of an export file. Throws ExportFileError with a readable message. */
export function parseExportFile(text: string): ExportFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ExportFileError('This file is not an OpenGrasp export (it is not valid JSON).')
  }
  if (!isObject(data) || data.format !== EXPORT_FORMAT) {
    throw new ExportFileError('This file is not an OpenGrasp export.')
  }
  if (!isNumber(data.version) || data.version > EXPORT_VERSION) {
    throw new ExportFileError('This export was made by a newer version of OpenGrasp. Reload the app to update it, then try again.')
  }
  if (data.version !== EXPORT_VERSION) {
    throw new ExportFileError(`Export version ${String(data.version)} is not supported.`)
  }
  for (const [store, guard] of Object.entries(GUARDS) as [keyof typeof GUARDS, Guard][]) {
    const records = data[store]
    if (!Array.isArray(records)) throw new ExportFileError(`The export is damaged: "${store}" is missing.`)
    const bad = records.findIndex((record) => !isObject(record) || !guard(record))
    if (bad !== -1) throw new ExportFileError(`The export is damaged: ${store} entry ${bad + 1} is not valid.`)
  }
  return data as unknown as ExportFile
}

/** opengrasp-export-YYYY-MM-DD.json, in local time. */
export function exportFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `opengrasp-export-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

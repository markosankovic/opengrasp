import { openDB, type IDBPDatabase } from 'idb'
import { slugify, slugSource } from '../slug'
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from './exportFile'
import type { Conversation, DocumentMeta, Note, OpenGraspDB } from './schema'

// The only module that talks to IndexedDB (SPEC.md §3.1). Components use these functions, never idb directly.

const DB_NAME = 'opengrasp'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase<OpenGraspDB>> | undefined

/** Fired on window when a schema upgrade has to wait for another tab that still has an older version open. */
export const DB_BLOCKED_EVENT = 'opengrasp:db-blocked'

export function getDB(): Promise<IDBPDatabase<OpenGraspDB>> {
  dbPromise ??= openDB<OpenGraspDB>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const documents = db.createObjectStore('documents', { keyPath: 'id' })
        documents.createIndex('lastOpenedAt', 'lastOpenedAt')

        const highlights = db.createObjectStore('highlights', { keyPath: 'id' })
        highlights.createIndex('documentId', 'documentId')
        highlights.createIndex('documentPage', ['documentId', 'pageNumber'])

        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('documentId', 'documentId')

        db.createObjectStore('fileHandles', { keyPath: 'documentId' })
      }
      if (oldVersion < 2) {
        // v2: slugs for routing. Existing documents get one derived from their title or file name.
        const documents = tx.objectStore('documents')
        documents.createIndex('slug', 'slug', { unique: true })
        const used = new Set<string>()
        for (let cursor = await documents.openCursor(); cursor; cursor = await cursor.continue()) {
          const doc = cursor.value
          const slug = nextFreeSlug(slugify(slugSource(doc)), (candidate) => used.has(candidate))
          used.add(slug)
          await cursor.update({ ...doc, slug })
        }
      }
      if (oldVersion < 3) {
        // v3: saved Ask AI conversations.
        db.createObjectStore('conversations', { keyPath: 'id' }).createIndex('documentId', 'documentId')
      }
    },
    // Another tab runs older code with an older schema open; the upgrade waits until it closes or reloads.
    blocked() {
      window.dispatchEvent(new Event(DB_BLOCKED_EVENT))
    },
    // A newer version of the app wants to upgrade the schema: let go, and reload into the new version.
    blocking() {
      void dbPromise?.then((db) => db.close())
      dbPromise = undefined
      window.location.reload()
    },
  })
  return dbPromise
}

/** `base`, or `base-2`, `base-3`, … whichever is free first. */
function nextFreeSlug(base: string, taken: (slug: string) => boolean): string {
  let slug = base
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`
  return slug
}

/** A slug for document `id` that no other document uses. */
export async function uniqueSlug(base: string, id: string): Promise<string> {
  const db = await getDB()
  let slug = base
  for (let n = 2; ; n++) {
    const owner = await db.getFromIndex('documents', 'slug', slug)
    if (!owner || owner.id === id) return slug
    slug = `${base}-${n}`
  }
}

export async function getDocumentBySlug(slug: string): Promise<DocumentMeta | undefined> {
  return (await getDB()).getFromIndex('documents', 'slug', slug)
}

export async function getDocument(id: string): Promise<DocumentMeta | undefined> {
  return (await getDB()).get('documents', id)
}

export async function putDocument(doc: DocumentMeta): Promise<void> {
  await (await getDB()).put('documents', doc)
}

/** Most recently opened first. */
export async function listRecentDocuments(): Promise<DocumentMeta[]> {
  const docs = await (await getDB()).getAllFromIndex('documents', 'lastOpenedAt')
  return docs.reverse()
}

export async function saveProgress(id: string, progress: DocumentMeta['progress']): Promise<void> {
  const tx = (await getDB()).transaction('documents', 'readwrite')
  const doc = await tx.store.get(id)
  if (doc) await tx.store.put({ ...doc, progress })
  await tx.done
}

export async function getFileHandle(documentId: string): Promise<FileSystemFileHandle | undefined> {
  return (await (await getDB()).get('fileHandles', documentId))?.handle
}

export async function putFileHandle(documentId: string, handle: FileSystemFileHandle): Promise<void> {
  await (await getDB()).put('fileHandles', { documentId, handle })
}

export async function deleteFileHandle(documentId: string): Promise<void> {
  await (await getDB()).delete('fileHandles', documentId)
}

/**
 * Removes a document and everything stored for it (progress, highlights, notes, conversations). The PDF file is
 * untouched. The file handle is kept: it can't be exported, so it is what lets a document that comes back through
 * an import reopen with one click (SPEC.md §4.3).
 */
export async function removeDocument(id: string): Promise<void> {
  const tx = (await getDB()).transaction(['documents', 'highlights', 'notes', 'conversations'], 'readwrite')
  const highlightKeys = await tx.objectStore('highlights').index('documentId').getAllKeys(id)
  const noteKeys = await tx.objectStore('notes').index('documentId').getAllKeys(id)
  const conversationKeys = await tx.objectStore('conversations').index('documentId').getAllKeys(id)
  await Promise.all([
    tx.objectStore('documents').delete(id),
    ...highlightKeys.map((key) => tx.objectStore('highlights').delete(key)),
    ...noteKeys.map((key) => tx.objectStore('notes').delete(key)),
    ...conversationKeys.map((key) => tx.objectStore('conversations').delete(key)),
    tx.done,
  ])
}

/** A document's notes: document-level ones first, then by page, oldest first within a page. */
export async function listNotes(documentId: string): Promise<Note[]> {
  const all = await (await getDB()).getAllFromIndex('notes', 'documentId', documentId)
  return all.sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0) || a.createdAt - b.createdAt)
}

export async function putNote(note: Note): Promise<void> {
  await (await getDB()).put('notes', note)
}

export async function deleteNote(id: string): Promise<void> {
  await (await getDB()).delete('notes', id)
}

/** A document's saved conversations, most recently updated first. */
export async function listConversations(documentId: string): Promise<Conversation[]> {
  const all = await (await getDB()).getAllFromIndex('conversations', 'documentId', documentId)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function putConversation(conversation: Conversation): Promise<void> {
  await (await getDB()).put('conversations', conversation)
}

export async function deleteConversation(id: string): Promise<void> {
  await (await getDB()).delete('conversations', id)
}

export async function deleteConversations(documentId: string): Promise<void> {
  const tx = (await getDB()).transaction('conversations', 'readwrite')
  const keys = await tx.store.index('documentId').getAllKeys(documentId)
  await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done])
}

/** Everything except file handles, for the export file (SPEC.md §4.6). */
export async function exportAll(): Promise<ExportFile> {
  const tx = (await getDB()).transaction(['documents', 'highlights', 'notes', 'conversations'])
  const [documents, highlights, notes, conversations] = await Promise.all([
    tx.objectStore('documents').getAll(),
    tx.objectStore('highlights').getAll(),
    tx.objectStore('notes').getAll(),
    tx.objectStore('conversations').getAll(),
  ])
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: Date.now(), documents, highlights, notes, conversations }
}

/** How many records of each kind an import added or changed. */
export type ImportCounts = Record<'documents' | 'highlights' | 'notes' | 'conversations', number>

/**
 * Merges an export into the library in one transaction (SPEC.md §4.6). Records are matched by id and the newer
 * `updatedAt` wins; for documents that is `progress.updatedAt`, `lastOpenedAt` keeps the later of the two and
 * the local slug is kept so links stay valid. Nothing is deleted.
 */
export async function importAll(data: ExportFile): Promise<ImportCounts> {
  const tx = (await getDB()).transaction(['documents', 'highlights', 'notes', 'conversations'], 'readwrite')
  const counts: ImportCounts = { documents: 0, highlights: 0, notes: 0, conversations: 0 }

  const documents = tx.objectStore('documents')
  for (const incoming of data.documents) {
    const local = await documents.get(incoming.id)
    let merged: DocumentMeta
    if (local) {
      const newer = incoming.progress.updatedAt > local.progress.updatedAt ? incoming : local
      merged = {
        ...newer,
        slug: local.slug,
        createdAt: Math.min(local.createdAt, incoming.createdAt),
        lastOpenedAt: Math.max(local.lastOpenedAt, incoming.lastOpenedAt),
      }
      if (JSON.stringify(merged) === JSON.stringify(local)) continue
    } else {
      // A different local document may already use the slug.
      let slug = incoming.slug
      for (let n = 2; await documents.index('slug').getKey(slug); n++) slug = `${incoming.slug}-${n}`
      merged = { ...incoming, slug }
    }
    await documents.put(merged)
    counts.documents++
  }

  for (const store of ['highlights', 'notes', 'conversations'] as const) {
    const objectStore = tx.objectStore(store)
    for (const incoming of data[store]) {
      const local = await objectStore.get(incoming.id)
      if (local && local.updatedAt >= incoming.updatedAt) continue
      await objectStore.put(incoming)
      counts[store]++
    }
  }

  await tx.done
  return counts
}

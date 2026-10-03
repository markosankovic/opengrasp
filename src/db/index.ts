import { openDB, type IDBPDatabase } from 'idb'
import { slugify, slugSource } from '../slug'
import type { Conversation, DocumentMeta, OpenGraspDB } from './schema'

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

/** Removes a document and everything stored for it (progress, highlights, notes, conversations, file handle). The PDF file is untouched. */
export async function removeDocument(id: string): Promise<void> {
  const tx = (await getDB()).transaction(['documents', 'highlights', 'notes', 'conversations', 'fileHandles'], 'readwrite')
  const highlightKeys = await tx.objectStore('highlights').index('documentId').getAllKeys(id)
  const noteKeys = await tx.objectStore('notes').index('documentId').getAllKeys(id)
  const conversationKeys = await tx.objectStore('conversations').index('documentId').getAllKeys(id)
  await Promise.all([
    tx.objectStore('documents').delete(id),
    tx.objectStore('fileHandles').delete(id),
    ...highlightKeys.map((key) => tx.objectStore('highlights').delete(key)),
    ...noteKeys.map((key) => tx.objectStore('notes').delete(key)),
    ...conversationKeys.map((key) => tx.objectStore('conversations').delete(key)),
    tx.done,
  ])
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

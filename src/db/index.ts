import { openDB, type IDBPDatabase } from 'idb'
import type { DocumentMeta, OpenGraspDB } from './schema'

// The only module that talks to IndexedDB (SPEC.md §3.1). Components use these functions, never idb directly.

const DB_NAME = 'opengrasp'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<OpenGraspDB>> | undefined

export function getDB(): Promise<IDBPDatabase<OpenGraspDB>> {
  dbPromise ??= openDB<OpenGraspDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
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
    },
  })
  return dbPromise
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

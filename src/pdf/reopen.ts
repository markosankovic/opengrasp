import { deleteFileHandle, getFileHandle } from '../db'
import type { DocumentMeta } from '../db/schema'
import { fileFromHandle, FileUnavailableError, pickPdf, supportsFileHandles, type PickedFile } from './fileAccess'

// Getting a library document's file back (SPEC.md §4.3).

/** Without a user gesture: succeeds only if a stored handle still has read permission (e.g. on reload). */
export async function reopenSilently(doc: DocumentMeta): Promise<PickedFile | null> {
  if (!supportsFileHandles) return null
  const handle = await getFileHandle(doc.id)
  if (!handle || (await handle.queryPermission({ mode: 'read' })) !== 'granted') return null
  try {
    return { file: await handle.getFile(), handle }
  } catch {
    return null
  }
}

/**
 * From a click: uses the stored handle (asking for permission if it has lapsed), otherwise the file picker.
 * `message` explains why the stored file couldn't be used, if that happened.
 */
export async function reopenInteractive(doc: DocumentMeta): Promise<{ picked: PickedFile | null; message?: string }> {
  const handle = supportsFileHandles ? await getFileHandle(doc.id) : undefined
  let message: string | undefined
  if (handle) {
    try {
      return { picked: { file: await fileFromHandle(handle), handle } }
    } catch (e) {
      if (!(e instanceof FileUnavailableError)) throw e
      if (e.reason === 'denied') return { picked: null, message: `${e.message} Click again to retry.` }
      await deleteFileHandle(doc.id)
      message = `${e.message} Select ${doc.fileName} again.`
    }
  }
  return { picked: await pickPdf(), message }
}

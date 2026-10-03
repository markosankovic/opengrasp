// Reopening files from the library (SPEC.md §4.3). With the File System Access API (Chromium), the app keeps a
// handle to each opened file in IndexedDB and can reopen it with one click. Other browsers re-pick the file.

export interface PickedFile {
  file: File
  handle?: FileSystemFileHandle
}

export const supportsFileHandles = typeof window !== 'undefined' && 'showOpenFilePicker' in window

/** Opens the system file picker. Returns null if the user cancels. Only call this where supportsFileHandles is true. */
export async function pickPdfWithHandle(): Promise<PickedFile | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({
      id: 'opengrasp-pdf',
      types: [{ description: 'PDF documents', accept: { 'application/pdf': ['.pdf'] } }],
    })
    return handle ? { file: await handle.getFile(), handle } : null
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

/**
 * Starts reading a file handle from a drop event. Must be called synchronously inside the drop handler,
 * because the DataTransfer items are cleared once the handler returns.
 */
export function handleFromDrop(event: DragEvent): Promise<FileSystemFileHandle | undefined> {
  const item = event.dataTransfer?.items[0]
  if (!item?.getAsFileSystemHandle) return Promise.resolve(undefined)
  return item
    .getAsFileSystemHandle()
    .then((handle) => (handle?.kind === 'file' ? (handle as FileSystemFileHandle) : undefined))
    .catch(() => undefined)
}

export class FileUnavailableError extends Error {
  readonly reason: 'denied' | 'missing'

  constructor(reason: 'denied' | 'missing') {
    super(reason === 'denied' ? 'Permission to read the file was not granted.' : 'The file was moved, renamed or deleted.')
    this.reason = reason
  }
}

/**
 * Reads a stored handle. Asks for read permission if the browser no longer has it, which shows a small
 * prompt and needs a user gesture (the click on the library item).
 */
export async function fileFromHandle(handle: FileSystemFileHandle): Promise<File> {
  if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
    if ((await handle.requestPermission({ mode: 'read' })) !== 'granted') {
      throw new FileUnavailableError('denied')
    }
  }
  try {
    return await handle.getFile()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      throw new FileUnavailableError('missing')
    }
    throw error
  }
}

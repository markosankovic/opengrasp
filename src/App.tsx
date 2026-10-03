import { useCallback, useEffect, useState } from 'react'
import type { DocumentMeta } from './db/schema'
import DbBlockedNotice from './components/DbBlockedNotice'
import Library from './components/Library'
import Reader from './components/Reader'
import Resume from './components/Resume'
import UpdatePrompt from './components/UpdatePrompt'
import type { OpenedPdf } from './pdf/openPdf'
import { backToLibrary, navigate, openedFromLibrary, useRoute } from './router'

export default function App() {
  const route = useRoute()
  // The last opened document stays in memory after going back to the library, so browser "forward" returns to it
  // instantly. It is released when another document replaces it.
  const [opened, setOpened] = useState<OpenedPdf | null>(null)
  const active = route.name === 'reader' && opened?.meta.slug === route.slug ? opened : null

  const pdf = opened?.pdf
  useEffect(
    () => () => {
      void pdf?.loadingTask.destroy()
    },
    [pdf],
  )

  const openFromLibrary = useCallback((next: OpenedPdf) => {
    setOpened(next)
    navigate({ name: 'reader', slug: next.meta.slug }, { fromLibrary: true })
  }, [])

  const openFromResume = useCallback((next: OpenedPdf) => {
    setOpened(next)
    // The user may have picked a different file than the one in the URL.
    navigate({ name: 'reader', slug: next.meta.slug }, { replace: true, fromLibrary: openedFromLibrary() })
  }, [])

  const onProgressSaved = useCallback((id: string, progress: DocumentMeta['progress']) => {
    setOpened((o) => (o && o.meta.id === id ? { ...o, meta: { ...o.meta, progress } } : o))
  }, [])

  return (
    <>
      {route.name === 'library' ? (
        <Library onOpened={openFromLibrary} />
      ) : active ? (
        <Reader key={active.meta.id} opened={active} onClose={backToLibrary} onProgressSaved={onProgressSaved} />
      ) : (
        <Resume key={route.slug} slug={route.slug} onOpened={openFromResume} />
      )}
      <DbBlockedNotice />
      <UpdatePrompt />
    </>
  )
}

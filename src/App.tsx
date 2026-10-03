import { useState } from 'react'
import Library from './components/Library'
import Reader from './components/Reader'
import UpdatePrompt from './components/UpdatePrompt'
import type { OpenedPdf } from './pdf/openPdf'

export default function App() {
  const [opened, setOpened] = useState<OpenedPdf | null>(null)

  return (
    <>
      {opened ? (
        <Reader
          opened={opened}
          onClose={() => {
            void opened.pdf.loadingTask.destroy()
            setOpened(null)
          }}
        />
      ) : (
        <Library onOpened={setOpened} />
      )}
      <UpdatePrompt />
    </>
  )
}

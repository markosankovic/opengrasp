import { useEffect, useState } from 'react'
import { DB_BLOCKED_EVENT, getDB } from '../db'

/** Explains why nothing loads while another tab with an older version holds the database (see getDB). */
export default function DbBlockedNotice() {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const onBlocked = () => {
      setBlocked(true)
      // The pending open completes once the other tab lets go; hide the notice then.
      void getDB().then(() => setBlocked(false))
    }
    window.addEventListener(DB_BLOCKED_EVENT, onBlocked)
    return () => window.removeEventListener(DB_BLOCKED_EVENT, onBlocked)
  }, [])

  if (!blocked) return null

  return (
    <div className="fixed inset-x-0 top-0 z-20 border-b border-border bg-surface px-4 py-2 text-center text-sm">
      OpenGrasp is updating its storage. Close or reload other OpenGrasp tabs to continue.
    </div>
  )
}

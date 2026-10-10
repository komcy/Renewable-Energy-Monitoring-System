import { useEffect } from 'react'

/** Calls `onDismiss` on outside click or Escape while `open`. */
export function useDismiss(ref, open, onDismiss) {
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onDismiss()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, onDismiss])
}

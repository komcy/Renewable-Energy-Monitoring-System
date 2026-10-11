import { X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { isTopOverlay, popOverlay, pushOverlay } from './overlayStack'

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }


/**
 * Accessible dialog: Escape and backdrop close it, focus moves inside on open
 * and returns to the trigger on close, page scroll is locked.
 */
export default function Modal({ open, onClose, title, description, size = 'md', children, footer, busy = false }) {
  const panelRef = useRef(null)
  const titleId = useId()
  // Read the latest props without re-running the open/close effect on every render
  const onEscape = useEffectEvent(() => {
    if (!busy) onClose()
  })

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const focusable = panelRef.current?.querySelector('input, textarea, select, button:not([data-close])')
    ;(focusable || panelRef.current)?.focus()
    const token = pushOverlay()
    const onKey = (e) => {
      if (e.key === 'Escape' && isTopOverlay(token)) onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      popOverlay(token)
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={busy ? undefined : onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full ${SIZES[size]} flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            disabled={busy}
            className="-mr-2 grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

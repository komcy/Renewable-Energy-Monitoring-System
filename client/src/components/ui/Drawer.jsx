import { X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { isTopOverlay, popOverlay, pushOverlay } from './overlayStack'

/** Right-hand slide-over panel. Escape closes it when it's the topmost overlay. */
export default function Drawer({ open, onClose, title, description, children, footer, width = 'max-w-xl' }) {
  const panelRef = useRef(null)
  const titleId = useId()
  const onEscape = useEffectEvent(() => onClose())

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    panelRef.current?.focus()
    const token = pushOverlay()
    const onKey = (e) => {
      if (e.key === 'Escape' && isTopOverlay(token)) onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      popOverlay(token)
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex h-full w-full ${width} flex-col bg-white shadow-2xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}

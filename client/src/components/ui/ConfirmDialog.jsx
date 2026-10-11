import { useState } from 'react'
import Button from './Button'
import Modal from './Modal'

/**
 * Confirmation for a consequential action. `onConfirm` may be async; errors
 * are left to the caller (toast) and the dialog stays open on failure.
 */
export default function ConfirmDialog({ title, children, confirmLabel = 'Confirm', tone = 'primary', icon: Icon, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } catch {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      busy={busy}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={confirm} loading={busy}>
            {Icon && !busy && <Icon className="size-4" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-slate-600">{children}</div>
    </Modal>
  )
}

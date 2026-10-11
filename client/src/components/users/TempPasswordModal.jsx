import { Check, Copy, KeyRound, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

/** Shows a one-time temporary password for the admin to pass on. */
export default function TempPasswordModal({ user, password, intro, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Modal open size="sm" onClose={onClose} title="Temporary password" description={`For ${user.name} (${user.email})`} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-4 text-sm text-slate-600">
        <p>{intro}</p>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 pl-3">
          <KeyRound className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <code className="flex-1 select-all break-all font-mono text-base font-semibold tracking-wide text-slate-900">{password}</code>
          <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy password">
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-inset ring-amber-600/20">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This password is shown only once. Share it securely; they&apos;ll be asked to change it after signing in.
        </p>
      </div>
    </Modal>
  )
}

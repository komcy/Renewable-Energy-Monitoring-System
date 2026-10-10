import { CircleCheck } from 'lucide-react'
import { useId, useState } from 'react'
import toast from 'react-hot-toast'
import { alertsApi } from '@/api/alerts'
import { getErrorMessage } from '@/api/client'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { alertTypeInfo } from '@/constants/alerts'

const MIN = 3
const MAX = 2000
const SUGGESTIONS = {
  OverTemperature: ['Cleared ventilation and verified cooling fans', 'Reduced load; temperature back within limits'],
  LowEfficiency: ['Cleaned panel surfaces', 'Replaced faulty string fuse'],
  OutputDrop: ['Reset tripped inverter string', 'Transient shading; output recovered'],
  ZeroGeneration: ['Restarted inverter after grid trip', 'Replaced failed DC isolator'],
  LowStateOfCharge: ['Recharged battery bank from grid', 'Adjusted discharge schedule'],
}

export default function ResolveAlertModal({ alert, onClose, onResolved }) {
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const trimmed = notes.trim()
  const error = trimmed.length < MIN ? 'Describe what was done to fix the issue (at least 3 characters)' : ''
  const info = alertTypeInfo(alert.alertType)
  const suggestions = SUGGESTIONS[alert.alertType] ?? ['Inspected on site; no fault found', 'Issue fixed and verified']

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (error) return
    setSaving(true)
    try {
      const updated = await alertsApi.resolve(alert.id, trimmed)
      toast.success('Alert resolved')
      onResolved(updated)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not resolve the alert'))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      title="Resolve alert"
      description={`${info.label} on ${alert.asset?.assetCode ?? 'asset'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="resolve-form" loading={saving}>
            <CircleCheck className="size-4" /> Mark resolved
          </Button>
        </>
      }
    >
      <form id="resolve-form" onSubmit={submit} noValidate>
        <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{alert.message}</p>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          Resolution notes
        </label>
        <textarea
          id={id}
          rows={4}
          maxLength={MAX}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && Boolean(error)}
          placeholder="What was the cause and what action was taken?"
          className={`block w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:ring-4 ${
            touched && error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15' : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/15'
          }`}
        />
        <div className="mt-1.5 flex justify-between gap-3 text-xs">
          <span className="font-medium text-red-600">{touched && error}</span>
          <span className="text-slate-400">
            {notes.length}/{MAX}
          </span>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Quick fill</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setNotes(s)}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200"
            >
              {s}
            </button>
          ))}
        </div>
      </form>
    </Modal>
  )
}

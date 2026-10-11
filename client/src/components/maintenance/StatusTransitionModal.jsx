import { useId, useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { maintenanceApi } from '@/api/maintenance'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import { TRANSITION_LABELS, toLocalInput } from '@/constants/maintenance'

const textareaCls = (error) =>
  `block w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:ring-4 ${
    error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15' : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/15'
  }`

/**
 * Moves a work order to `target`. Completing asks for the work done, cost and
 * completion time; cancelling asks for a reason.
 */
export default function StatusTransitionModal({ workOrder, target, onClose, onDone }) {
  const notesId = useId()
  const noteId = useId()
  const completing = target === 'Completed'
  const cancelling = target === 'Cancelled'
  const [values, setValues] = useState({
    technicianNotes: workOrder.technicianNotes ?? '',
    cost: workOrder.cost != null ? String(workOrder.cost) : '',
    completedAt: toLocalInput(new Date()),
    note: '',
  })
  const [touched, setTouched] = useState(false)
  // Reference time for the "not in the future" check (allowing a little clock drift)
  const [openedAt] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)

  const errors = {
    technicianNotes: completing && values.technicianNotes.trim().length < 3 ? 'Describe the work that was done' : '',
    cost: values.cost !== '' && (!Number.isFinite(Number(values.cost)) || Number(values.cost) < 0) ? 'Enter a cost of 0 or more' : '',
    completedAt:
      completing && (!values.completedAt || new Date(values.completedAt).getTime() > openedAt + 10 * 60_000) ? 'Completion time cannot be in the future' : '',
    note: cancelling && values.note.trim().length < 3 ? 'Explain why it is being cancelled' : '',
  }
  const show = (k) => (touched ? errors[k] : '')
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    try {
      const body = { status: target, note: values.note.trim() || undefined }
      if (completing) {
        body.technicianNotes = values.technicianNotes.trim()
        body.completedAt = new Date(values.completedAt).toISOString()
        if (values.cost !== '') body.cost = Number(values.cost)
      }
      const updated = await maintenanceApi.setStatus(workOrder.id, body)
      toast.success(`${workOrder.workOrderNumber} → ${target}`)
      onDone(updated)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the status'))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      busy={saving}
      title={`${TRANSITION_LABELS[target]}: ${workOrder.workOrderNumber}`}
      description={workOrder.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Back
          </Button>
          <Button type="submit" form="transition-form" variant={cancelling ? 'danger' : 'primary'} loading={saving}>
            {TRANSITION_LABELS[target]}
          </Button>
        </>
      }
    >
      <form id="transition-form" onSubmit={submit} noValidate className="space-y-4">
        {completing && (
          <>
            <div>
              <label htmlFor={notesId} className="mb-1.5 block text-sm font-medium text-slate-700">
                Work done
              </label>
              <textarea
                id={notesId}
                rows={4}
                maxLength={4000}
                value={values.technicianNotes}
                onChange={set('technicianNotes')}
                aria-invalid={Boolean(show('technicianNotes'))}
                placeholder="What was found and fixed, parts replaced, readings after the fix…"
                className={textareaCls(show('technicianNotes'))}
              />
              {show('technicianNotes') && <p className="mt-1.5 text-xs font-medium text-red-600">{show('technicianNotes')}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Cost (₹)" type="number" min="0" step="1" inputMode="numeric" value={values.cost} onChange={set('cost')} error={show('cost')} />
              <FormField label="Completed at" type="datetime-local" value={values.completedAt} onChange={set('completedAt')} error={show('completedAt')} />
            </div>
          </>
        )}
        <div>
          <label htmlFor={noteId} className="mb-1.5 block text-sm font-medium text-slate-700">
            {cancelling ? 'Reason for cancelling' : 'Note'} {!cancelling && <span className="font-normal text-slate-400">(optional)</span>}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={1000}
            value={values.note}
            onChange={set('note')}
            aria-invalid={Boolean(show('note'))}
            placeholder={cancelling ? 'e.g. Duplicate request, asset replaced…' : 'Added to the status history'}
            className={textareaCls(show('note'))}
          />
          {show('note') && <p className="mt-1.5 text-xs font-medium text-red-600">{show('note')}</p>}
        </div>
      </form>
    </Modal>
  )
}

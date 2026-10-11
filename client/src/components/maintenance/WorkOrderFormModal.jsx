import { useId, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { maintenanceApi } from '@/api/maintenance'
import { assetsApi } from '@/api/plants'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { ASSET_TYPES } from '@/constants/assets'
import { MAINTENANCE_TYPES, PRIORITIES, toLocalInput } from '@/constants/maintenance'
import { useAsync } from '@/hooks/useAsync'

const textareaCls =
  'block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15'

/**
 * Create a work order (optionally pre-filled with an asset) or edit an open one.
 * Calls onSaved(workOrder).
 */
export default function WorkOrderFormModal({ workOrder, presetAsset, onClose, onSaved }) {
  const editing = Boolean(workOrder)
  const descId = useId()
  const assets = useAsync(() => assetsApi.list(), [], { enabled: !editing })
  const [form, setForm] = useState(() => {
    const start = new Date(Date.now() + 86_400_000)
    start.setHours(9, 0, 0, 0)
    return {
      asset: presetAsset?.id ?? '',
      title: workOrder?.title ?? '',
      description: workOrder?.description ?? '',
      maintenanceType: workOrder?.maintenanceType ?? 'Preventive',
      priority: workOrder?.priority ?? 'Medium',
      scheduledDate: toLocalInput(workOrder?.scheduledDate ?? start),
      technician: workOrder?.technician ?? '',
    }
  })
  const [touched, setTouched] = useState({})
  const [saving, setSaving] = useState(false)

  const errors = {
    asset: !editing && !form.asset ? 'Choose the asset to work on' : '',
    title: !form.title.trim() ? 'Give the work order a short title' : form.title.length > 140 ? 'Keep the title under 140 characters' : '',
    scheduledDate: !form.scheduledDate || Number.isNaN(new Date(form.scheduledDate).getTime()) ? 'Pick a date and time' : '',
  }
  const show = (k) => (touched[k] ? errors[k] : '')
  const bind = (k) => ({
    name: k,
    value: form[k],
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
  })

  // Group assets by plant for the picker
  const assetOptions = useMemo(() => {
    const list = assets.data ?? []
    return [...list]
      .sort((a, b) => (a.plant?.plantName ?? '').localeCompare(b.plant?.plantName ?? '') || a.assetCode.localeCompare(b.assetCode))
      .map((a) => ({
        value: a.id,
        label: `${a.plant?.plantName ?? 'No plant'} · ${a.assetCode} (${ASSET_TYPES[a.sourceType]?.label ?? a.sourceType})${a.status !== 'Active' ? ' · deactivated' : ''}`,
      }))
  }, [assets.data])

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ asset: true, title: true, scheduledDate: true })
    if (Object.values(errors).some(Boolean)) return
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      maintenanceType: form.maintenanceType,
      priority: form.priority,
      scheduledDate: new Date(form.scheduledDate).toISOString(),
      technician: form.technician.trim() || undefined,
    }
    setSaving(true)
    try {
      const saved = editing ? await maintenanceApi.update(workOrder.id, body) : await maintenanceApi.create({ ...body, asset: form.asset })
      toast.success(editing ? `${saved.workOrderNumber} updated` : `${saved.workOrderNumber} scheduled`)
      onSaved(saved)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the work order'))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      title={editing ? `Edit ${workOrder.workOrderNumber}` : 'New work order'}
      description={editing ? `${workOrder.asset?.assetCode} · ${workOrder.plant?.plantName}` : 'Schedule preventive, corrective or inspection work on an asset.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="wo-form" loading={saving}>
            {editing ? 'Save changes' : 'Schedule work order'}
          </Button>
        </>
      }
    >
      <form id="wo-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <Select
            label="Asset"
            className="sm:col-span-2"
            error={show('asset')}
            {...bind('asset')}
            options={[{ value: '', label: assets.initialLoading ? 'Loading assets…' : 'Choose an asset…' }, ...assetOptions]}
          />
        )}
        <FormField label="Title" placeholder="e.g. Clean panel string A" className="sm:col-span-2" error={show('title')} {...bind('title')} />
        <Select label="Type" options={MAINTENANCE_TYPES.map((t) => ({ value: t, label: t }))} {...bind('maintenanceType')} />
        <Select label="Priority" options={PRIORITIES.map((p) => ({ value: p, label: p }))} {...bind('priority')} />
        <FormField label="Scheduled for" type="datetime-local" error={show('scheduledDate')} {...bind('scheduledDate')} />
        <FormField label="Technician" placeholder="Name or crew" {...bind('technician')} />
        <div className="sm:col-span-2">
          <label htmlFor={descId} className="mb-1.5 block text-sm font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea id={descId} rows={3} maxLength={4000} className={textareaCls} placeholder="Scope of work, safety notes, parts needed…" {...bind('description')} />
        </div>
      </form>
    </Modal>
  )
}

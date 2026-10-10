import { MapPin } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { plantsApi } from '@/api/plants'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { PLANT_STATUSES, PLANT_TYPES } from '@/constants/assets'

const toForm = (p) => ({
  plantName: p?.plantName ?? '',
  plantType: p?.plantType ?? 'Solar',
  capacity: p?.capacity != null ? String(p.capacity) : '',
  status: p?.status ?? 'Operational',
  address: p?.location?.address ?? '',
  latitude: p?.location?.latitude != null ? String(p.location.latitude) : '',
  longitude: p?.location?.longitude != null ? String(p.location.longitude) : '',
})

const numberIn = (value, min, max, label, required = false) => {
  if (value.trim() === '') return required ? `${label} is required` : ''
  const n = Number(value)
  if (!Number.isFinite(n)) return `${label} must be a number`
  if (n < min || n > max) return `${label} must be between ${min} and ${max}`
  return ''
}

const validate = (f) => ({
  plantName: !f.plantName.trim() ? 'Plant name is required' : f.plantName.trim().length > 100 ? 'Name is too long' : '',
  capacity: numberIn(f.capacity, 0, 10_000_000, 'Capacity', true),
  latitude: numberIn(f.latitude, -90, 90, 'Latitude') || (f.longitude.trim() && !f.latitude.trim() ? 'Enter both coordinates' : ''),
  longitude: numberIn(f.longitude, -180, 180, 'Longitude') || (f.latitude.trim() && !f.longitude.trim() ? 'Enter both coordinates' : ''),
})

/** Create (no `plant`) or edit a plant. Calls onSaved(plant) on success. */
export default function PlantFormModal({ open, plant, onClose, onSaved }) {
  const editing = Boolean(plant)
  const [form, setForm] = useState(() => toForm(plant))
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState({})
  const [saving, setSaving] = useState(false)

  const errors = validate(form)
  const err = (k) => serverError[k] || (touched[k] ? errors[k] : '')
  const bind = (k) => ({
    name: k,
    value: form[k],
    onChange: (e) => {
      setForm((f) => ({ ...f, [k]: e.target.value }))
      if (serverError[k]) setServerError((s) => ({ ...s, [k]: '' }))
    },
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
  })

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ plantName: true, capacity: true, latitude: true, longitude: true })
    if (Object.values(errors).some(Boolean)) return

    const body = {
      plantName: form.plantName.trim(),
      plantType: form.plantType,
      capacity: Number(form.capacity),
      status: form.status,
      location: {
        address: form.address.trim() || undefined,
        latitude: form.latitude.trim() ? Number(form.latitude) : undefined,
        longitude: form.longitude.trim() ? Number(form.longitude) : undefined,
      },
    }
    setSaving(true)
    try {
      const saved = editing ? await plantsApi.update(plant.id, body) : await plantsApi.create(body)
      toast.success(editing ? 'Plant updated' : `Plant "${saved.plantName}" created`)
      onSaved(saved)
    } catch (error) {
      if (error.response?.status === 409) setServerError({ plantName: 'A plant with this name already exists' })
      toast.error(getErrorMessage(error, 'Could not save the plant'))
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title={editing ? `Edit ${plant.plantName}` : 'New energy plant'}
      description={editing ? 'Update the plant specification and status.' : 'Register a solar, wind or hybrid site.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="plant-form" loading={saving}>
            {editing ? 'Save changes' : 'Create plant'}
          </Button>
        </>
      }
    >
      <form id="plant-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Plant name" placeholder="e.g. Pune Hybrid Farm" className="sm:col-span-2" error={err('plantName')} {...bind('plantName')} />
        <Select label="Plant type" options={PLANT_TYPES.map((t) => ({ value: t, label: t }))} {...bind('plantType')} />
        <Select label="Status" options={PLANT_STATUSES.map((s) => ({ value: s, label: s }))} {...bind('status')} />
        <FormField
          label="Installed capacity (kW)"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="5000"
          className="sm:col-span-2"
          error={err('capacity')}
          {...bind('capacity')}
        />
        <FormField label="Address" icon={MapPin} placeholder="City, state" className="sm:col-span-2" {...bind('address')} />
        <FormField label="Latitude" type="number" inputMode="decimal" step="any" placeholder="18.5204" error={err('latitude')} {...bind('latitude')} />
        <FormField label="Longitude" type="number" inputMode="decimal" step="any" placeholder="73.8567" error={err('longitude')} {...bind('longitude')} />
      </form>
    </Modal>
  )
}

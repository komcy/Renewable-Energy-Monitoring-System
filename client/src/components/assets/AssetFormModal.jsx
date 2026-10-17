import { useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { assetsApi } from '@/api/plants'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { ASSET_TYPES } from '@/constants/assets'
import { ASSET_SPEC_FIELDS, defaultThreshold, refId, thresholdsFor } from '@/constants/assetForm'
import { usePlantOptions } from '@/hooks/usePlantOptions'

const str = (v) => (v == null ? '' : String(v))

function initial(asset, defaultPlant, type = asset?.sourceType ?? 'SolarPanel') {
  const { key, fields } = ASSET_SPEC_FIELDS[type]
  const f = {
    assetCode: asset?.assetCode ?? '',
    name: asset?.name ?? '',
    sourceType: type,
    plant: refId(asset?.plant) ?? defaultPlant ?? '',
    capacity: str(asset?.capacity),
    location: asset?.location ?? '',
    installationDate: asset?.installationDate ? String(asset.installationDate).slice(0, 10) : '',
  }
  for (const s of fields) f[`s.${s.name}`] = str(asset?.[key]?.[s.name] ?? s.default)
  for (const t of thresholdsFor(type)) f[`t.${t.name}`] = str(asset?.thresholds?.[t.name] ?? defaultThreshold(type, t.name))
  return f
}

const check = (value, field) => {
  const v = value.trim()
  if (!v) return ''
  if (field.text) return v.length > 100 ? 'Too long' : ''
  const n = Number(v)
  if (!Number.isFinite(n)) return 'Must be a number'
  if (n < (field.min ?? 0)) return `Must be at least ${field.min ?? 0}`
  if (field.max != null && n > field.max) return `Must be at most ${field.max}`
  return ''
}

function validate(f, editing) {
  const e = {}
  if (!editing && !/^[A-Za-z0-9_-]{2,30}$/.test(f.assetCode.trim())) e.assetCode = 'Use 2–30 letters, digits, - or _'
  if (!f.name.trim()) e.name = 'Name is required'
  else if (f.name.trim().length > 100) e.name = 'Name is too long'
  if (!f.plant) e.plant = 'Select a plant'
  e.capacity = f.capacity.trim() ? check(f.capacity, { max: 10_000_000 }) : 'Capacity is required'
  if (f.location.length > 200) e.location = 'Location is too long'
  for (const s of ASSET_SPEC_FIELDS[f.sourceType].fields) e[`s.${s.name}`] = check(f[`s.${s.name}`], s)
  for (const t of thresholdsFor(f.sourceType)) e[`t.${t.name}`] = check(f[`t.${t.name}`], t)
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v))
}

/** Register (no `asset`) or edit an asset. Calls onSaved(asset). */
export default function AssetFormModal({ asset, defaultPlant, onClose, onSaved }) {
  const editing = Boolean(asset)
  const plants = usePlantOptions()
  const [form, setForm] = useState(() => initial(asset, defaultPlant))
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState({})
  const [saving, setSaving] = useState(false)

  const errors = validate(form, editing)
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
  const changeType = (e) => {
    const type = e.target.value
    setForm((f) => ({ ...initial(null, f.plant, type), assetCode: f.assetCode, name: f.name, capacity: f.capacity, location: f.location, installationDate: f.installationDate }))
  }

  const { key: specKey, fields: specFields } = ASSET_SPEC_FIELDS[form.sourceType]
  const thresholdFields = thresholdsFor(form.sourceType)
  const input = (prefix, f) => {
    const k = `${prefix}.${f.name}`
    return (
      <FormField
        key={k}
        label={f.unit ? `${f.label} (${f.unit})` : f.label}
        type={f.text ? 'text' : 'number'}
        inputMode={f.text ? undefined : 'decimal'}
        step={f.text ? undefined : 'any'}
        placeholder={f.placeholder}
        hint={f.hint}
        error={err(k)}
        {...bind(k)}
      />
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])))
    if (Object.keys(errors).length) return

    const collect = (prefix, fields) =>
      Object.fromEntries(
        fields
          .filter((f) => form[`${prefix}.${f.name}`].trim() !== '')
          .map((f) => [f.name, f.text ? form[`${prefix}.${f.name}`].trim() : Number(form[`${prefix}.${f.name}`])]),
      )
    const specs = collect('s', specFields)
    const body = {
      name: form.name.trim(),
      plant: form.plant,
      capacity: Number(form.capacity),
      location: editing ? form.location.trim() : form.location.trim() || undefined,
      installationDate: form.installationDate || (editing ? null : undefined),
      thresholds: collect('t', thresholdFields),
      ...(Object.keys(specs).length && { [specKey]: specs }),
    }
    if (!editing) Object.assign(body, { assetCode: form.assetCode.trim().toUpperCase(), sourceType: form.sourceType })

    setSaving(true)
    try {
      const saved = editing ? await assetsApi.update(asset.id, body) : await assetsApi.create(body)
      toast.success(editing ? 'Asset updated' : `Asset ${saved.assetCode} registered`)
      onSaved(saved)
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save the asset')
      if (error.response?.status === 409 || /duplicate|already/i.test(message)) setServerError({ assetCode: 'This asset code is already in use' })
      toast.error(message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      busy={saving}
      title={editing ? `Edit ${asset.assetCode}` : 'Register asset'}
      description={editing ? 'Update details, specifications and alert thresholds.' : 'Add a panel, turbine, inverter, battery or transformer to a plant.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="asset-form" loading={saving}>
            {editing ? 'Save changes' : 'Register asset'}
          </Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Asset code"
          placeholder="e.g. PV-101"
          disabled={editing}
          hint={editing ? 'Fixed after creation' : 'Letters, digits, - and _ only'}
          error={err('assetCode')}
          {...bind('assetCode')}
        />
        <Select
          label="Type"
          disabled={editing}
          options={Object.entries(ASSET_TYPES).map(([value, t]) => ({ value, label: t.label }))}
          {...bind('sourceType')}
          onChange={changeType}
        />
        <FormField label="Name" placeholder="e.g. Block A inverter" className="sm:col-span-2" error={err('name')} {...bind('name')} />
        <Select
          label="Plant"
          error={err('plant')}
          options={[{ value: '', label: 'Select a plant…' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]}
          {...bind('plant')}
        />
        <FormField label="Rated capacity (kW)" type="number" inputMode="decimal" step="any" placeholder="1500" error={err('capacity')} {...bind('capacity')} />
        <FormField label="Location" placeholder="e.g. Row 3, north field" error={err('location')} {...bind('location')} />
        <FormField label="Installation date" type="date" {...bind('installationDate')} />

        <h3 className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900 sm:col-span-2">Specifications</h3>
        {specFields.map((f) => input('s', f))}

        <div className="border-t border-slate-100 pt-4 sm:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Alert thresholds</h3>
          <p className="mt-0.5 text-sm text-slate-500">Used by the alert engine for this asset. Defaults suit most equipment.</p>
        </div>
        {thresholdFields.map((f) => input('t', f))}
      </form>
    </Modal>
  )
}

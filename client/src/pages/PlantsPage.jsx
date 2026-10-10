import { Factory, MapPin, Pencil, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { plantsApi } from '@/api/plants'
import RoleGate from '@/components/auth/RoleGate'
import PlantFormModal from '@/components/plants/PlantFormModal'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { PLANT_STATUS_BADGE, PLANT_STATUSES, PLANT_TYPES } from '@/constants/assets'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { powerParts } from '@/utils/format'

function PlantCard({ plant, canEdit, onEdit }) {
  const { assetCount, activeAssets } = plant
  const share = assetCount ? (activeAssets / assetCount) * 100 : 0
  return (
    <div className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/plants/${plant.id}`} className="font-semibold text-slate-900 after:absolute after:inset-0 hover:text-emerald-700">
            {plant.plantName}
          </Link>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {plant.location?.address || 'No address set'}
          </p>
        </div>
        <Pill tone={PLANT_STATUS_BADGE[plant.status]}>{plant.status}</Pill>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Type</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{plant.plantType}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Capacity</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{powerParts(plant.capacity).text}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Assets</dt>
          <dd className="mt-0.5 font-medium text-slate-900">
            {activeAssets}
            <span className="font-normal text-slate-500"> / {assetCount} active</span>
          </dd>
        </div>
      </dl>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => onEdit(plant)}
          className="relative z-10 mt-4 inline-flex items-center gap-1.5 self-start rounded-md text-xs font-semibold text-slate-600 hover:text-emerald-700"
        >
          <Pencil className="size-3.5" /> Edit plant
        </button>
      )}
    </div>
  )
}

export default function PlantsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [modal, setModal] = useState(null) // { plant? }

  const query = { search: search.trim() || undefined, plantType: type || undefined, status: status || undefined }
  const { data, error, initialLoading, stale, reload } = useAsync(() => plantsApi.list(query), [query])
  const plants = data?.data ?? []
  const filtered = Boolean(query.search || query.plantType || query.status)

  return (
    <div>
      <PageHeader
        title="Energy plants"
        description="Solar, wind and hybrid sites with their installed capacity and asset health."
        actions={
          <RoleGate permission="plants:write">
            <Button onClick={() => setModal({})}>
              <Plus className="size-4" /> New plant
            </Button>
          </RoleGate>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="plant-search" className="sr-only">Search plants</label>
          <input
            id="plant-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plants…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>
        <Select
          label="Plant type"
          hideLabel
          className="sm:w-40"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[{ value: '', label: 'All types' }, ...PLANT_TYPES.map((t) => ({ value: t, label: t }))]}
        />
        <Select
          label="Status"
          hideLabel
          className="sm:w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...PLANT_STATUSES.map((s) => ({ value: s, label: s }))]}
        />
      </div>

      {initialLoading ? (
        <LoadingState label="Loading plants…" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !plants.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white">
          <EmptyState
            icon={Factory}
            title={filtered ? 'No plants match these filters' : 'No plants registered yet'}
            action={
              !filtered && (
                <RoleGate permission="plants:write">
                  <Button onClick={() => setModal({})}>
                    <Plus className="size-4" /> Register your first plant
                  </Button>
                </RoleGate>
              )
            }
          >
            {filtered ? 'Try clearing the search or filters.' : 'Plants group the assets you monitor.'}
          </EmptyState>
        </div>
      ) : (
        <div className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${stale ? 'opacity-60' : ''}`}>
          {plants.map((p) => (
            <PlantCard key={p.id} plant={p} canEdit={can('plants:write')} onEdit={(plant) => setModal({ plant })} />
          ))}
        </div>
      )}

      {modal && (
        <PlantFormModal
          open
          plant={modal.plant}
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setModal(null)
            if (modal.plant) reload()
            else navigate(`/plants/${saved.id}`)
          }}
        />
      )}
    </div>
  )
}

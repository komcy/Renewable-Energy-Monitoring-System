import { Eye, Pencil, Plus, Power, PowerOff, Search, Sun, Trash2, Wrench } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useSearchParams } from 'react-router'
import { getErrorMessage } from '@/api/client'
import { assetsApi } from '@/api/plants'
import RoleGate from '@/components/auth/RoleGate'
import AssetDetailDrawer from '@/components/assets/AssetDetailDrawer'
import AssetFormModal from '@/components/assets/AssetFormModal'
import WorkOrderFormModal from '@/components/maintenance/WorkOrderFormModal'
import AssetStatusModal from '@/components/plants/AssetStatusModal'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PageHeader from '@/components/ui/PageHeader'
import Pagination from '@/components/ui/Pagination'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { ASSET_TYPES } from '@/constants/assets'
import { refId } from '@/constants/assetForm'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { usePlantOptions } from '@/hooks/usePlantOptions'
import { powerParts } from '@/utils/format'

const PAGE_SIZE = 20
const STATUSES = ['Active', 'Deactivated']
const ACTIVE_TONE = 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
const OFF_TONE = 'bg-slate-100 text-slate-600 ring-slate-500/20'

export default function AssetsPage() {
  const { can } = useAuth()
  const canWrite = can('assets:write')
  const plants = usePlantOptions()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const plant = params.get('plant') || ''
  const type = ASSET_TYPES[params.get('type')] ? params.get('type') : ''
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [searchText, setSearchText] = useState(search)
  const [version, setVersion] = useState(0)
  const [detailId, setDetailId] = useState(null)
  const [form, setForm] = useState(null) // { asset? }
  const [statusAsset, setStatusAsset] = useState(null)
  const [maintenanceAsset, setMaintenanceAsset] = useState(null)
  const [deleteAsset, setDeleteAsset] = useState(null)

  const update = (patch) => {
    const next = { search, plant, type, status, page: String(page), ...patch }
    if (!('page' in patch)) next.page = '1'
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'page' && v === '1'))), { replace: true })
  }
  const commitSearch = useEffectEvent((value) => {
    if (value !== search) update({ search: value })
  })
  useEffect(() => {
    const t = setTimeout(() => commitSearch(searchText.trim()), 300)
    return () => clearTimeout(t)
  }, [searchText])

  const query = { search: search || undefined, plant: plant || undefined, sourceType: type || undefined, status: status || undefined, page, limit: PAGE_SIZE }
  const { data, error, initialLoading, stale, reload } = useAsync(() => assetsApi.page(query), [query, version])
  const assets = data?.data ?? []
  const filtered = Boolean(search || plant || type || status)

  // Deleting the last row of the last page leaves an empty page: step back
  const fixPage = useEffectEvent(() => update({ page: String(data.pages) }))
  useEffect(() => {
    if (data && data.pages > 0 && page > data.pages) fixPage()
  }, [data, page])

  const changed = () => {
    setVersion((v) => v + 1)
    reload()
  }
  const remove = async () => {
    try {
      await assetsApi.remove(deleteAsset.id)
      toast.success(`${deleteAsset.assetCode} deleted`)
      setDeleteAsset(null)
      changed()
    } catch (e) {
      toast.error(getErrorMessage(e, 'Could not delete the asset'))
      throw e
    }
  }
  // Overlays stack under the drawer, so close it before opening an action dialog
  const fromDrawer = (setter) => (a) => {
    setDetailId(null)
    setter(a)
  }

  return (
    <div>
      <PageHeader
        title="Assets"
        description="Panels, turbines, inverters, batteries and transformers across all plants."
        actions={
          <RoleGate permission="assets:write">
            <Button onClick={() => setForm({})}>
              <Plus className="size-4" /> Register asset
            </Button>
          </RoleGate>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="asset-search" className="sr-only">Search assets</label>
          <input
            id="asset-search"
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by code or name…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>
        <Select label="Plant" hideLabel className="lg:w-52" value={plant} onChange={(e) => update({ plant: e.target.value })} options={[{ value: '', label: 'All plants' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]} />
        <Select label="Asset type" hideLabel className="lg:w-48" value={type} onChange={(e) => update({ type: e.target.value })} options={[{ value: '', label: 'All types' }, ...Object.entries(ASSET_TYPES).map(([value, t]) => ({ value, label: t.label }))]} />
        <Select label="Status" hideLabel className="lg:w-44" value={status} onChange={(e) => update({ status: e.target.value })} options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {initialLoading ? (
          <LoadingState label="Loading assets…" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !assets.length ? (
          <EmptyState
            icon={Sun}
            title={filtered ? 'No assets match these filters' : 'No assets registered yet'}
            action={
              !filtered && (
                <RoleGate permission="assets:write">
                  <Button onClick={() => setForm({})}>
                    <Plus className="size-4" /> Register your first asset
                  </Button>
                </RoleGate>
              )
            }
          >
            {filtered ? 'Try clearing the search or filters.' : 'Assets are the equipment that reports telemetry.'}
          </EmptyState>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${stale ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Asset</th>
                  <th className="px-3 py-2.5">Plant</th>
                  <th className="px-3 py-2.5 text-right">Capacity</th>
                  <th className="px-3 py-2.5">Installed</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((a) => {
                  const T = ASSET_TYPES[a.sourceType]
                  const off = a.status !== 'Active'
                  return (
                    <tr key={a.id} className={off ? 'bg-slate-50/60 text-slate-500' : ''}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${T.tone}`} title={T.label}>
                            <T.icon className="size-[18px]" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <button type="button" onClick={() => setDetailId(a.id)} className="font-semibold text-slate-900 hover:text-emerald-700">
                              {a.assetCode}
                            </button>
                            <p className="truncate text-xs text-slate-500">{a.name} · {T.label}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {a.plant ? (
                          <Link to={`/plants/${refId(a.plant)}`} className="hover:text-emerald-700 hover:underline">{a.plant.plantName}</Link>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{powerParts(a.capacity).text}</td>
                      <td className="px-3 py-3 text-slate-600">{a.installationDate ? new Date(a.installationDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '–'}</td>
                      <td className="px-3 py-3"><Pill tone={off ? OFF_TONE : ACTIVE_TONE}>{a.status}</Pill></td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDetailId(a.id)} aria-label={`View ${a.assetCode}`} title="View details">
                            <Eye className="size-3.5" />
                          </Button>
                          {canWrite && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setForm({ asset: a })} aria-label={`Edit ${a.assetCode}`} title="Edit">
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setMaintenanceAsset(a)} aria-label={`Schedule maintenance for ${a.assetCode}`} title="Schedule maintenance">
                                <Wrench className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setStatusAsset(a)} aria-label={`${off ? 'Activate' : 'Deactivate'} ${a.assetCode}`} title={off ? 'Activate' : 'Deactivate'}>
                                {off ? <Power className="size-3.5" /> : <PowerOff className="size-3.5" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteAsset(a)} aria-label={`Delete ${a.assetCode}`} title="Delete">
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {data?.total > 0 && (
          <div className="border-t border-slate-100 px-5 py-3">
            <Pagination page={data.page} pages={data.pages} total={data.total} limit={PAGE_SIZE} onChange={(p) => update({ page: String(p) })} />
          </div>
        )}
      </div>

      {detailId && (
        <AssetDetailDrawer
          assetId={detailId}
          version={version}
          canWrite={canWrite}
          onClose={() => setDetailId(null)}
          onEdit={fromDrawer((a) => setForm({ asset: a }))}
          onStatus={fromDrawer(setStatusAsset)}
          onMaintenance={fromDrawer(setMaintenanceAsset)}
          onDelete={fromDrawer(setDeleteAsset)}
        />
      )}
      {form && (
        <AssetFormModal
          asset={form.asset}
          defaultPlant={plant}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            changed()
          }}
        />
      )}
      {statusAsset && (
        <AssetStatusModal
          key={statusAsset.id}
          asset={statusAsset}
          onClose={() => setStatusAsset(null)}
          onChanged={() => {
            setStatusAsset(null)
            changed()
          }}
        />
      )}
      {maintenanceAsset && (
        <WorkOrderFormModal presetAsset={maintenanceAsset} onClose={() => setMaintenanceAsset(null)} onSaved={() => setMaintenanceAsset(null)} />
      )}
      {deleteAsset && (
        <ConfirmDialog title={`Delete ${deleteAsset.assetCode}?`} tone="danger" icon={Trash2} confirmLabel="Delete asset" onConfirm={remove} onClose={() => setDeleteAsset(null)}>
          <p>
            <span className="font-semibold text-slate-900">{deleteAsset.name}</span> and its alerts will be removed permanently.
          </p>
          <p>An asset that already has telemetry history can&apos;t be deleted. Deactivate it instead to keep its records.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

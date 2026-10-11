import { ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, Factory, Radio, RefreshCw, Sun, Upload } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { telemetryApi } from '@/api/analytics'
import { assetsApi } from '@/api/plants'
import RoleGate from '@/components/auth/RoleGate'
import CsvUploadModal from '@/components/telemetry/CsvUploadModal'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import Pagination from '@/components/ui/Pagination'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { ASSET_TYPES, OPERATING_STATUS_BADGE } from '@/constants/assets'
import { useAsync, usePolling } from '@/hooks/useAsync'
import { usePlantOptions } from '@/hooks/usePlantOptions'
import { formatNumber } from '@/utils/format'

const PAGE_SIZE = 50
const LIVE_MS = 10_000
const STATUSES = ['Normal', 'Degraded', 'Fault', 'Offline']
const RANGES = [
  { value: '1h', label: 'Last hour', ms: 3_600_000 },
  { value: '6h', label: 'Last 6 hours', ms: 6 * 3_600_000 },
  { value: '24h', label: 'Last 24 hours', ms: 86_400_000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 86_400_000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 86_400_000 },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom…' },
]
const DEFAULTS = { plant: '', asset: '', status: '', source: '', range: '24h', from: '', to: '', sortBy: 'timestamp', sort: 'desc', page: '1' }

const n = (v, d = 1) => (v == null ? <span className="text-slate-300">–</span> : formatNumber(v, d))

/** Columns; `sort` marks server-sortable ones. */
const COLUMNS = [
  { key: 'timestamp', label: 'Time', sort: true },
  { key: 'asset', label: 'Asset' },
  { key: 'powerOutput', label: 'Power kW', sort: true, align: 'right' },
  { key: 'expectedPower', label: 'Expected kW', sort: true, align: 'right' },
  { key: 'efficiency', label: 'Efficiency %', sort: true, align: 'right' },
  { key: 'cumulativeEnergy', label: 'Energy kWh', sort: true, align: 'right', title: 'Running energy total for the asset' },
  { key: 'temperature', label: 'Temp °C', sort: true, align: 'right' },
  { key: 'conditions', label: 'Conditions' },
  { key: 'operatingStatus', label: 'Status' },
  { key: 'source', label: 'Source' },
]

const inputCls =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15'

function conditions(r) {
  const parts = []
  if (r.irradiance != null) parts.push(`${formatNumber(r.irradiance, 0)} W/m²`)
  if (r.windSpeed != null) parts.push(`${formatNumber(r.windSpeed, 1)} m/s`)
  if (r.rotorSpeed != null) parts.push(`${formatNumber(r.rotorSpeed, 1)} rpm`)
  if (r.stateOfCharge != null) parts.push(`${formatNumber(r.stateOfCharge, 0)}% SoC`)
  return parts.length ? parts.join(' · ') : <span className="text-slate-300">–</span>
}

export default function TelemetryPage() {
  const plants = usePlantOptions()
  const [params, setParams] = useSearchParams()
  const f = useMemo(() => ({ ...DEFAULTS, ...Object.fromEntries(params) }), [params])
  const [now, setNow] = useState(() => Date.now())
  const [live, setLive] = useState(false)
  const [uploading, setUploading] = useState(false)

  const update = (patch) => {
    const next = { ...f, ...patch, ...(!('page' in patch) && { page: '1' }) }
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && v !== DEFAULTS[k])), { replace: true })
  }

  const assetOptions = useAsync(() => assetsApi.list(f.plant ? { plant: f.plant } : {}), [f.plant])
  const statuses = f.status ? f.status.split(',') : []

  // Resolve the time window against a `now` that only moves on refresh
  const preset = RANGES.find((r) => r.value === f.range)
  let from
  let to
  if (f.range === 'custom') {
    from = f.from ? new Date(f.from).toISOString() : undefined
    to = f.to ? new Date(f.to).toISOString() : undefined
  } else if (preset?.ms) {
    from = new Date(now - preset.ms).toISOString()
  }

  const query = {
    plant: f.plant || undefined,
    asset: f.asset || undefined,
    status: f.status || undefined,
    source: f.source || undefined,
    from,
    to,
    sortBy: f.sortBy,
    sort: f.sort,
    page: Number(f.page) || 1,
    limit: PAGE_SIZE,
  }
  const list = useAsync(() => telemetryApi.list(query), [query])
  const refresh = useCallback(() => setNow(Date.now()), [])
  usePolling(refresh, LIVE_MS, { enabled: live })

  const toggleStatus = (s) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s]
    update({ status: next.join(',') })
  }
  const sortBy = (key) => update(f.sortBy === key ? { sort: f.sort === 'desc' ? 'asc' : 'desc' } : { sortBy: key, sort: 'desc' })

  const rows = list.data?.data ?? []
  const filtersActive = Boolean(f.plant || f.asset || f.status || f.source || f.range !== DEFAULTS.range)

  return (
    <div>
      <PageHeader
        title="Telemetry studio"
        description="Raw readings with derived expected power, efficiency and running energy."
        actions={
          <>
            <Button variant={live ? 'primary' : 'secondary'} onClick={() => setLive((l) => !l)} aria-pressed={live}>
              <Radio className={`size-4 ${live ? 'animate-pulse' : ''}`} /> {live ? 'Live' : 'Go live'}
            </Button>
            <Button variant="secondary" onClick={refresh} aria-label="Refresh" className="px-3">
              <RefreshCw className={`size-4 ${list.stale ? 'animate-spin' : ''}`} />
            </Button>
            <RoleGate permission="telemetry:ingest">
              <Button onClick={() => setUploading(true)}>
                <Upload className="size-4" /> Upload CSV
              </Button>
            </RoleGate>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Plant"
            hideLabel
            icon={Factory}
            value={f.plant}
            onChange={(e) => update({ plant: e.target.value, asset: '' })}
            options={[{ value: '', label: 'All plants' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]}
          />
          <Select
            label="Asset"
            hideLabel
            icon={Sun}
            value={f.asset}
            onChange={(e) => update({ asset: e.target.value })}
            options={[
              { value: '', label: f.plant ? 'All assets in plant' : 'All assets' },
              ...(assetOptions.data ?? []).map((a) => ({ value: a.id, label: `${a.assetCode} · ${ASSET_TYPES[a.sourceType]?.label ?? a.sourceType}` })),
            ]}
          />
          <Select
            label="Time range"
            hideLabel
            icon={CalendarRange}
            value={f.range}
            onChange={(e) => update({ range: e.target.value })}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
          <Select
            label="Source"
            hideLabel
            value={f.source}
            onChange={(e) => update({ source: e.target.value })}
            options={[
              { value: '', label: 'All sources' },
              { value: 'simulator', label: 'Simulator' },
              { value: 'csv', label: 'CSV upload' },
              { value: 'api', label: 'API' },
              { value: 'manual', label: 'Manual' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {f.range === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="t-from">From</label>
              <input id="t-from" type="datetime-local" className={inputCls} value={f.from} onChange={(e) => update({ from: e.target.value })} />
              <span className="text-sm text-slate-400">to</span>
              <label className="sr-only" htmlFor="t-to">To</label>
              <input id="t-to" type="datetime-local" className={inputCls} value={f.to} onChange={(e) => update({ to: e.target.value })} />
            </div>
          )}
          <span className="text-xs font-medium text-slate-500">Status</span>
          {STATUSES.map((s) => {
            const on = statuses.includes(s)
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            )
          })}
          {filtersActive && (
            <button type="button" onClick={() => setParams({}, { replace: true })} className="ml-auto text-xs font-semibold text-emerald-700 hover:underline">
              Reset filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {list.initialLoading ? (
          <LoadingState label="Loading readings…" />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : !rows.length ? (
          <EmptyState title="No readings match these filters">Try a wider time range, or upload a CSV / start the simulator.</EmptyState>
        ) : (
          <div className={`max-h-[65vh] overflow-auto transition-opacity ${list.stale ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-medium text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  {COLUMNS.map((c) => {
                    const active = f.sortBy === c.key
                    const Icon = !active ? ArrowUpDown : f.sort === 'asc' ? ArrowUp : ArrowDown
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        title={c.title}
                        aria-sort={active ? (f.sort === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={`whitespace-nowrap px-3 py-2.5 first:pl-5 last:pr-5 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        {c.sort ? (
                          <button
                            type="button"
                            onClick={() => sortBy(c.key)}
                            className={`inline-flex items-center gap-1 hover:text-slate-800 ${active ? 'text-slate-900' : ''} ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                          >
                            {c.label}
                            <Icon className={`size-3.5 ${active ? '' : 'opacity-40'}`} aria-hidden="true" />
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {rows.map((r) => {
                  const T = ASSET_TYPES[r.asset?.sourceType]
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-2 pl-5 text-slate-700">
                        {new Date(r.timestamp).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          {T && <T.icon className="size-4 text-slate-400" aria-label={T.label} />}
                          <span className="font-medium text-slate-900">{r.asset?.assetCode ?? 'Deleted asset'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">{n(r.powerOutput, 2)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{n(r.expectedPower, 2)}</td>
                      <td className="px-3 py-2 text-right">
                        {r.efficiency == null ? (
                          n(null)
                        ) : (
                          <span className={r.efficiency < 40 ? 'font-semibold text-red-600' : 'text-slate-700'}>{formatNumber(r.efficiency, 1)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{n(r.cumulativeEnergy, 2)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{n(r.temperature, 1)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{conditions(r)}</td>
                      <td className="px-3 py-2">
                        <Pill tone={OPERATING_STATUS_BADGE[r.operatingStatus]}>{r.operatingStatus}</Pill>
                      </td>
                      <td className="px-3 py-2 pr-5 text-xs capitalize text-slate-500">{r.source}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {list.data && (
        <div className="mt-4">
          <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} limit={PAGE_SIZE} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}

      {uploading && <CsvUploadModal onClose={() => setUploading(false)} onUploaded={refresh} />}
    </div>
  )
}

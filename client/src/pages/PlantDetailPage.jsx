import { BellRing, ExternalLink, MapPin, Pencil, Power, PowerOff, RefreshCw, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { GENERATING_TYPES, telemetryApi } from '@/api/analytics'
import { plantsApi } from '@/api/plants'
import RoleGate from '@/components/auth/RoleGate'
import AssetStatusModal from '@/components/plants/AssetStatusModal'
import PlantFormModal from '@/components/plants/PlantFormModal'
import Button from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { ASSET_TYPES, LIVE_WINDOW_MS, OPERATING_STATUS_BADGE, PLANT_STATUS_BADGE } from '@/constants/assets'
import { useBreadcrumbLabel } from '@/context/breadcrumbContext'
import { useAsync, usePolling } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime, formatNumber, powerParts, timeAgo } from '@/utils/format'

const REFRESH_MS = 30_000

function Spec({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  )
}

/** Type-specific live metric for the snapshot table. */
function contextMetric(type, r) {
  if (!r) return null
  switch (type) {
    case 'SolarPanel':
      return r.irradiance != null ? `${formatNumber(r.irradiance, 0)} W/m²` : null
    case 'WindTurbine':
      return r.windSpeed != null ? `${formatNumber(r.windSpeed, 1)} m/s wind` : null
    case 'BatteryStorage':
      return r.stateOfCharge != null ? `${formatNumber(r.stateOfCharge, 0)}% SoC` : null
    default:
      return null
  }
}

function OutputCell({ asset, reading }) {
  if (!reading) return <span className="text-slate-400">No data</span>
  const kw = reading.powerOutput
  const share = asset.capacity ? Math.min(100, (Math.abs(kw) / asset.capacity) * 100) : 0
  const charging = asset.sourceType === 'BatteryStorage' && kw < 0
  return (
    <div className="min-w-28">
      <p className="font-medium tabular-nums text-slate-900">
        {powerParts(Math.abs(kw)).text}
        {charging && <span className="ml-1 text-xs font-normal text-slate-500">charging</span>}
      </p>
      <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-100" title={`${formatNumber(share, 0)}% of capacity`}>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
      </div>
    </div>
  )
}

export default function PlantDetailPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const { can } = useAuth()
  const [typeFilter, setTypeFilter] = useState('')
  const [editing, setEditing] = useState(false)
  const [statusAsset, setStatusAsset] = useState(null)

  const plant = useAsync(() => plantsApi.get(id), [id])
  const latest = useAsync(() => telemetryApi.latest(id), [id])
  // "Live" is judged against a clock that advances with each refresh
  const [now, setNow] = useState(() => Date.now())
  const refresh = () => {
    plant.reload()
    latest.reload()
    setNow(Date.now())
  }
  usePolling(refresh, REFRESH_MS)
  useBreadcrumbLabel(pathname, plant.data?.plantName)

  const readings = useMemo(() => new Map((latest.data ?? []).map((row) => [row.asset.id, row.reading])), [latest.data])

  if (plant.initialLoading) return <LoadingState label="Loading plant…" />
  if (plant.error && !plant.data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <ErrorState error={plant.error} onRetry={plant.reload} />
      </div>
    )
  }

  const p = plant.data
  const assets = p.assets
  const isLive = (r) => r && now - new Date(r.timestamp).getTime() < LIVE_WINDOW_MS
  const liveGen = assets
    .filter((a) => GENERATING_TYPES.includes(a.sourceType) && a.status === 'Active' && isLive(readings.get(a.id)))
    .reduce((s, a) => s + Math.max(0, readings.get(a.id).powerOutput), 0)
  const reporting = assets.filter((a) => isLive(readings.get(a.id))).length
  const installed = assets.filter((a) => GENERATING_TYPES.includes(a.sourceType)).reduce((s, a) => s + a.capacity, 0)
  const typeCounts = assets.reduce((m, a) => ({ ...m, [a.sourceType]: (m[a.sourceType] || 0) + 1 }), {})
  const shown = typeFilter ? assets.filter((a) => a.sourceType === typeFilter) : assets
  const { latitude: lat, longitude: lon, address } = p.location || {}
  const hasCoords = lat != null && lon != null
  const d = 0.02
  const mapSrc = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`
    : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{p.plantName}</h1>
            <Pill tone={PLANT_STATUS_BADGE[p.status]}>{p.status}</Pill>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
            <MapPin className="size-4 text-slate-400" aria-hidden="true" />
            {address || 'No address set'} · {p.plantType} plant
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={refresh}
            aria-label="Refresh"
            className="px-3"
          >
            <RefreshCw className={`size-4 ${plant.stale || latest.stale ? 'animate-spin' : ''}`} />
          </Button>
          <RoleGate permission="plants:write">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit plant
            </Button>
          </RoleGate>
        </div>
      </div>

      {/* Live strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <Zap className="size-4 text-emerald-600" aria-hidden="true" /> Live generation
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{powerParts(liveGen).text}</p>
          <p className="text-xs text-slate-500">
            {installed ? `${formatNumber((liveGen / installed) * 100, 0)}% of ${powerParts(installed).text} generating capacity` : 'No generating assets'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-sm text-slate-500">Assets reporting</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {reporting}
            <span className="text-base font-medium text-slate-500"> / {assets.length}</span>
          </p>
          <p className="text-xs text-slate-500">Readings in the last 15 minutes</p>
        </div>
        <Link
          to={`/alerts?plant=${p.id}`}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300"
        >
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <BellRing className={`size-4 ${p.openAlerts ? 'text-red-500' : 'text-slate-400'}`} aria-hidden="true" /> Open alerts
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{p.openAlerts}</p>
          <p className="text-xs font-medium text-emerald-700">View in alert centre →</p>
        </Link>
      </div>

      {/* Spec + map */}
      <div className="grid gap-5 lg:grid-cols-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Specification</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Spec label="Plant type">{p.plantType}</Spec>
            <Spec label="Status">{p.status}</Spec>
            <Spec label="Rated capacity">{powerParts(p.capacity).text}</Spec>
            <Spec label="Generating assets">{powerParts(installed).text}</Spec>
            <Spec label="Latitude">{lat != null ? formatNumber(lat, 5) : '–'}</Spec>
            <Spec label="Longitude">{lon != null ? formatNumber(lon, 5) : '–'}</Spec>
            <Spec label="Registered">{formatDateTime(p.createdAt, { year: 'numeric', hour: undefined, minute: undefined })}</Spec>
            <Spec label="Assets">{assets.length}</Spec>
          </dl>
          {assets.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {Object.entries(typeCounts).map(([type, n]) => {
                const T = ASSET_TYPES[type]
                return (
                  <span key={type} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${T.tone}`}>
                    <T.icon className="size-3.5" aria-hidden="true" /> {n} {T.label.toLowerCase()}
                    {n > 1 ? 's' : ''}
                  </span>
                )
              })}
            </div>
          )}
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs lg:col-span-3">
          {mapSrc ? (
            <div className="flex h-full min-h-64 flex-col">
              <iframe title={`Map of ${p.plantName}`} src={mapSrc} className="w-full flex-1 border-0" loading="lazy" />
              <a
                href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-end gap-1 border-t border-slate-100 px-4 py-2 text-xs font-medium text-emerald-700 hover:underline"
              >
                Open in OpenStreetMap <ExternalLink className="size-3.5" />
              </a>
            </div>
          ) : (
            <EmptyState icon={MapPin} title="No coordinates" className="h-full">
              Add latitude and longitude to show this plant on a map.
            </EmptyState>
          )}
        </section>
      </div>

      {/* Assets */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Assets & live telemetry</h2>
            <p className="text-sm text-slate-500">Latest reading per asset · refreshes every 30 s</p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by asset type">
            {['', ...Object.keys(typeCounts)].map((t) => (
              <button
                key={t || 'all'}
                type="button"
                onClick={() => setTypeFilter(t)}
                aria-pressed={typeFilter === t}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  typeFilter === t ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {t ? ASSET_TYPES[t].label : `All (${assets.length})`}
              </button>
            ))}
          </div>
        </div>

        {!assets.length ? (
          <EmptyState title="No assets in this plant yet">Assets registered to this plant will appear here with live readings.</EmptyState>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${latest.stale ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Asset</th>
                  <th className="px-3 py-2.5">Output</th>
                  <th className="px-3 py-2.5 text-right">Temp</th>
                  <th className="px-3 py-2.5">Conditions</th>
                  <th className="px-3 py-2.5 text-right">Efficiency</th>
                  <th className="px-3 py-2.5">Operating</th>
                  <th className="px-3 py-2.5">Last reading</th>
                  <th className="px-3 py-2.5">Status</th>
                  {can('assets:write') && <th className="px-5 py-2.5 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((a) => {
                  const T = ASSET_TYPES[a.sourceType]
                  const r = readings.get(a.id)
                  const live = isLive(r)
                  const deactivated = a.status !== 'Active'
                  return (
                    <tr key={a.id} className={deactivated ? 'bg-slate-50/60 text-slate-500' : ''}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${T.tone}`} title={T.label}>
                            <T.icon className="size-[18px]" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{a.assetCode}</p>
                            <p className="truncate text-xs text-slate-500">
                              {a.name} · {powerParts(a.capacity).text}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <OutputCell asset={a} reading={r} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r?.temperature != null ? `${formatNumber(r.temperature, 1)}°C` : '–'}</td>
                      <td className="px-3 py-3 text-slate-600">{contextMetric(a.sourceType, r) ?? '–'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r?.efficiency != null ? `${formatNumber(r.efficiency, 1)}%` : '–'}</td>
                      <td className="px-3 py-3">
                        {r ? <Pill tone={OPERATING_STATUS_BADGE[r.operatingStatus]}>{r.operatingStatus}</Pill> : '–'}
                      </td>
                      <td className="px-3 py-3">
                        {r ? (
                          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs" title={formatDateTime(r.timestamp, { second: '2-digit' })}>
                            <span className={`size-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                            {timeAgo(r.timestamp)}
                            {!live && <span className="text-slate-400">(stale)</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Never</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={deactivated ? 'bg-slate-100 text-slate-600 ring-slate-500/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'}>
                          {a.status}
                        </Pill>
                      </td>
                      {can('assets:write') && (
                        <td className="px-5 py-3 text-right">
                          <Button variant={deactivated ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatusAsset(a)}>
                            {deactivated ? <Power className="size-3.5" /> : <PowerOff className="size-3.5" />}
                            {deactivated ? 'Activate' : 'Deactivate'}
                          </Button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <PlantFormModal
          open
          plant={p}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            plant.reload()
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
            refresh()
          }}
        />
      )}
    </div>
  )
}

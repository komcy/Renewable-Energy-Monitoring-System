import { Factory, Pencil, Power, PowerOff, Trash2, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { alertsApi } from '@/api/alerts'
import { assetsApi } from '@/api/plants'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import { SeverityBadge } from '@/components/ui/Badges'
import { ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { ASSET_TYPES, OPERATING_STATUS_BADGE } from '@/constants/assets'
import { alertTypeInfo } from '@/constants/alerts'
import { ASSET_SPEC_FIELDS, refId, thresholdsFor } from '@/constants/assetForm'
import { useAsync } from '@/hooks/useAsync'
import { formatNumber, powerParts, timeAgo } from '@/utils/format'

function Section({ title, children }) {
  return (
    <section className="border-b border-slate-100 px-5 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

function Rows({ items }) {
  const shown = items.filter(([, v]) => v != null && v !== '')
  if (!shown.length) return <p className="mt-2 text-sm text-slate-500">Nothing set.</p>
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Read-only asset profile. Action buttons appear for users who can write assets. */
export default function AssetDetailDrawer({ assetId, version, canWrite, onClose, onEdit, onStatus, onMaintenance, onDelete }) {
  const asset = useAsync(() => assetsApi.get(assetId), [assetId, version])
  const alerts = useAsync(() => alertsApi.list({ asset: assetId, status: 'Active,Acknowledged', limit: 5 }), [assetId, version])
  const a = asset.data
  const T = a && ASSET_TYPES[a.sourceType]
  const spec = a && ASSET_SPEC_FIELDS[a.sourceType]
  const r = a?.latestReading
  const deactivated = a?.status !== 'Active'
  const withUnit = (v, unit) => (v == null || v === '' ? null : `${typeof v === 'number' ? formatNumber(v, 2) : v}${unit ? ` ${unit}` : ''}`)

  return (
    <Drawer
      open
      onClose={onClose}
      title={a ? a.assetCode : 'Asset'}
      description={a?.name}
      footer={
        a &&
        canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onEdit(a)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onMaintenance(a)}>
              <Wrench className="size-3.5" /> Schedule maintenance
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onStatus(a)}>
              {deactivated ? <Power className="size-3.5" /> : <PowerOff className="size-3.5" />}
              {deactivated ? 'Activate' : 'Deactivate'}
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(a)}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        )
      }
    >
      {asset.initialLoading ? (
        <LoadingState label="Loading asset…" />
      ) : asset.error && !a ? (
        <ErrorState error={asset.error} onRetry={asset.reload} />
      ) : (
        a && (
          <>
            <Section title="Overview">
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${T.tone}`}>
                  <T.icon className="size-3.5" aria-hidden="true" /> {T.label}
                </span>
                <Pill tone={deactivated ? 'bg-slate-100 text-slate-600 ring-slate-500/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'}>{a.status}</Pill>
              </div>
              <Rows
                items={[
                  ['Plant', a.plant && <Link key="p" to={`/plants/${refId(a.plant)}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline"><Factory className="size-3.5" aria-hidden="true" />{a.plant.plantName}</Link>],
                  ['Rated capacity', powerParts(a.capacity).text],
                  ['Location', a.location],
                  ['Installed', a.installationDate && new Date(a.installationDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })],
                  ['Health index', a.healthIndex != null ? `${formatNumber(a.healthIndex, 0)} / 100` : null],
                ]}
              />
              <Link to={`/diagnostics?asset=${a.id}`} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">
                View health diagnostics
              </Link>
            </Section>

            <Section title="Latest reading">
              {r ? (
                <>
                  <Rows
                    items={[
                      ['Output', withUnit(r.powerOutput, 'kW')],
                      ['Temperature', withUnit(r.temperature, '°C')],
                      ['Efficiency', withUnit(r.efficiency, '%')],
                      ['Irradiance', withUnit(r.irradiance, 'W/m²')],
                      ['Wind speed', withUnit(r.windSpeed, 'm/s')],
                      ['State of charge', withUnit(r.stateOfCharge, '%')],
                    ]}
                  />
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    {r.operatingStatus && <Pill tone={OPERATING_STATUS_BADGE[r.operatingStatus]}>{r.operatingStatus}</Pill>}
                    {timeAgo(r.timestamp)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No telemetry received yet.</p>
              )}
            </Section>

            <Section title="Specifications">
              <Rows items={spec.fields.map((f) => [f.label, withUnit(a[spec.key]?.[f.name], f.unit)])} />
            </Section>

            <Section title="Alert thresholds">
              <Rows items={thresholdsFor(a.sourceType).map((t) => [t.label, withUnit(a.thresholds?.[t.name], t.unit)])} />
            </Section>

            <Section title={`Open alerts (${a.openAlerts ?? 0})`}>
              {alerts.initialLoading ? (
                <p className="mt-2 text-sm text-slate-500">Loading…</p>
              ) : !alerts.data?.data?.length ? (
                <p className="mt-2 text-sm text-slate-500">No open alerts.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {alerts.data.data.map((al) => (
                    <li key={al.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{alertTypeInfo(al.alertType).label}</span>
                        <SeverityBadge severity={al.severity} />
                        <span className="text-xs text-slate-500">{timeAgo(al.lastOccurredAt ?? al.timestamp)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-slate-600">{al.message}</p>
                    </li>
                  ))}
                </ul>
              )}
              {(a.openAlerts ?? 0) > 0 && (
                <Link to={`/alerts?plant=${refId(a.plant)}`} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">
                  View alerts for this plant
                </Link>
              )}
            </Section>
          </>
        )
      )}
    </Drawer>
  )
}

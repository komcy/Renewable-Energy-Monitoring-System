import { CircleCheck, Eye, Factory } from 'lucide-react'
import { Link } from 'react-router'
import { alertsApi } from '@/api/alerts'
import { SeverityBadge } from '@/components/ui/Badges'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { ALERT_STATUS_BADGE, alertTypeInfo } from '@/constants/alerts'
import { ASSET_TYPES } from '@/constants/assets'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime, formatNumber, powerParts, timeAgo } from '@/utils/format'

const UNITS = {
  OverTemperature: '°C',
  LowEfficiency: '%',
  OutputDrop: '% drop',
  ZeroGeneration: 'kW',
  HighWindSpeed: 'm/s',
  LowStateOfCharge: '%',
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children ?? '–'}</dd>
    </div>
  )
}

function TimelineItem({ title, time, children, done = true }) {
  return (
    <li className="relative pb-4 pl-6 last:pb-0">
      <span className={`absolute left-0 top-1.5 size-2.5 rounded-full ring-4 ring-white ${done ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {time && (
        <p className="text-xs text-slate-500">
          {formatDateTime(time, { year: 'numeric', second: '2-digit' })} · {timeAgo(time)}
        </p>
      )}
      {children}
    </li>
  )
}

/** Full alert context: cause, values, asset, reading snapshot and lifecycle. */
export default function AlertDetailModal({ alertId, version, onClose, onAcknowledge, onResolve, busy }) {
  const { can } = useAuth()
  const { data: a, error, initialLoading, reload } = useAsync(() => alertsApi.get(alertId), [alertId, version])
  const info = a ? alertTypeInfo(a.alertType) : null
  const unit = a ? UNITS[a.alertType] ?? '' : ''
  const r = a?.reading
  const T = a?.asset ? ASSET_TYPES[a.asset.sourceType] : null
  const canManage = can('alerts:manage')

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={info ? info.label : 'Alert details'}
      description={a ? `${a.asset?.assetCode ?? 'Unknown asset'} · ${a.plant?.plantName ?? 'Unknown plant'}` : undefined}
      footer={
        a && (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {canManage && a.status === 'Active' && (
              <Button variant="secondary" onClick={() => onAcknowledge(a)} loading={busy}>
                <Eye className="size-4" /> Acknowledge
              </Button>
            )}
            {canManage && a.status !== 'Resolved' && (
              <Button onClick={() => onResolve(a)}>
                <CircleCheck className="size-4" /> Resolve
              </Button>
            )}
          </>
        )
      }
    >
      {initialLoading ? (
        <LoadingState />
      ) : error && !a ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={a.severity} />
            <Pill tone={ALERT_STATUS_BADGE[a.status]}>{a.status}</Pill>
            <span className="text-xs text-slate-500">
              Detected {a.occurrenceCount} time{a.occurrenceCount === 1 ? '' : 's'}
            </span>
          </div>

          <section className="rounded-xl bg-slate-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Failure cause</h3>
            <p className="mt-1.5 text-sm text-slate-800">{info.cause(a) || a.message}</p>
            {info.cause(a) && <p className="mt-2 text-xs text-slate-500">Engine message: {a.message}</p>}
            {a.observedValue != null && (
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <dt className="text-xs text-slate-500">Observed</dt>
                  <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                    {formatNumber(a.observedValue, 1)} <span className="text-sm font-medium text-slate-500">{unit}</span>
                  </dd>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <dt className="text-xs text-slate-500">{a.alertType === 'ZeroGeneration' ? 'Expected' : 'Threshold'}</dt>
                  <dd className="mt-0.5 text-lg font-semibold text-slate-900">
                    {formatNumber(a.thresholdValue, 1)} <span className="text-sm font-medium text-slate-500">{unit}</span>
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Asset</h3>
              {a.asset ? (
                <div className="mt-2 flex items-center gap-3">
                  {T && (
                    <span className={`grid size-10 place-items-center rounded-lg ${T.tone}`}>
                      <T.icon className="size-5" aria-hidden="true" />
                    </span>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">{a.asset.assetCode}</p>
                    <p className="text-sm text-slate-500">
                      {a.asset.name} · {T?.label} · {powerParts(a.asset.capacity).text}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">This asset no longer exists.</p>
              )}
              {a.plant && (
                <Link
                  to={`/plants/${a.plant.id}`}
                  onClick={onClose}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
                >
                  <Factory className="size-4" /> {a.plant.plantName}
                </Link>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reading at detection</h3>
              {r ? (
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="Power output">{powerParts(r.powerOutput).text}</Field>
                  <Field label="Expected">{r.expectedPower != null ? powerParts(r.expectedPower).text : null}</Field>
                  <Field label="Efficiency">{r.efficiency != null ? `${formatNumber(r.efficiency, 1)}%` : null}</Field>
                  <Field label="Temperature">{r.temperature != null ? `${formatNumber(r.temperature, 1)}°C` : null}</Field>
                  {r.irradiance != null && <Field label="Irradiance">{formatNumber(r.irradiance, 0)} W/m²</Field>}
                  {r.windSpeed != null && <Field label="Wind speed">{formatNumber(r.windSpeed, 1)} m/s</Field>}
                  {r.stateOfCharge != null && <Field label="State of charge">{formatNumber(r.stateOfCharge, 0)}%</Field>}
                  <Field label="Status">{r.operatingStatus}</Field>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No reading attached.</p>
              )}
            </section>
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline</h3>
            <ol className="relative mt-3 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-slate-200">
              <TimelineItem title="First detected" time={a.timestamp} />
              {a.occurrenceCount > 1 && <TimelineItem title={`Last occurred (${a.occurrenceCount}×)`} time={a.lastOccurredAt} />}
              <TimelineItem
                title={a.acknowledgedAt ? `Acknowledged by ${a.acknowledgedBy?.name ?? 'unknown user'}` : 'Not acknowledged'}
                time={a.acknowledgedAt}
                done={Boolean(a.acknowledgedAt)}
              />
              <TimelineItem
                title={a.resolvedAt ? `Resolved by ${a.resolvedBy?.name ?? 'unknown user'}` : 'Not resolved'}
                time={a.resolvedAt}
                done={Boolean(a.resolvedAt)}
              >
                {a.resolutionNotes && (
                  <p className="mt-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{a.resolutionNotes}</p>
                )}
              </TimelineItem>
            </ol>
          </section>
        </div>
      )}
    </Modal>
  )
}

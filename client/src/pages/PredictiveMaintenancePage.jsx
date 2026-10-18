import { CloudSun, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { diagnosticsApi } from '@/api/diagnostics'
import { maintenanceApi } from '@/api/maintenance'
import StatusTransitionModal from '@/components/maintenance/StatusTransitionModal'
import Button from '@/components/ui/Button'
import { SeverityBadge } from '@/components/ui/Badges'
import PageHeader from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { alertTypeInfo } from '@/constants/alerts'
import { PRIORITY_BADGE, STATUS_META, TRANSITIONS, TRANSITION_LABELS } from '@/constants/maintenance'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime, formatNumber } from '@/utils/format'

const RISK_TONE = {
  High: 'bg-red-50 text-red-700 ring-red-600/20',
  Medium: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  Low: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}
const BAR = { High: 'bg-red-500', Medium: 'bg-amber-500', Low: 'bg-emerald-500' }

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 className="text-sm font-medium text-slate-500">{title}</h2>
      {children}
    </div>
  )
}

export default function PredictiveMaintenancePage() {
  const { can } = useAuth()
  const canManage = can('maintenance:manage')
  const [params, setParams] = useSearchParams()
  const assetId = params.get('asset') || ''
  const [version, setVersion] = useState(0)
  const [transition, setTransition] = useState(null)
  const [causeAlert, setCauseAlert] = useState(null)

  const fleet = useAsync(() => diagnosticsApi.fleet(), [version])
  // Operators open the page and the engine also schedules the task when risk is High (sequence steps 2-11)
  const diag = useAsync(() => (canManage ? diagnosticsApi.evaluate(assetId) : diagnosticsApi.get(assetId)), [assetId, canManage, version], { enabled: Boolean(assetId) })
  const root = useAsync(() => diagnosticsApi.rootCause(causeAlert), [causeAlert], { enabled: Boolean(causeAlert) })
  const orders = useAsync(() => maintenanceApi.list({ asset: assetId, limit: 10 }), [assetId, version], { enabled: Boolean(assetId) })

  const select = (id) => {
    setCauseAlert(null)
    setParams(id ? { asset: id } : {}, { replace: true })
  }
  const d = diag.data
  const w = d?.weather

  return (
    <div>
      <PageHeader title="Predictive maintenance" description="Health index, failure risk and recommended work for each asset, from the last 30 days of telemetry." />

      <div className="mb-5 max-w-md">
        <Select
          label="Asset"
          hideLabel
          value={assetId}
          onChange={(e) => select(e.target.value)}
          options={[{ value: '', label: 'Select an asset…' }, ...(fleet.data ?? []).map((a) => ({ value: a.id, label: `${a.assetCode} · ${a.name} · health ${formatNumber(a.healthIndex, 0)}` }))]}
        />
      </div>

      {!assetId ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          {fleet.initialLoading ? (
            <LoadingState label="Scoring assets…" />
          ) : fleet.error && !fleet.data ? (
            <ErrorState error={fleet.error} onRetry={fleet.reload} />
          ) : !fleet.data?.length ? (
            <EmptyState icon={Search} title="No active assets">Register assets and ingest telemetry to see their health.</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <caption className="px-5 py-3 text-left text-sm font-semibold text-slate-900">Fleet ranked by risk</caption>
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr><th className="px-5 py-2.5">Asset</th><th className="px-3 py-2.5">Plant</th><th className="px-3 py-2.5 text-right">Health</th><th className="px-5 py-2.5">Risk</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fleet.data.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-3"><button type="button" className="font-semibold text-slate-900 hover:text-emerald-700" onClick={() => select(a.id)}>{a.assetCode}</button><p className="text-xs text-slate-500">{a.name}</p></td>
                    <td className="px-3 py-3">{a.plantName}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatNumber(a.healthIndex, 0)} / 100</td>
                    <td className="px-5 py-3"><Pill tone={RISK_TONE[a.riskLevel]}>{a.riskLevel}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : diag.initialLoading ? (
        <LoadingState label="Evaluating asset health…" />
      ) : diag.error && !d ? (
        <ErrorState error={diag.error} onRetry={diag.reload} />
      ) : (
        d && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card title="Health index">
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{formatNumber(d.healthIndex, 0)}<span className="text-base font-medium text-slate-500"> / 100</span></p>
                <div className="mt-3 h-2 rounded-full bg-slate-100" role="img" aria-label={`Health index ${d.healthIndex} out of 100`}>
                  <div className={`h-2 rounded-full ${BAR[d.riskLevel]}`} style={{ width: `${d.healthIndex}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">{d.readingsAnalysed.toLocaleString()} readings · data quality {d.dataQuality.toLowerCase()}</p>
              </Card>
              <Card title="Failure probability">
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{Math.round(d.failureProbability * 100)}%</p>
                <p className="mt-3"><Pill tone={RISK_TONE[d.riskLevel]}>{d.riskLevel} risk</Pill></p>
              </Card>
              <Card title="Trend">
                <p className="mt-2 text-3xl font-bold text-slate-900">{d.trend}</p>
                <p className="mt-3 text-xs text-slate-500">Efficiency {d.efficiency == null ? 'n/a' : `${formatNumber(d.efficiency, 1)}%`} over 30 days</p>
              </Card>
              <Card title="Local weather">
                {w?.available ? (
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-xs text-slate-500">Temperature</dt><dd className="font-semibold">{w.temperature} °C</dd></div>
                    <div><dt className="text-xs text-slate-500">Wind</dt><dd className="font-semibold">{w.windSpeed} m/s</dd></div>
                    <div><dt className="text-xs text-slate-500">Cloud cover</dt><dd className="font-semibold">{w.cloudCover}%</dd></div>
                    <div><dt className="text-xs text-slate-500">Humidity</dt><dd className="font-semibold">{w.humidity}%</dd></div>
                  </dl>
                ) : (
                  <p className="mt-2 flex items-start gap-2 text-sm text-slate-600"><CloudSun className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{w?.reason}. Add latitude and longitude on the plant to enable it.</p>
                )}
              </Card>
            </div>

            <div role="status" className={`rounded-xl border px-5 py-4 text-sm ${d.scheduled.created || d.hasOpenPredictiveTask ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}>
              {d.scheduled.created ? (
                <>High failure risk: <strong>{d.scheduled.task.workOrderNumber}</strong> was scheduled automatically for {formatDateTime(d.scheduled.task.scheduledDate)} ({d.scheduled.task.priority} priority).</>
              ) : d.hasOpenPredictiveTask ? (
                <>A predictive work order is already open for this asset (see below).</>
              ) : d.recommendation.schedule ? (
                <>High failure risk. An Admin or Operator opening this page schedules the recommended work order.</>
              ) : (
                <>{d.recommendation.action}</>
              )}
              {d.notes.map((n) => <p key={n} className="mt-1 text-xs opacity-80">{n}</p>)}
            </div>

            <Card title="What is driving this score">
              {d.factors.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No penalties: efficiency, faults, alerts and temperature are all within healthy ranges.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {d.factors.map((f) => (
                    <li key={f.key}>
                      <div className="flex justify-between text-sm"><span className="font-medium text-slate-900">{f.label}</span><span className="tabular-nums text-slate-500">−{f.penalty} pts</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-slate-500" style={{ width: `${Math.min(100, f.penalty * 4)}%` }} /></div>
                      <p className="mt-1 text-xs text-slate-500">{f.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`Open alerts (${d.openAlerts.length})`}>
              {d.openAlerts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No open alerts for this asset.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {d.openAlerts.map((al) => (
                    <li key={al.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="flex items-center gap-2"><SeverityBadge severity={al.severity} /><span className="font-medium text-slate-900">{alertTypeInfo(al.alertType).label}</span></span>
                      <Button size="sm" variant="secondary" onClick={() => setCauseAlert(al.id)}>Inspect root cause</Button>
                    </li>
                  ))}
                </ul>
              )}
              {causeAlert && (
                <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm" aria-live="polite">
                  {root.initialLoading ? 'Analysing…' : root.error && !root.data ? <ErrorState error={root.error} onRetry={root.reload} /> : root.data && (
                    <>
                      <p className="font-semibold text-slate-900">Probable causes <span className="font-normal text-slate-500">({root.data.context.readings} readings within ±3 h; {root.data.similarAlerts30d} similar alert(s) in 30 days)</span></p>
                      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                        {root.data.probableCauses.map((c) => <li key={c.cause}><strong>{c.cause}</strong> <Pill tone={RISK_TONE[c.likelihood === 'High' ? 'High' : c.likelihood === 'Medium' ? 'Medium' : 'Low']}>{c.likelihood}</Pill><br /><span className="text-slate-600">{c.evidence}</span></li>)}
                      </ol>
                    </>
                  )}
                </div>
              )}
            </Card>

            <Card title="Work orders for this asset">
              {!orders.data?.data?.length ? (
                <p className="mt-2 text-sm text-slate-600">None yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-xs font-medium text-slate-500"><tr><th className="py-2">Order</th><th className="py-2">Priority</th><th className="py-2">Scheduled</th><th className="py-2">Status</th><th className="py-2 text-right">Update status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.data.data.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2.5"><Link to="/maintenance" className="font-semibold text-slate-900 hover:text-emerald-700">{t.workOrderNumber}</Link><p className="text-xs text-slate-500">{t.title}</p></td>
                          <td className="py-2.5"><Pill tone={PRIORITY_BADGE[t.priority]}>{t.priority}</Pill></td>
                          <td className="py-2.5">{formatDateTime(t.scheduledDate)}</td>
                          <td className="py-2.5"><Pill tone={STATUS_META[t.status].badge}>{t.status}</Pill></td>
                          <td className="py-2.5 text-right">{canManage && <div className="flex justify-end gap-1">{TRANSITIONS[t.status].map((next) => <Button key={next} size="sm" variant="secondary" onClick={() => setTransition({ workOrder: t, target: next })}>{TRANSITION_LABELS[next]}</Button>)}</div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )
      )}

      {transition && (
        <StatusTransitionModal workOrder={transition.workOrder} target={transition.target} onClose={() => setTransition(null)} onDone={() => { setTransition(null); setVersion((v) => v + 1) }} />
      )}
    </div>
  )
}

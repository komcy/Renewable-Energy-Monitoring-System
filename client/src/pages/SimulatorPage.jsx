import { Activity, BellRing, Clock, FlaskConical, Play, Square, Syringe, Timer, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router'
import { getErrorMessage } from '@/api/client'
import { assetsApi } from '@/api/plants'
import { simulatorApi } from '@/api/simulator'
import { SeverityBadge } from '@/components/ui/Badges'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import PageHeader from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { alertTypeInfo } from '@/constants/alerts'
import { ASSET_TYPES } from '@/constants/assets'
import { useAlerts } from '@/hooks/useAlerts'
import { useAsync, usePolling } from '@/hooks/useAsync'
import { usePlantOptions } from '@/hooks/usePlantOptions'
import { formatDateTime, formatNumber, timeAgo } from '@/utils/format'

const ANOMALY_LABELS = {
  thermalSpike: 'Thermal spike',
  efficiencyLoss: 'Sudden drop (efficiency loss)',
  zeroOutput: 'Zero generation',
  deepDischarge: 'Deep discharge',
  highWind: 'High wind',
  fault: 'Device fault',
  offline: 'Offline',
}
const DEFAULT_CONFIG = { intervalSeconds: '5', timeScale: '60', startHour: '', durationMinutes: '15', anomalyRate: '0', plant: '' }

const hhmm = (hour) => {
  if (hour == null) return '–'
  const h = Math.floor(hour)
  const m = Math.floor((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function Metric({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Icon className="size-3.5" aria-hidden="true" /> {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

/** Ticks once per second while `active`, for countdowns. */
function useClock(active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

const numberError = (value, min, max, label, optional = false) => {
  if (value === '' && optional) return ''
  const v = Number(value)
  if (value === '' || !Number.isFinite(v)) return `${label} is required`
  if (v < min || v > max) return `Between ${min} and ${max}`
  return ''
}

export default function SimulatorPage() {
  const plants = usePlantOptions()
  const { refresh: refreshAlerts } = useAlerts()
  const status = useAsync(() => simulatorApi.status(), [])
  const s = status.data
  const running = Boolean(s?.running)
  usePolling(status.reload, running ? 2000 : 10_000)
  const now = useClock(running)

  // Push new simulated alerts to the navbar ticker/bell straight away
  const lastAlertCount = useRef(null)
  useEffect(() => {
    const count = s?.stats?.alertsCreated
    if (count == null) return
    if (lastAlertCount.current != null && count > lastAlertCount.current) refreshAlerts()
    lastAlertCount.current = count
  }, [s?.stats?.alertsCreated, refreshAlerts])

  // ----- configuration
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [busy, setBusy] = useState(false)
  const errors = {
    intervalSeconds: numberError(config.intervalSeconds, 1, 3600, 'Interval'),
    timeScale: numberError(config.timeScale, 1, 1440, 'Time scale'),
    startHour: numberError(config.startHour, 0, 23.99, 'Start hour', true),
    durationMinutes: numberError(config.durationMinutes, 0, 1440, 'Duration'),
    anomalyRate: numberError(config.anomalyRate, 0, 0.5, 'Anomaly rate'),
  }
  const bind = (k) => ({
    name: k,
    value: config[k],
    disabled: running || busy,
    error: errors[k],
    onChange: (e) => setConfig((c) => ({ ...c, [k]: e.target.value })),
  })

  const start = async () => {
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    try {
      const body = {
        intervalSeconds: Number(config.intervalSeconds),
        timeScale: Number(config.timeScale),
        durationMinutes: Number(config.durationMinutes),
        anomalyRate: Number(config.anomalyRate),
        ...(config.startHour !== '' && { startHour: Number(config.startHour) }),
        ...(config.plant && { plant: config.plant }),
      }
      await simulatorApi.start(body)
      toast.success('Simulator started')
      status.reload()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not start the simulator'))
    } finally {
      setBusy(false)
    }
  }
  const stop = async () => {
    setBusy(true)
    try {
      const res = await simulatorApi.stop()
      toast.success(res.message)
      status.reload()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not stop the simulator'))
    } finally {
      setBusy(false)
    }
  }

  // ----- anomaly console
  const simPlant = s?.config?.plant
  const assets = useAsync(() => assetsApi.list({ status: 'Active', ...(simPlant && { plant: simPlant }) }), [simPlant])
  const simulated = useMemo(() => {
    const codes = s?.config?.assetCodes
    return (assets.data ?? []).filter((a) => !codes?.length || codes.includes(a.assetCode))
  }, [assets.data, s?.config?.assetCodes])
  const [anomaly, setAnomaly] = useState({ assetCode: '', type: 'thermalSpike', ticks: '3' })
  const selectedAsset = simulated.find((a) => a.assetCode === anomaly.assetCode) ?? simulated[0]
  const applicable = Object.entries(s?.anomalyTypes ?? {})
    .filter(([, types]) => !selectedAsset || types.includes(selectedAsset.sourceType))
    .map(([t]) => t)
  const anomalyType = applicable.includes(anomaly.type) ? anomaly.type : applicable[0]
  const [injecting, setInjecting] = useState(false)

  const inject = async (e) => {
    e.preventDefault()
    if (!selectedAsset || !anomalyType) return
    setInjecting(true)
    try {
      const res = await simulatorApi.injectAnomaly({ assetCode: selectedAsset.assetCode, type: anomalyType, ticks: Number(anomaly.ticks) || 3 })
      toast.success(`${ANOMALY_LABELS[res.type] ?? res.type} queued on ${res.assetCode} for ${res.ticks} tick(s)`)
      if (res.note) toast(res.note, { icon: 'ℹ️', duration: 7000 })
      status.reload()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not inject the anomaly'))
    } finally {
      setInjecting(false)
    }
  }

  if (status.initialLoading) return <LoadingState label="Loading simulator status…" />
  if (status.error && !s) return <ErrorState error={status.error} onRetry={status.reload} />

  const nextIn = s?.nextTickAt ? Math.max(0, Math.ceil((new Date(s.nextTickAt).getTime() - now) / 1000)) : null
  const stopIn = s?.autoStopAt ? Math.max(0, Math.round((new Date(s.autoStopAt).getTime() - now) / 60000)) : null
  const plantName = (id) => plants.find((p) => p.id === id)?.plantName

  return (
    <div className="space-y-5">
      <PageHeader title="Simulator control deck" description="Generate realistic live telemetry and inject faults to exercise the alert engine." />

      {/* Status */}
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`grid size-11 place-items-center rounded-xl ${running ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-slate-400'}`}>
              <FlaskConical className="size-5" />
            </span>
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold">
                <span className={`size-2.5 rounded-full ${running ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} aria-hidden="true" />
                {running ? 'Running' : 'Stopped'}
              </p>
              <p className="text-sm text-slate-400">
                {running
                  ? `Every ${s.config.intervalSeconds}s at ${s.config.timeScale}× speed · ${s.config.plant ? plantName(s.config.plant) ?? 'one plant' : 'all plants'}`
                  : s?.stopReason
                    ? `Stopped ${timeAgo(s.stoppedAt)} (${s.stopReason})`
                    : 'Not started since the server last restarted'}
              </p>
            </div>
          </div>
          {running ? (
            <Button variant="danger" onClick={stop} loading={busy}>
              {!busy && <Square className="size-4" fill="currentColor" />} Stop simulator
            </Button>
          ) : (
            <Button onClick={start} loading={busy} disabled={Object.values(errors).some(Boolean)}>
              {!busy && <Play className="size-4" fill="currentColor" />} Start simulator
            </Button>
          )}
        </div>

        {s?.stats && (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric icon={Clock} label="Simulated local time" value={hhmm(s.simulatedLocalHour)} sub={s.config?.timezone} />
            <Metric
              icon={Timer}
              label="Next tick"
              value={running && nextIn != null ? `${nextIn}s` : '–'}
              sub={running && stopIn != null ? `Auto-stop in ${stopIn} min` : running ? 'No auto-stop' : undefined}
            />
            <Metric icon={Activity} label="Readings inserted" value={formatNumber(s.stats.readingsGenerated, 0)} sub={`${s.stats.ticks} ticks`} />
            <Metric
              icon={BellRing}
              label="Alerts raised"
              value={formatNumber(s.stats.alertsCreated, 0)}
              sub={`${s.stats.alertsUpdated} repeat detections`}
            />
          </div>
        )}
        {s?.lastError && <p className="mt-3 text-xs text-amber-300">Last issue: {s.lastError}</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Configuration */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="font-semibold text-slate-900">Configuration</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {running ? 'Stop the simulator to change these settings.' : 'Applied when you start the simulator.'}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label="Tick interval (seconds)" type="number" min="1" max="3600" hint="How often readings are generated" {...bind('intervalSeconds')} />
            <FormField label="Time scale (×)" type="number" min="1" max="1440" hint="60 = one real minute is one simulated hour" {...bind('timeScale')} />
            <FormField label="Simulated start hour" type="number" min="0" max="23" step="0.5" placeholder="Current time" hint="e.g. 6 to start at sunrise" {...bind('startHour')} />
            <FormField label="Auto-stop after (minutes)" type="number" min="0" max="1440" hint="0 = run until stopped" {...bind('durationMinutes')} />
            <FormField label="Random anomaly rate" type="number" min="0" max="0.5" step="0.01" hint="Chance per asset per tick (0–0.5)" {...bind('anomalyRate')} />
            <Select
              label="Plant"
              value={config.plant}
              disabled={running || busy}
              onChange={(e) => setConfig((c) => ({ ...c, plant: e.target.value }))}
              options={[{ value: '', label: 'All plants' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]}
            />
          </div>
        </section>

        {/* Anomaly console */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Syringe className="size-4 text-slate-400" aria-hidden="true" /> Anomaly injection
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">Queue a fault on one asset for the next few ticks and watch the alert engine react.</p>

          {!running ? (
            <EmptyState icon={Zap} title="Start the simulator to inject anomalies" className="py-8" />
          ) : !simulated.length ? (
            <EmptyState title="No active assets in this simulation" className="py-8" />
          ) : (
            <form onSubmit={inject} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Asset"
                  value={selectedAsset?.assetCode ?? ''}
                  onChange={(e) => setAnomaly((a) => ({ ...a, assetCode: e.target.value }))}
                  options={simulated.map((a) => ({ value: a.assetCode, label: `${a.assetCode} · ${ASSET_TYPES[a.sourceType]?.label}` }))}
                />
                <Select
                  label="Anomaly"
                  value={anomalyType ?? ''}
                  onChange={(e) => setAnomaly((a) => ({ ...a, type: e.target.value }))}
                  options={applicable.map((t) => ({ value: t, label: ANOMALY_LABELS[t] ?? t }))}
                />
              </div>
              <div className="flex items-end gap-3">
                <FormField
                  label="Duration (ticks)"
                  type="number"
                  min="1"
                  max="100"
                  className="w-40"
                  value={anomaly.ticks}
                  onChange={(e) => setAnomaly((a) => ({ ...a, ticks: e.target.value }))}
                />
                <Button type="submit" loading={injecting} className="mb-px">
                  {!injecting && <Syringe className="size-4" />} Inject anomaly
                </Button>
              </div>
              {s.pendingAnomalies?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Queued / in progress</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {s.pendingAnomalies.map((p) => (
                      <li key={`${p.assetCode}-${p.type}`} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                        {p.assetCode}: {ANOMALY_LABELS[p.type] ?? p.type} · {p.remainingTicks} left{p.random ? ' (random)' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Live alert feed */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Live alert feed</h2>
              <p className="text-sm text-slate-500">Alerts raised by simulated readings</p>
            </div>
            <Link to="/alerts" className="text-sm font-medium text-emerald-700 hover:underline">
              Alert centre →
            </Link>
          </div>
          {s?.recentAlerts?.length ? (
            <ul className="divide-y divide-slate-100" aria-live="polite">
              {s.recentAlerts.map((a, i) => (
                <li key={`${a.at}-${a.alertType}-${i}`} className="flex items-start gap-3 px-5 py-3">
                  <SeverityBadge severity={a.severity} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {alertTypeInfo(a.alertType).label} <span className="font-normal text-slate-500">· {a.assetCode}</span>
                    </p>
                    <p className="truncate text-sm text-slate-600">{a.message}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={BellRing} title="No simulated alerts yet" className="py-10">
              Inject an anomaly; alerts appear here within a tick or two.
            </EmptyState>
          )}
        </section>

        {/* Last tick */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Last tick</h2>
          {s?.lastTick ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">At</dt>
                <dd className="font-medium text-slate-900">{formatDateTime(s.lastTick.at, { second: '2-digit' })}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Simulated time</dt>
                <dd className="font-medium text-slate-900">{s.lastTick.simulatedLocalTime}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Assets</dt>
                <dd className="font-medium text-slate-900">{s.lastTick.assets}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Readings stored</dt>
                <dd className="font-medium text-slate-900">{s.lastTick.inserted}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Duration</dt>
                <dd className="font-medium text-slate-900">{s.lastTick.durationMs} ms</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Alerts</dt>
                <dd className="font-medium text-slate-900">
                  {s.lastTick.alertsCreated} new · {s.lastTick.alertsUpdated} repeat
                </dd>
              </div>
              {s.lastTick.anomalies?.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Anomalies applied</dt>
                  <dd className="font-medium text-amber-700">{s.lastTick.anomalies.map((x) => `${x.assetCode}: ${ANOMALY_LABELS[x.type] ?? x.type}`).join(', ')}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No ticks yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}

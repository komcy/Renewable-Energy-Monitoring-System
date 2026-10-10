import { Activity, BellRing, FlaskConical, Gauge, Upload, Zap } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { analyticsApi, GENERATING_TYPES, telemetryApi } from '@/api/analytics'
import RoleGate from '@/components/auth/RoleGate'
import BreakdownChart from '@/components/charts/BreakdownChart'
import ChartCard from '@/components/charts/ChartCard'
import EnergyChart from '@/components/charts/EnergyChart'
import PowerChart from '@/components/charts/PowerChart'
import { SERIES } from '@/components/charts/chartTheme'
import FilterBar from '@/components/dashboard/FilterBar'
import { MAX_HOURLY_DAYS, RANGE_PRESETS } from '@/constants/dashboard'
import KpiCard from '@/components/dashboard/KpiCard'
import PageHeader from '@/components/ui/PageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { ErrorState } from '@/components/ui/States'
import { SEVERITY_DOT, SEVERITY_ORDER } from '@/constants/styles'
import { usePolling, useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { usePlantOptions } from '@/hooks/usePlantOptions'
import { energyParts, formatDateTime, formatNumber, greeting, LOCAL_TIMEZONE, powerParts } from '@/utils/format'
import { bucketLabel, fillBuckets } from '@/utils/timeBuckets'

const DEFAULTS = { plant: '', range: '7d', interval: 'hour', from: '', to: '' }
const LIVE_REFRESH_MS = 60_000

const pctChange = (cur, prev) => (cur == null || !prev ? null : ((cur - prev) / prev) * 100)

/** Resolves the filter state to concrete dates. `now` is held in state so deps stay stable. */
function resolveRange(filters, now) {
  if (filters.range === 'custom' && filters.from && filters.to) {
    const from = new Date(`${filters.from}T00:00:00`)
    const to = new Date(`${filters.to}T23:59:59.999`)
    return { from, to: to > now ? new Date(now) : to, live: to >= now }
  }
  const preset = RANGE_PRESETS.find((p) => p.value === filters.range && p.ms) || RANGE_PRESETS[1]
  return { from: new Date(now - preset.ms), to: new Date(now), live: true }
}

export default function DashboardPage() {
  const { user } = useAuth()
  const plants = usePlantOptions()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => ({ ...DEFAULTS, ...Object.fromEntries(params) }), [params])
  const [now, setNow] = useState(() => Date.now())

  const { from, to, live } = resolveRange(filters, now)
  const days = (to - from) / 86_400_000
  const hourlyAllowed = days <= MAX_HOURLY_DAYS
  const interval = hourlyAllowed ? filters.interval : 'day'
  const multiDay = days > 1.01
  const base = { plant: filters.plant || undefined, from: from.toISOString(), to: to.toISOString(), timezone: LOCAL_TIMEZONE }

  const analytics = useAsync(() => analyticsApi.dashboard(base), [base])
  const power = useAsync(() => telemetryApi.aggregate({ ...base, interval, sourceType: GENERATING_TYPES }), [base, interval])
  const energy = useAsync(() => telemetryApi.aggregate({ ...base, interval: 'day', sourceType: GENERATING_TYPES }), [base])

  const refresh = useCallback(() => setNow(Date.now()), [])
  usePolling(refresh, LIVE_REFRESH_MS, { enabled: live })

  const setFilters = (next) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([k, v]) => v && v !== DEFAULTS[k]))
    setParams(clean, { replace: true })
  }

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const powerData = useMemo(
    () =>
      power.data
        ? fillBuckets(power.data, {
            from: new Date(fromMs),
            to: new Date(toMs),
            interval,
            make: (t, r) => ({ t, actual: r?.avgPower ?? null, expected: r?.avgExpectedPower ?? null }),
          })
        : [],
    [power.data, interval, fromMs, toMs],
  )
  const energyData = useMemo(() => {
    if (!energy.data) return []
    let running = 0
    const filled = fillBuckets(energy.data, {
      from: new Date(fromMs),
      to: new Date(toMs),
      interval: 'day',
      make: (t, r) => ({ t, energy: r?.energy ?? null }),
    })
    return filled.map((p) => {
      running += p.energy ?? 0
      return { ...p, cumulative: running }
    })
  }, [energy.data, fromMs, toMs])
  const [energyMode, setEnergyMode] = useState('daily')

  const a = analytics.data
  const k = a?.kpis
  const hasReadings = (k?.readings ?? 0) > 0
  const rangeLabel =
    filters.range === 'custom'
      ? `${from.toLocaleDateString()} – ${to.toLocaleDateString()}`
      : RANGE_PRESETS.find((p) => p.value === filters.range)?.label.toLowerCase() ?? ''
  const plantName = plants.find((p) => p.id === filters.plant)?.plantName

  const noData = (
    <>
      <Activity className="mb-2 size-6 text-slate-300" />
      <p className="font-medium text-slate-700">No generation telemetry in this range</p>
      <p className="mt-1">Try a longer date range, or feed data in:</p>
      <RoleGate permission="simulator:control" fallback={<p className="mt-1">ask an operator to start the simulator.</p>}>
        <p className="mt-2 flex gap-4">
          <Link to="/simulator" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
            <FlaskConical className="size-4" /> Simulator
          </Link>
          <Link to="/telemetry" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
            <Upload className="size-4" /> CSV upload
          </Link>
        </p>
      </RoleGate>
    </>
  )

  const gen = energyParts(k?.totalGeneration.kWh)
  const peak = powerParts(k?.peakPower.kW)
  const breakdownTitle = a?.breakdown.level === 'asset' ? `Output by asset · ${plantName ?? ''}` : 'Output by plant'

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        description={`Generation analytics for ${plantName ?? 'all plants'}, ${rangeLabel}.${live ? ' Updates every minute.' : ''}`}
      />

      <FilterBar
        filters={{ ...filters, interval }}
        onChange={setFilters}
        plants={plants}
        hourlyAllowed={hourlyAllowed}
        onRefresh={refresh}
        refreshing={analytics.stale || power.stale}
      />

      {analytics.error && !a ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <ErrorState error={analytics.error} onRetry={analytics.reload} />
        </div>
      ) : (
        <>
          <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 transition-opacity ${analytics.stale ? 'opacity-60' : ''}`}>
            <KpiCard
              icon={Zap}
              label="Total generation"
              value={a ? gen.value : '…'}
              unit={a ? gen.unit : undefined}
              sub={k?.capacityFactor != null ? `${formatNumber(k.capacityFactor, 1)}% capacity factor` : 'Solar + wind assets'}
              trend={a && { delta: pctChange(k.totalGeneration.kWh, k.totalGeneration.previous), unit: '%', higherIsBetter: true }}
            />
            <KpiCard
              icon={Activity}
              label="Peak power"
              tone="sky"
              value={a ? peak.value : '…'}
              unit={a && k.peakPower.kW != null ? peak.unit : undefined}
              sub={k?.peakPower.at ? `Hourly peak at ${formatDateTime(k.peakPower.at)}` : 'Highest hourly fleet output'}
              trend={a && { delta: pctChange(k.peakPower.kW, k.peakPower.previous), unit: '%', higherIsBetter: true }}
            />
            <KpiCard
              icon={Gauge}
              label="Fleet efficiency"
              tone="violet"
              value={a ? formatNumber(k.fleetEfficiency.percent, 1) : '…'}
              unit={a && k.fleetEfficiency.percent != null ? '%' : undefined}
              sub="Actual output ÷ expected for conditions"
              trend={
                a && {
                  delta:
                    k.fleetEfficiency.percent != null && k.fleetEfficiency.previous != null
                      ? k.fleetEfficiency.percent - k.fleetEfficiency.previous
                      : null,
                  unit: 'pts',
                  higherIsBetter: true,
                }
              }
            />
            <KpiCard
              icon={BellRing}
              label="Active alerts"
              tone={k?.alerts.openBySeverity.Critical ? 'red' : 'amber'}
              value={a ? k.alerts.open : '…'}
              sub={
                k ? (
                  <span className="inline-flex flex-wrap gap-x-2.5">
                    {SEVERITY_ORDER.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1">
                        <span className={`size-1.5 rounded-full ${SEVERITY_DOT[s]}`} aria-hidden="true" />
                        {k.alerts.openBySeverity[s]} {s}
                      </span>
                    ))}
                  </span>
                ) : undefined
              }
              trend={
                a && {
                  delta: k.alerts.raised - k.alerts.raisedPrevious,
                  unit: ' raised',
                  higherIsBetter: false,
                }
              }
            />
          </div>

          {a && (
            <p className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-slate-500">
              <span>
                <span className="font-semibold text-slate-700">{a.fleet.reportingAssets}</span> of {a.fleet.activeAssets} active generating
                assets reported in the last 15 min
              </span>
              <span>
                Installed generating capacity <span className="font-semibold text-slate-700">{powerParts(a.fleet.generatingCapacity).text}</span>
              </span>
              <span>
                <span className="font-semibold text-slate-700">{k.alerts.raised}</span> alerts raised in this period
              </span>
            </p>
          )}

          <ChartCard
            title="Power output vs expected (kW)"
            subtitle={`${interval === 'hour' ? 'Hourly' : 'Daily'} average fleet output (solar + wind), against the output expected for measured sunlight and wind`}
            legend={[
              { label: 'Actual output', color: SERIES.actual },
              { label: 'Expected output', color: SERIES.expected, dashed: true },
            ]}
            stale={power.stale}
            empty={power.error ? <ErrorState error={power.error} onRetry={power.reload} /> : power.data && !hasReadings && !powerData.some((p) => p.actual != null) ? noData : null}
            table={{
              columns: [
                { key: 't', label: interval === 'hour' ? 'Hour' : 'Day', format: (t) => bucketLabel(t, interval) },
                { key: 'actual', label: 'Actual (kW)', align: 'right', format: (v) => formatNumber(v, 2) },
                { key: 'expected', label: 'Expected (kW)', align: 'right', format: (v) => formatNumber(v, 2) },
              ],
              rows: powerData.filter((p) => p.actual != null || p.expected != null),
            }}
          >
            <PowerChart data={powerData} interval={interval} multiDay={multiDay} />
          </ChartCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title={energyMode === 'daily' ? 'Energy per day (kWh)' : 'Cumulative energy (kWh)'}
              subtitle={`Total ${energyParts(energyData.at(-1)?.cumulative ?? 0).text} in this period`}
              stale={energy.stale}
              actions={
                <SegmentedControl
                  size="sm"
                  label="Energy view"
                  value={energyMode}
                  onChange={setEnergyMode}
                  options={[
                    { value: 'daily', label: 'Per day' },
                    { value: 'cumulative', label: 'Cumulative' },
                  ]}
                />
              }
              empty={energy.error ? <ErrorState error={energy.error} onRetry={energy.reload} /> : energy.data && !energy.data.length ? noData : null}
              table={{
                columns: [
                  { key: 't', label: 'Day', format: (t) => bucketLabel(t, 'day') },
                  { key: 'energy', label: 'Energy (kWh)', align: 'right', format: (v) => formatNumber(v, 1) },
                  { key: 'cumulative', label: 'Running total (kWh)', align: 'right', format: (v) => formatNumber(v, 1) },
                ],
                rows: energyData,
              }}
            >
              <EnergyChart data={energyData} mode={energyMode} />
            </ChartCard>

            <ChartCard
              title={breakdownTitle}
              subtitle="Energy generated in this period (kWh)"
              stale={analytics.stale}
              empty={a && !a.breakdown.items.length ? 'No generating assets registered yet.' : null}
              table={
                a && {
                  columns: [
                    { key: 'label', label: a.breakdown.level === 'asset' ? 'Asset' : 'Plant' },
                    { key: 'energy', label: 'Energy (kWh)', align: 'right', format: (v) => formatNumber(v, 1) },
                    { key: 'avgPower', label: 'Avg kW', align: 'right', format: (v) => formatNumber(v, 1) },
                    { key: 'efficiency', label: 'Efficiency', align: 'right', format: (v) => (v == null ? '–' : `${formatNumber(v, 1)}%`) },
                  ],
                  rows: a.breakdown.items.map((i) => ({ ...i, key: i.id })),
                }
              }
            >
              {a && <BreakdownChart items={a.breakdown.items} />}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

import { BellRing, Check, ChevronLeft, ChevronRight, Database, Eye, FileJson, FileSpreadsheet, FileText, Gauge, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { reportsApi } from '@/api/reports'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { usePlantOptions } from '@/hooks/usePlantOptions'
import { energyParts, formatDateTime, formatNumber, LOCAL_TIMEZONE, powerParts, timeAgo } from '@/utils/format'

const TYPES = {
  PlantPerformance: {
    label: 'Plant performance summary',
    icon: Gauge,
    description: 'Energy, average and peak power, efficiency, capacity factor and alerts per plant (or per asset) for each day, week or month.',
  },
  AlertFrequency: {
    label: 'Alert incident frequency',
    icon: BellRing,
    description: 'Incidents by type and severity with resolution rate and mean time to resolve, plus the noisiest assets and a timeline.',
  },
  TelemetryExport: {
    label: 'Fleet telemetry export',
    icon: Database,
    description: 'Every raw reading in the range with derived expected power, efficiency and running energy (up to 500,000 rows).',
  },
}

const RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom dates' },
]
const PAGE_SIZE = 10

function resolveRange(range, custom) {
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  switch (range) {
    case '7d':
      return { from: new Date(startOfDay(now).getTime() - 6 * 86_400_000), to: now }
    case '30d':
      return { from: new Date(startOfDay(now).getTime() - 29 * 86_400_000), to: now }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    case 'lastMonth':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1) }
    default:
      return {
        from: custom.from ? new Date(`${custom.from}T00:00:00`) : null,
        to: custom.to ? new Date(`${custom.to}T23:59:59.999`) : null,
      }
  }
}

const periodText = (start, end) =>
  `${new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(end).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`

/** Headline figures for a report summary, by type. */
function summaryStats(report) {
  const s = report.summary || {}
  switch (report.reportType) {
    case 'PlantPerformance':
      return [
        ['Energy generated', energyParts(s.totalEnergyKWh).text],
        ['Peak power', powerParts(s.peakPowerKW).text],
        ['Efficiency', s.efficiencyPct == null ? '–' : `${formatNumber(s.efficiencyPct, 1)}%`],
        ['Alerts', formatNumber(s.totalAlerts, 0)],
      ]
    case 'AlertFrequency':
      return [
        ['Incidents', formatNumber(s.totalIncidents, 0)],
        ['Critical', formatNumber(s.criticalIncidents, 0)],
        ['Resolution rate', s.resolutionRatePct == null ? '–' : `${formatNumber(s.resolutionRatePct, 0)}%`],
        ['Mean time to resolve', s.meanTimeToResolveHours == null ? '–' : `${formatNumber(s.meanTimeToResolveHours, 1)} h`],
      ]
    default:
      return [
        ['Readings', formatNumber(s.readings, 0)],
        ['Assets', formatNumber(s.assets, 0)],
        ['First reading', s.firstReading ? formatDateTime(s.firstReading) : '–'],
        ['Last reading', s.lastReading ? formatDateTime(s.lastReading) : '–'],
      ]
  }
}

function DownloadButtons({ report, size = 'sm' }) {
  const [busy, setBusy] = useState(null)
  const download = async (format) => {
    setBusy(format)
    try {
      const { name } = await reportsApi.download(report.id, format)
      toast.success(`Downloaded ${name}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Download failed'))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex gap-1.5">
      <Button size={size} variant="secondary" onClick={() => download('csv')} loading={busy === 'csv'} aria-label={`Download ${report.title} as CSV`}>
        {busy !== 'csv' && <FileSpreadsheet className="size-3.5" />} CSV
      </Button>
      <Button size={size} variant="secondary" onClick={() => download('json')} loading={busy === 'json'} aria-label={`Download ${report.title} as JSON`}>
        {busy !== 'json' && <FileJson className="size-3.5" />} JSON
      </Button>
    </div>
  )
}

function PreviewTable({ columns, rows, max = 10 }) {
  if (!rows?.length) return <p className="text-sm text-slate-500">No rows for this period.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
          {rows.slice(0, max).map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-1.5">
                  {r[c.key] == null ? '–' : typeof r[c.key] === 'number' ? formatNumber(r[c.key], 2) : String(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Showing {max} of {rows.length} rows; download for the full report.</p>}
    </div>
  )
}

function ReportViewModal({ id, onClose }) {
  const { data: r, error, initialLoading, reload } = useAsync(() => reportsApi.get(id), [id])
  return (
    <Modal open size="lg" onClose={onClose} title={r?.title ?? 'Report'} description={r ? periodText(r.period.start, r.period.end) : undefined} footer={r && <DownloadButtons report={r} size="md" />}>
      {initialLoading ? (
        <LoadingState />
      ) : error && !r ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summaryStats(r).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          {r.reportType === 'TelemetryExport' ? (
            <p className="text-sm text-slate-600">Raw telemetry is generated fresh when you download it. Use CSV for spreadsheets or JSON for scripts.</p>
          ) : (
            <PreviewTable columns={r.columns} rows={r.rows} max={50} />
          )}
        </div>
      )}
    </Modal>
  )
}

export default function ReportsPage() {
  const { user } = useAuth()
  const plants = usePlantOptions()

  // ----- wizard
  const [step, setStep] = useState(1)
  const [reportType, setReportType] = useState('PlantPerformance')
  const [plant, setPlant] = useState('')
  const [range, setRange] = useState('7d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [granularity, setGranularity] = useState('Daily')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)

  const { from, to } = resolveRange(range, custom)
  const rangeError =
    !from || !to ? 'Choose both dates' : from >= to ? 'Start must be before end' : to - from > 366 * 86_400_000 ? 'Choose a range of up to one year' : ''
  const plantName = plants.find((p) => p.id === plant)?.plantName ?? 'All plants'

  const generate = async () => {
    setGenerating(true)
    try {
      const report = await reportsApi.generate({
        reportType,
        plant: plant || undefined,
        from: from.toISOString(),
        to: to.toISOString(),
        granularity,
        timezone: LOCAL_TIMEZONE,
      })
      setResult(report)
      toast.success('Report ready')
      history.reload()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate the report'))
    } finally {
      setGenerating(false)
    }
  }
  const restart = () => {
    setResult(null)
    setStep(1)
  }

  // ----- history
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const history = useAsync(() => reportsApi.list({ page, limit: PAGE_SIZE, reportType: typeFilter || undefined }), [page, typeFilter])
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const canDelete = (r) => user.role === 'Admin' || r.generatedBy?.id === user.id

  const steps = ['Report type', 'Scope & period', 'Review']

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Generate performance, incident and telemetry reports and export them as CSV or JSON." />

      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <ol className="flex border-b border-slate-100 px-5 text-sm" aria-label="Report steps">
          {steps.map((label, i) => {
            const n = i + 1
            const state = result ? 'done' : n < step ? 'done' : n === step ? 'current' : 'todo'
            return (
              <li key={label} className={`-mb-px flex items-center gap-2 border-b-2 py-3 pr-6 ${state === 'current' ? 'border-emerald-600 font-semibold text-slate-900' : 'border-transparent text-slate-500'}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${state === 'done' ? 'bg-emerald-600 text-white' : state === 'current' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {state === 'done' ? <Check className="size-3" /> : n}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </li>
            )
          })}
        </ol>

        <div className="p-5">
          {result ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <Check className="size-4" /> Report generated in {formatNumber((result.summary.generationMs ?? 0) / 1000, 1)} s
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{result.title}</h2>
                  <p className="text-sm text-slate-500">
                    {periodText(result.period.start, result.period.end)} · {formatNumber(result.rowCount, 0)} rows
                    {result.summary.truncated && ` (limited to ${formatNumber(result.summary.maxRows, 0)})`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <DownloadButtons report={result} size="md" />
                  <Button variant="ghost" onClick={restart}>
                    New report
                  </Button>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {summaryStats(result).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              {result.reportType !== 'TelemetryExport' && <PreviewTable columns={result.columns} rows={result.preview} />}
            </div>
          ) : step === 1 ? (
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Report type">
              {Object.entries(TYPES).map(([key, t]) => {
                const active = reportType === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setReportType(key)}
                    className={`flex flex-col rounded-xl border p-4 text-left transition ${active ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <span className={`grid size-10 place-items-center rounded-lg ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <t.icon className="size-5" />
                    </span>
                    <span className="mt-3 font-semibold text-slate-900">{t.label}</span>
                    <span className="mt-1 text-sm text-slate-500">{t.description}</span>
                  </button>
                )
              })}
            </div>
          ) : step === 2 ? (
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Select
                label="Plant"
                value={plant}
                onChange={(e) => setPlant(e.target.value)}
                options={[{ value: '', label: 'All plants (fleet)' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]}
              />
              <Select label="Period" value={range} onChange={(e) => setRange(e.target.value)} options={RANGES} />
              {range === 'custom' && (
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  {['from', 'to'].map((k) => (
                    <div key={k}>
                      <label htmlFor={`rep-${k}`} className="mb-1.5 block text-sm font-medium text-slate-700">
                        {k === 'from' ? 'From' : 'To'}
                      </label>
                      <input
                        id={`rep-${k}`}
                        type="date"
                        value={custom[k]}
                        onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                      />
                    </div>
                  ))}
                </div>
              )}
              {reportType !== 'TelemetryExport' && (
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-sm font-medium text-slate-700">Group results by</p>
                  <SegmentedControl
                    label="Granularity"
                    value={granularity}
                    onChange={setGranularity}
                    options={['Daily', 'Weekly', 'Monthly'].map((g) => ({ value: g, label: g }))}
                  />
                </div>
              )}
              {rangeError && from && to && <p className="text-sm font-medium text-red-600 sm:col-span-2">{rangeError}</p>}
            </div>
          ) : (
            <dl className="grid max-w-3xl gap-4 sm:grid-cols-2">
              {[
                ['Report', TYPES[reportType].label],
                ['Scope', plantName],
                ['Period', !rangeError ? periodText(from, to) : '–'],
                ['Grouping', reportType === 'TelemetryExport' ? 'Raw readings' : granularity],
                ['Time zone', LOCAL_TIMEZONE],
                ['Formats', 'CSV and JSON'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {!result && (
          <div className="flex justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 1 || generating}>
              <ChevronLeft className="size-4" /> Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={step === 2 && Boolean(rangeError)}>
                Next <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={generate} loading={generating} disabled={Boolean(rangeError)}>
                {!generating && <FileText className="size-4" />} {generating ? 'Generating…' : 'Generate report'}
              </Button>
            )}
          </div>
        )}
      </section>

      {/* History */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Report history</h2>
            <p className="text-sm text-slate-500">Previously generated reports, newest first</p>
          </div>
          <Select
            label="Report type"
            hideLabel
            className="w-60"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
              setPage(1)
            }}
            options={[{ value: '', label: 'All report types' }, ...Object.entries(TYPES).map(([k, t]) => ({ value: k, label: t.label }))]}
          />
        </div>
        {history.initialLoading ? (
          <LoadingState label="Loading reports…" />
        ) : history.error && !history.data ? (
          <ErrorState error={history.error} onRetry={history.reload} />
        ) : !history.data.data.length ? (
          <EmptyState icon={FileText} title="No reports yet">
            Generate one above; it will be listed here for download later.
          </EmptyState>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${history.stale ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Report</th>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5 text-right">Rows</th>
                  <th className="px-3 py-2.5">Generated</th>
                  <th className="px-5 py-2.5 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.data.data.map((r) => {
                  const T = TYPES[r.reportType]
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                            <T.icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{T.label}</p>
                            <p className="truncate text-xs text-slate-500">
                              {r.plant?.plantName ?? 'All plants'}
                              {r.reportType !== 'TelemetryExport' && ` · ${r.granularity.toLowerCase()}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{periodText(r.period.start, r.period.end)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatNumber(r.rowCount, 0)}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <span title={formatDateTime(r.generatedAt, { year: 'numeric' })}>{timeAgo(r.generatedAt)}</span>
                        <span className="block text-xs text-slate-400">{r.generatedBy?.name ?? 'Unknown'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <DownloadButtons report={r} />
                          <button type="button" onClick={() => setViewing(r.id)} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="View report" title="View">
                            <Eye className="size-4" />
                          </button>
                          {canDelete(r) && (
                            <button type="button" onClick={() => setDeleting(r)} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete report" title="Delete">
                              <Trash2 className="size-4" />
                            </button>
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
        {history.data && (
          <div className="border-t border-slate-100 px-5 py-3">
            <Pagination page={history.data.page} pages={history.data.pages} total={history.data.total} limit={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </section>

      {viewing && <ReportViewModal id={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this report?"
          confirmLabel="Delete"
          tone="danger"
          icon={Trash2}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              toast.success(await reportsApi.remove(deleting.id))
              setDeleting(null)
              if (result?.id === deleting.id) setResult(null)
              history.reload()
            } catch (err) {
              toast.error(getErrorMessage(err))
              throw err
            }
          }}
        >
          <p>{deleting.title}</p>
          <p>The underlying monitoring data is not affected; you can regenerate the report at any time.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

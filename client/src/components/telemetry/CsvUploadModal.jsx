import { CircleAlert, CircleCheck, Download, FileSpreadsheet, ListX, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { telemetryApi } from '@/api/analytics'
import { getErrorMessage } from '@/api/client'
import { assetsApi } from '@/api/plants'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAlerts } from '@/hooks/useAlerts'
import { formatNumber } from '@/utils/format'
import { buildSampleCsv, downloadText } from '@/utils/sampleCsv'

const MAX_BYTES = 20 * 1024 * 1024
const REQUIRED = ['assetCode', 'timestamp', 'powerOutput']
const OPTIONAL = ['temperature', 'irradiance', 'windSpeed', 'stateOfCharge', 'rotorSpeed', 'efficiency', 'operatingStatus', 'cumulativeEnergy']

const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

/** Row-level validation errors, filterable by text. */
function ErrorsDrawer({ summary, onClose }) {
  const [filter, setFilter] = useState('')
  const rows = summary.errors.filter((e) => !filter || `${e.line} ${e.errors.join(' ')}`.toLowerCase().includes(filter.toLowerCase()))
  return (
    <Drawer
      open
      onClose={onClose}
      title="Rejected rows"
      description={`${summary.rejected} row(s) were not stored${summary.errorsTruncated ? `; showing the first ${summary.errors.length}` : ''}`}
    >
      <div className="sticky top-0 border-b border-slate-100 bg-white px-5 py-3">
        <label htmlFor="err-filter" className="sr-only">Filter errors</label>
        <input
          id="err-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by line number or message…"
          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
        />
      </div>
      <ol className="divide-y divide-slate-100">
        {rows.map((e, i) => (
          <li key={`${e.line}-${i}`} className="flex gap-4 px-5 py-3 text-sm">
            <span className="w-16 shrink-0 font-mono text-xs font-semibold text-slate-500">{e.line != null ? `Line ${e.line}` : '—'}</span>
            <ul className="space-y-0.5 text-slate-700">
              {e.errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </li>
        ))}
        {!rows.length && <li className="px-5 py-8 text-center text-sm text-slate-500">No errors match this filter.</li>}
      </ol>
    </Drawer>
  )
}

/**
 * Drag-and-drop CSV upload with upload progress, server processing state,
 * an ingestion summary and a drawer of line-numbered row errors.
 */
export default function CsvUploadModal({ onClose, onUploaded }) {
  const { refresh: refreshAlerts } = useAlerts()
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | uploading | processing | done
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const [sampling, setSampling] = useState(false)
  const busy = phase === 'uploading' || phase === 'processing'

  const choose = (f) => {
    setResult(null)
    setPhase('idle')
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setFile(null)
      setFileError('Only .csv files can be uploaded')
    } else if (f.size > MAX_BYTES) {
      setFile(null)
      setFileError(`File is ${sizeText(f.size)}; the limit is 20 MB`)
    } else {
      setFile(f)
      setFileError('')
    }
  }

  const upload = async () => {
    if (!file) return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('uploading')
    setProgress(0)
    try {
      const res = await telemetryApi.upload(file, {
        signal: controller.signal,
        onProgress: (p) => {
          setProgress(p)
          if (p >= 1) setPhase('processing')
        },
      })
      setResult(res)
      setPhase('done')
      if (res.summary.accepted) {
        toast.success(`${formatNumber(res.summary.accepted, 0)} readings stored`)
        refreshAlerts()
        onUploaded()
      } else {
        toast.error('No rows were stored')
      }
    } catch (err) {
      setPhase('idle')
      if (err.code !== 'ERR_CANCELED') toast.error(getErrorMessage(err, 'Upload failed'))
    } finally {
      abortRef.current = null
    }
  }

  const downloadSample = async () => {
    setSampling(true)
    try {
      const assets = await assetsApi.list({ status: 'Active' })
      // Prefer one solar, one wind and one battery asset: they exercise the most columns
      const rank = (a) => {
        const i = ['SolarPanel', 'WindTurbine', 'BatteryStorage'].indexOf(a.sourceType)
        return i === -1 ? 9 : i
      }
      const byType = new Map()
      for (const a of [...assets].sort((x, y) => rank(x) - rank(y))) if (!byType.has(a.sourceType)) byType.set(a.sourceType, a)
      const { csv, assets: used, rows } = buildSampleCsv([...byType.values()])
      downloadText('rems-sample-telemetry.csv', csv)
      toast.success(`Sample with ${rows} rows for ${used.join(', ')}${assets.length ? '' : ' (no active assets found; edit the codes)'}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not build the sample'))
    } finally {
      setSampling(false)
    }
  }

  const s = result?.summary

  return (
    <Modal
      open
      size="lg"
      onClose={() => {
        abortRef.current?.abort()
        onClose()
      }}
      title="Upload telemetry CSV"
      description="Rows are validated, enriched (expected power, efficiency, energy) and checked against alert rules."
      footer={
        <>
          <Button variant="secondary" onClick={downloadSample} loading={sampling} className="sm:mr-auto">
            {!sampling && <Download className="size-4" />} Sample CSV
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {phase === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {phase !== 'done' && (
            <Button onClick={upload} disabled={!file} loading={busy}>
              {!busy && <Upload className="size-4" />} {busy ? 'Uploading…' : 'Upload'}
            </Button>
          )}
          {phase === 'done' && (
            <Button
              onClick={() => {
                setFile(null)
                setResult(null)
                setPhase('idle')
              }}
            >
              Upload another
            </Button>
          )}
        </>
      }
    >
      {phase !== 'done' && (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => !busy && inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!busy) choose(e.dataTransfer.files?.[0])
            }}
            className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragging ? 'border-emerald-500 bg-emerald-50' : fileError ? 'border-red-300 bg-red-50/40' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            } ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <span className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <FileSpreadsheet className="size-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-900">Drop a CSV here, or click to choose a file</p>
            <p className="mt-1 text-xs text-slate-500">.csv up to 20 MB · rows should be in time order per asset</p>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          </div>
          {fileError && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-600">
              <CircleAlert className="size-4" /> {fileError}
            </p>
          )}

          {file && (
            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="size-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                  <p className="text-xs text-slate-500">{sizeText(file.size)}</p>
                </div>
                {!busy && (
                  <button type="button" onClick={() => setFile(null)} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-slate-100" aria-label="Remove file">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {busy && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className={`h-full rounded-full bg-emerald-500 transition-[width] ${phase === 'processing' ? 'animate-pulse' : ''}`}
                      style={{ width: `${Math.max(3, progress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {phase === 'processing' ? (
                      <>
                        <Spinner className="size-3.5" /> Uploaded. Validating, enriching and storing rows on the server…
                      </>
                    ) : (
                      `Uploading… ${Math.round(progress * 100)}%`
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <details className="mt-4 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">Expected columns</summary>
            <p className="mt-2">
              Required: {REQUIRED.map((c) => <code key={c} className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-xs">{c}</code>)}
            </p>
            <p className="mt-1">
              Optional: {OPTIONAL.map((c) => <code key={c} className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-xs">{c}</code>)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Header names are matched loosely (e.g. “Power Output”). Unknown columns are ignored.</p>
          </details>
        </>
      )}

      {phase === 'done' && s && (
        <div className="space-y-4">
          <div
            className={`flex gap-3 rounded-lg p-3 text-sm ring-1 ring-inset ${
              s.accepted ? 'bg-emerald-50 text-emerald-900 ring-emerald-600/20' : 'bg-red-50 text-red-900 ring-red-600/20'
            }`}
          >
            {s.accepted ? <CircleCheck className="size-5 shrink-0" /> : <CircleAlert className="size-5 shrink-0" />}
            <div>
              <p className="font-semibold">{result.message}</p>
              <p className="mt-0.5 text-xs opacity-80">
                {file?.name} · processed in {formatNumber((s.durationMs ?? 0) / 1000, 1)} s across {s.batches} batch{s.batches === 1 ? '' : 'es'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows processed" value={formatNumber(s.totalRows, 0)} />
            <Stat label="Accepted" value={formatNumber(s.accepted, 0)} tone="text-emerald-700" />
            <Stat label="Rejected" value={formatNumber(s.rejected, 0)} tone={s.rejected ? 'text-red-600' : 'text-slate-900'} />
            <Stat label="Alerts raised" value={formatNumber(s.alertsCreated, 0)} tone={s.alertsCreated ? 'text-amber-700' : 'text-slate-900'} />
          </div>
          {s.ignoredColumns?.length > 0 && (
            <p className="text-xs text-slate-500">
              Ignored unknown column{s.ignoredColumns.length > 1 ? 's' : ''}: {s.ignoredColumns.join(', ')}
            </p>
          )}
          {s.rejected > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">Rejected rows</p>
                <Button variant="secondary" size="sm" onClick={() => setShowErrors(true)}>
                  <ListX className="size-3.5" /> View all {s.rejected}
                </Button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                {s.errors.slice(0, 4).map((e, i) => (
                  <li key={`${e.line}-${i}`} className="flex gap-3 px-3 py-2">
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold text-slate-500">Line {e.line ?? '?'}</span>
                    <span className="text-slate-700">{e.errors.join('; ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showErrors && s && <ErrorsDrawer summary={s} onClose={() => setShowErrors(false)} />}
    </Modal>
  )
}

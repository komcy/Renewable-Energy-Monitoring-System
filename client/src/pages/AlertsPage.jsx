import { BellOff, ChevronRight, CircleCheck, Eye, Factory, Repeat } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router'
import { alertsApi } from '@/api/alerts'
import { getErrorMessage } from '@/api/client'
import AlertDetailModal from '@/components/alerts/AlertDetailModal'
import ResolveAlertModal from '@/components/alerts/ResolveAlertModal'
import { SeverityBadge } from '@/components/ui/Badges'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { ALERT_STATUS_BADGE, alertTypeInfo, SEVERITY_STRIPE, STATUS_FILTERS } from '@/constants/alerts'
import { SEVERITY_DOT, SEVERITY_ORDER } from '@/constants/styles'
import { useAlerts } from '@/hooks/useAlerts'
import { useAsync, usePolling } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { usePlantOptions } from '@/hooks/usePlantOptions'
import { timeAgo } from '@/utils/format'

const PAGE_SIZE = 15
const REFRESH_MS = 20_000

function AlertRow({ alert, canManage, onOpen, onAcknowledge, onResolve, acking }) {
  const info = alertTypeInfo(alert.alertType)
  const Icon = info.icon
  const resolved = alert.status === 'Resolved'
  return (
    <li className="group relative flex gap-4 bg-white px-4 py-4 transition hover:bg-slate-50 sm:px-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STRIPE[alert.severity]}`} aria-hidden="true" />
      <span className={`mt-0.5 hidden size-9 shrink-0 place-items-center rounded-lg sm:grid ${resolved ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onOpen(alert)} className="text-left font-semibold text-slate-900 after:absolute after:inset-0 hover:text-emerald-700">
            {info.label}
          </button>
          <SeverityBadge severity={alert.severity} />
          <Pill tone={ALERT_STATUS_BADGE[alert.status]}>{alert.status}</Pill>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{alert.asset?.assetCode ?? 'Deleted asset'}</span>
          {alert.asset?.name && <span>{alert.asset.name}</span>}
          {alert.plant?.plantName && (
            <span className="inline-flex items-center gap-1">
              <Factory className="size-3" aria-hidden="true" /> {alert.plant.plantName}
            </span>
          )}
        </p>
        <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{alert.message}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span title={new Date(alert.timestamp).toLocaleString()}>First seen {timeAgo(alert.timestamp)}</span>
          {alert.occurrenceCount > 1 && (
            <span className="inline-flex items-center gap-1" title={`Last seen ${new Date(alert.lastOccurredAt).toLocaleString()}`}>
              <Repeat className="size-3" aria-hidden="true" /> {alert.occurrenceCount} occurrences · last {timeAgo(alert.lastOccurredAt)}
            </span>
          )}
          {resolved && alert.resolvedAt && <span>Resolved {timeAgo(alert.resolvedAt)}</span>}
        </p>
      </div>

      <div className="relative z-10 flex shrink-0 flex-col items-end justify-between gap-2">
        {canManage && !resolved ? (
          <div className="flex flex-col gap-1.5 sm:flex-row">
            {alert.status === 'Active' && (
              <Button variant="secondary" size="sm" onClick={() => onAcknowledge(alert)} loading={acking}>
                {!acking && <Eye className="size-3.5" />} Acknowledge
              </Button>
            )}
            <Button size="sm" onClick={() => onResolve(alert)}>
              <CircleCheck className="size-3.5" /> Resolve
            </Button>
          </div>
        ) : (
          <span />
        )}
        <ChevronRight className="hidden size-4 text-slate-300 group-hover:text-slate-500 sm:block" aria-hidden="true" />
      </div>
    </li>
  )
}

export default function AlertsPage() {
  const { can } = useAuth()
  const { refresh: refreshBell } = useAlerts()
  const plants = usePlantOptions()
  const [params, setParams] = useSearchParams()
  const severity = SEVERITY_ORDER.includes(params.get('severity')) ? params.get('severity') : ''
  const statusKey = STATUS_FILTERS.some((s) => s.value === params.get('status')) ? params.get('status') : 'open'
  const plant = params.get('plant') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const statuses = STATUS_FILTERS.find((s) => s.value === statusKey).statuses.join(',')

  const update = (patch) => {
    const next = { severity, status: statusKey, plant, page: String(page), ...patch }
    if (!('page' in patch)) next.page = '1'
    const clean = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => v && !(k === 'status' && v === 'open') && !(k === 'page' && v === '1')),
    )
    setParams(clean, { replace: true })
  }

  const listQuery = { status: statuses, severity: severity || undefined, plant: plant || undefined, page, limit: PAGE_SIZE }
  const countQuery = { status: statuses, plant: plant || undefined }
  const list = useAsync(() => alertsApi.list(listQuery), [listQuery])
  const counts = useAsync(() => alertsApi.counts(countQuery), [countQuery])

  const reloadAll = useCallback(() => {
    list.reload()
    counts.reload()
    refreshBell()
  }, [list, counts, refreshBell])
  usePolling(reloadAll, REFRESH_MS)

  const [detailId, setDetailId] = useState(null)
  const [detailVersion, setDetailVersion] = useState(0)
  const [resolving, setResolving] = useState(null)
  const [ackingId, setAckingId] = useState(null)

  const acknowledge = async (alert) => {
    setAckingId(alert.id)
    try {
      await alertsApi.acknowledge(alert.id)
      toast.success(`Acknowledged: ${alertTypeInfo(alert.alertType).label} on ${alert.asset?.assetCode}`)
      reloadAll()
      setDetailVersion((v) => v + 1)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not acknowledge the alert'))
      reloadAll()
    } finally {
      setAckingId(null)
    }
  }

  const tabs = useMemo(
    () => [
      { value: '', label: 'All', count: counts.data?.total },
      ...SEVERITY_ORDER.map((s) => ({ value: s, label: s, count: counts.data?.bySeverity[s] })),
    ],
    [counts.data],
  )
  const alerts = list.data?.data ?? []

  return (
    <div>
      <PageHeader
        title="Alert centre"
        description="Faults detected by the rule engine. Acknowledge to show you're on it; resolve with notes once fixed."
      />

      {/* Severity tabs */}
      <div className="mb-4 overflow-x-auto border-b border-slate-200">
        <div role="tablist" aria-label="Severity" className="flex min-w-max gap-1">
          {tabs.map((t) => {
            const active = t.value === severity
            return (
              <button
                key={t.value || 'all'}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => update({ severity: t.value })}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  active ? 'border-emerald-600 text-slate-900' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {t.value && <span className={`size-2 rounded-full ${SEVERITY_DOT[t.value]}`} aria-hidden="true" />}
                {t.label}
                <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {t.count ?? '·'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Status + plant filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto">
          <SegmentedControl
            label="Status"
            value={statusKey}
            onChange={(status) => update({ status })}
            options={STATUS_FILTERS.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
        <Select
          label="Plant"
          hideLabel
          icon={Factory}
          className="sm:w-60"
          value={plant}
          onChange={(e) => update({ plant: e.target.value })}
          options={[{ value: '', label: 'All plants' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {list.initialLoading ? (
          <LoadingState label="Loading alerts…" />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : !alerts.length ? (
          <EmptyState icon={BellOff} title={statusKey === 'open' ? 'No open alerts' : 'No alerts match these filters'}>
            {statusKey === 'open' ? 'Every asset is operating within its thresholds.' : 'Try another severity, status or plant.'}
          </EmptyState>
        ) : (
          <ul className={`divide-y divide-slate-100 transition-opacity ${list.stale ? 'opacity-60' : ''}`}>
            {alerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                canManage={can('alerts:manage')}
                onOpen={(x) => setDetailId(x.id)}
                onAcknowledge={acknowledge}
                onResolve={setResolving}
                acking={ackingId === a.id}
              />
            ))}
          </ul>
        )}
      </div>
      {list.data && (
        <div className="mt-4">
          <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} limit={PAGE_SIZE} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}

      {detailId && (
        <AlertDetailModal
          alertId={detailId}
          version={detailVersion}
          busy={ackingId === detailId}
          onClose={() => setDetailId(null)}
          onAcknowledge={acknowledge}
          onResolve={setResolving}
        />
      )}
      {resolving && (
        <ResolveAlertModal
          alert={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => {
            setResolving(null)
            setDetailVersion((v) => v + 1)
            reloadAll()
          }}
        />
      )}
    </div>
  )
}

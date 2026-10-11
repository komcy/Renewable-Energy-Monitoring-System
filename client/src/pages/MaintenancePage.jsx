import { CalendarClock, Factory, KanbanSquare, List, Plus, Search, Wrench } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router'
import { getErrorMessage } from '@/api/client'
import { maintenanceApi } from '@/api/maintenance'
import RoleGate from '@/components/auth/RoleGate'
import StatusTransitionModal from '@/components/maintenance/StatusTransitionModal'
import WorkOrderDetailModal from '@/components/maintenance/WorkOrderDetailModal'
import WorkOrderFormModal from '@/components/maintenance/WorkOrderFormModal'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PageHeader from '@/components/ui/PageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import {
  formatINR,
  isOverdue,
  MAINTENANCE_TYPES,
  PRIORITIES,
  PRIORITY_BADGE,
  STATUS_META,
  TRANSITION_LABELS,
  TYPE_BADGE,
  WORK_ORDER_STATUSES,
} from '@/constants/maintenance'
import { useAsync, usePolling } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { usePlantOptions } from '@/hooks/usePlantOptions'
import { formatDateTime } from '@/utils/format'

const DEFAULTS = { view: 'board', plant: '', type: '', priority: '', search: '' }

function WorkOrderCard({ wo, canManage, onOpen, onTransition }) {
  const overdue = isOverdue(wo)
  const next = { Scheduled: 'In Progress', 'In Progress': 'Completed' }[wo.status]
  return (
    <li className="group relative rounded-lg border border-slate-200 bg-white p-3 shadow-xs transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(wo)} className="text-left text-sm font-semibold text-slate-900 after:absolute after:inset-0 hover:text-emerald-700">
          {wo.title}
        </button>
        <Pill tone={PRIORITY_BADGE[wo.priority]}>{wo.priority}</Pill>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <span className="font-mono font-semibold text-slate-600">{wo.workOrderNumber}</span> · {wo.asset?.assetCode ?? 'Deleted asset'}
      </p>
      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
        <Factory className="size-3 shrink-0" aria-hidden="true" /> {wo.plant?.plantName}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Pill tone={TYPE_BADGE[wo.maintenanceType]}>{wo.maintenanceType}</Pill>
        <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {wo.status === 'Completed' && wo.completedAt ? `Done ${formatDateTime(wo.completedAt)}` : formatDateTime(wo.scheduledDate)}
          {overdue && ' · overdue'}
        </span>
      </div>
      {(wo.technician || wo.cost != null) && (
        <p className="mt-1.5 text-xs text-slate-500">
          {wo.technician}
          {wo.technician && wo.cost != null && ' · '}
          {wo.cost != null && formatINR(wo.cost)}
        </p>
      )}
      {canManage && next && (
        <div className="relative z-10 mt-3 border-t border-slate-100 pt-2.5">
          <Button size="sm" variant="secondary" className="w-full" onClick={() => onTransition(wo, next)}>
            {TRANSITION_LABELS[next]}
          </Button>
        </div>
      )}
    </li>
  )
}

export default function MaintenancePage() {
  const { can } = useAuth()
  const plants = usePlantOptions()
  const [params, setParams] = useSearchParams()
  const f = useMemo(() => ({ ...DEFAULTS, ...Object.fromEntries(params) }), [params])
  const update = (patch) => {
    const next = { ...f, ...patch }
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && v !== DEFAULTS[k])), { replace: true })
  }

  const query = {
    plant: f.plant || undefined,
    type: f.type || undefined,
    priority: f.priority || undefined,
    search: f.search.trim() || undefined,
    limit: 500,
  }
  const list = useAsync(() => maintenanceApi.list(query), [query])
  const summary = useAsync(() => maintenanceApi.summary({ plant: f.plant || undefined }), [f.plant])
  const reload = useCallback(() => {
    list.reload()
    summary.reload()
  }, [list, summary])
  usePolling(reload, 30_000)

  const [form, setForm] = useState(null) // { workOrder? }
  const [detail, setDetail] = useState(null) // id
  const [detailVersion, setDetailVersion] = useState(0)
  const [transition, setTransition] = useState(null) // { workOrder, target }
  const [deleting, setDeleting] = useState(null)

  const orders = list.data?.data ?? []
  const byStatus = Object.fromEntries(WORK_ORDER_STATUSES.map((s) => [s, orders.filter((o) => o.status === s)]))
  const s = summary.data
  const afterChange = () => {
    reload()
    setDetailVersion((v) => v + 1)
  }

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Work orders for preventive, corrective and inspection work across your assets."
        actions={
          <RoleGate permission="maintenance:manage">
            <Button onClick={() => setForm({})}>
              <Plus className="size-4" /> New work order
            </Button>
          </RoleGate>
        }
      />

      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Open work orders', s.open, `${s.byStatus['In Progress']} in progress`],
            ['Overdue', s.overdue, 'Scheduled date has passed', s.overdue ? 'text-red-600' : 'text-slate-900'],
            ['Completed this month', s.completedThisMonth, `${s.byStatus.Completed} completed in total`],
            ['Cost this month', formatINR(s.costThisMonth), 'Completed work orders'],
          ].map(([label, value, sub, tone = 'text-slate-900']) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
              <p className="truncate text-xs text-slate-500">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="wo-search" className="sr-only">Search work orders</label>
          <input
            id="wo-search"
            type="search"
            value={f.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Title, WO number, asset, technician…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>
        <Select label="Plant" hideLabel icon={Factory} className="lg:w-52" value={f.plant} onChange={(e) => update({ plant: e.target.value })}
          options={[{ value: '', label: 'All plants' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]} />
        <Select label="Type" hideLabel className="lg:w-40" value={f.type} onChange={(e) => update({ type: e.target.value })}
          options={[{ value: '', label: 'All types' }, ...MAINTENANCE_TYPES.map((t) => ({ value: t, label: t }))]} />
        <Select label="Priority" hideLabel className="lg:w-40" value={f.priority} onChange={(e) => update({ priority: e.target.value })}
          options={[{ value: '', label: 'All priorities' }, ...PRIORITIES.map((p) => ({ value: p, label: p }))]} />
        <div className="lg:ml-auto">
          <SegmentedControl
            label="View"
            value={f.view}
            onChange={(view) => update({ view })}
            options={[
              { value: 'board', label: <span className="inline-flex items-center gap-1.5"><KanbanSquare className="size-4" /> Board</span> },
              { value: 'table', label: <span className="inline-flex items-center gap-1.5"><List className="size-4" /> Table</span> },
            ]}
          />
        </div>
      </div>

      {list.initialLoading ? (
        <LoadingState label="Loading work orders…" />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !orders.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white">
          <EmptyState
            icon={Wrench}
            title={query.search || query.plant || query.type || query.priority ? 'No work orders match these filters' : 'No work orders yet'}
            action={
              <RoleGate permission="maintenance:manage">
                <Button onClick={() => setForm({})}>
                  <Plus className="size-4" /> Schedule the first one
                </Button>
              </RoleGate>
            }
          >
            Work orders track preventive, corrective and inspection jobs from scheduling to completion.
          </EmptyState>
        </div>
      ) : f.view === 'board' ? (
        <div className={`grid gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-4 ${list.stale ? 'opacity-60' : ''}`}>
          {WORK_ORDER_STATUSES.map((status) => {
            const Icon = STATUS_META[status].icon
            return (
              <section key={status} className="flex flex-col rounded-xl bg-slate-100/70 p-3" aria-label={`${status} work orders`}>
                <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-slate-700">
                  <span className={`size-2 rounded-full ${STATUS_META[status].column}`} aria-hidden="true" />
                  <Icon className="size-4 text-slate-400" aria-hidden="true" />
                  {status}
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{byStatus[status].length}</span>
                </h2>
                {byStatus[status].length ? (
                  <ul className="space-y-2.5">
                    {byStatus[status].map((wo) => (
                      <WorkOrderCard
                        key={wo.id}
                        wo={wo}
                        canManage={can('maintenance:manage')}
                        onOpen={(x) => setDetail(x.id)}
                        onTransition={(workOrder, target) => setTransition({ workOrder, target })}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">Nothing here</p>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs transition-opacity ${list.stale ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Work order</th>
                <th className="px-3 py-2.5">Asset</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Priority</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Scheduled</th>
                <th className="px-3 py-2.5">Technician</th>
                <th className="px-5 py-2.5 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((wo) => (
                <tr key={wo.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(wo.id)}>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{wo.title}</p>
                    <p className="font-mono text-xs text-slate-500">{wo.workOrderNumber}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800">{wo.asset?.assetCode}</p>
                    <p className="text-xs text-slate-500">{wo.plant?.plantName}</p>
                  </td>
                  <td className="px-3 py-3"><Pill tone={TYPE_BADGE[wo.maintenanceType]}>{wo.maintenanceType}</Pill></td>
                  <td className="px-3 py-3"><Pill tone={PRIORITY_BADGE[wo.priority]}>{wo.priority}</Pill></td>
                  <td className="px-3 py-3">
                    <Pill tone={STATUS_META[wo.status].badge}>{wo.status}</Pill>
                    {isOverdue(wo) && <span className="ml-1.5 text-xs font-semibold text-red-600">Overdue</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateTime(wo.scheduledDate)}</td>
                  <td className="px-3 py-3 text-slate-600">{wo.technician || '–'}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{formatINR(wo.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <WorkOrderDetailModal
          id={detail}
          version={detailVersion}
          onClose={() => setDetail(null)}
          onTransition={(workOrder, target) => setTransition({ workOrder, target })}
          onEdit={(workOrder) => setForm({ workOrder })}
          onDelete={(workOrder) => setDeleting(workOrder)}
        />
      )}
      {form && (
        <WorkOrderFormModal
          workOrder={form.workOrder}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            afterChange()
          }}
        />
      )}
      {transition && (
        <StatusTransitionModal
          workOrder={transition.workOrder}
          target={transition.target}
          onClose={() => setTransition(null)}
          onDone={() => {
            setTransition(null)
            afterChange()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.workOrderNumber}?`}
          confirmLabel="Delete"
          tone="danger"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              toast.success(await maintenanceApi.remove(deleting.id))
              setDeleting(null)
              setDetail(null)
              reload()
            } catch (err) {
              toast.error(getErrorMessage(err))
              throw err
            }
          }}
        >
          <p>This removes the work order permanently. Only scheduled or cancelled work orders can be deleted.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

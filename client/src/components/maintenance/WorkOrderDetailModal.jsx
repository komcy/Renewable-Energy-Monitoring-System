import { Factory, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { maintenanceApi } from '@/api/maintenance'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { ErrorState, LoadingState, Pill } from '@/components/ui/States'
import { ASSET_TYPES } from '@/constants/assets'
import { formatINR, isOverdue, PRIORITY_BADGE, STATUS_META, TRANSITION_LABELS, TYPE_BADGE } from '@/constants/maintenance'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime, powerParts, timeAgo } from '@/utils/format'

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children || '–'}</dd>
    </div>
  )
}

/** Work order details, status history and the allowed next actions. */
export default function WorkOrderDetailModal({ id, version, onClose, onTransition, onEdit, onDelete }) {
  const { can } = useAuth()
  const { data: wo, error, initialLoading, reload } = useAsync(() => maintenanceApi.get(id), [id, version])
  const T = wo?.asset ? ASSET_TYPES[wo.asset.sourceType] : null
  const canManage = can('maintenance:manage')
  const open = wo && ['Scheduled', 'In Progress'].includes(wo.status)

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={wo ? `${wo.workOrderNumber} · ${wo.title}` : 'Work order'}
      description={wo ? `${wo.asset?.assetCode ?? 'Deleted asset'} · ${wo.plant?.plantName ?? ''}` : undefined}
      footer={
        wo && (
          <>
            {canManage && ['Scheduled', 'Cancelled'].includes(wo.status) && (
              <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto" onClick={() => onDelete(wo)}>
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
            {canManage && open && (
              <Button variant="secondary" onClick={() => onEdit(wo)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {canManage &&
              wo.allowedTransitions.map((t) => (
                <Button key={t} variant={t === 'Cancelled' ? 'secondary' : 'primary'} onClick={() => onTransition(wo, t)}>
                  {TRANSITION_LABELS[t]}
                </Button>
              ))}
            {(!canManage || (!open && !wo.allowedTransitions.length)) && (
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            )}
          </>
        )
      }
    >
      {initialLoading ? (
        <LoadingState />
      ) : error && !wo ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={STATUS_META[wo.status].badge}>{wo.status}</Pill>
            <Pill tone={PRIORITY_BADGE[wo.priority]}>{wo.priority} priority</Pill>
            <Pill tone={TYPE_BADGE[wo.maintenanceType]}>{wo.maintenanceType}</Pill>
            {isOverdue(wo) && <Pill tone="bg-red-50 text-red-700 ring-red-600/20">Overdue</Pill>}
            {wo.origin !== 'Manual' && <span className="text-xs text-slate-500">Raised from {wo.origin.toLowerCase()}</span>}
          </div>

          {wo.description && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{wo.description}</p>}

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Scheduled for">{formatDateTime(wo.scheduledDate, { year: 'numeric' })}</Field>
            <Field label="Technician">{wo.technician}</Field>
            <Field label="Created by">{wo.createdBy?.name}</Field>
            <Field label="Started">{wo.startedAt && formatDateTime(wo.startedAt)}</Field>
            <Field label="Completed">{wo.completedAt && `${formatDateTime(wo.completedAt)}${wo.completedBy ? ` · ${wo.completedBy.name}` : ''}`}</Field>
            <Field label="Cost">{wo.cost != null && formatINR(wo.cost)}</Field>
          </dl>

          {wo.technicianNotes && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technician notes</h3>
              <p className="mt-1.5 whitespace-pre-line rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{wo.technicianNotes}</p>
            </section>
          )}

          {wo.asset && (
            <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
              {T && (
                <span className={`grid size-10 place-items-center rounded-lg ${T.tone}`}>
                  <T.icon className="size-5" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{wo.asset.assetCode}</p>
                <p className="text-sm text-slate-500">
                  {wo.asset.name} · {T?.label} · {powerParts(wo.asset.capacity).text}
                  {wo.asset.status !== 'Active' && ' · deactivated'}
                </p>
              </div>
              {wo.plant && (
                <Link to={`/plants/${wo.plant.id}`} onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">
                  <Factory className="size-4" /> {wo.plant.plantName}
                </Link>
              )}
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status history</h3>
            <ol className="relative mt-3 space-y-4 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-slate-200">
              {wo.statusHistory.map((h, i) => (
                <li key={`${h.status}-${h.at}-${i}`} className="relative pl-6">
                  <span className={`absolute left-0 top-1.5 size-2.5 rounded-full ring-4 ring-white ${STATUS_META[h.status].column}`} />
                  <p className="text-sm font-medium text-slate-900">
                    {h.status}
                    {h.by?.name && <span className="font-normal text-slate-500"> · {h.by.name}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(h.at, { year: 'numeric' })} · {timeAgo(h.at)}
                  </p>
                  {h.note && <p className="mt-1 text-sm text-slate-600">{h.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Modal>
  )
}

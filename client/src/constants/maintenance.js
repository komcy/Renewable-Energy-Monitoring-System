import { CircleCheck, CircleDashed, CircleSlash, Clock } from 'lucide-react'

export const WORK_ORDER_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled']
export const MAINTENANCE_TYPES = ['Preventive', 'Corrective', 'Inspection']
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

export const STATUS_META = {
  Scheduled: { icon: Clock, badge: 'bg-sky-50 text-sky-700 ring-sky-600/20', column: 'bg-sky-500' },
  'In Progress': { icon: CircleDashed, badge: 'bg-amber-50 text-amber-800 ring-amber-600/20', column: 'bg-amber-500' },
  Completed: { icon: CircleCheck, badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', column: 'bg-emerald-500' },
  Cancelled: { icon: CircleSlash, badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', column: 'bg-slate-400' },
}

export const PRIORITY_BADGE = {
  Critical: 'bg-red-50 text-red-700 ring-red-600/20',
  High: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  Medium: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  Low: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export const TYPE_BADGE = {
  Preventive: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  Corrective: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  Inspection: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
}

/** Mirrors the API's allowed status changes. */
export const TRANSITIONS = {
  Scheduled: ['In Progress', 'Cancelled'],
  'In Progress': ['Completed', 'Scheduled', 'Cancelled'],
  Completed: [],
  Cancelled: ['Scheduled'],
}

export const TRANSITION_LABELS = {
  'In Progress': 'Start work',
  Completed: 'Complete',
  Scheduled: 'Move back to scheduled',
  Cancelled: 'Cancel',
}

export const isOverdue = (wo) => wo.status === 'Scheduled' && new Date(wo.scheduledDate) < new Date()

export const formatINR = (v) =>
  v == null ? '–' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)

/** Value for <input type="datetime-local"> in local time. */
export const toLocalInput = (date) => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

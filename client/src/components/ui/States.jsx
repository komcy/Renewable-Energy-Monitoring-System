import { CircleAlert, Inbox, RefreshCw } from 'lucide-react'
import { getErrorMessage } from '@/api/client'
import Button from './Button'
import Spinner from './Spinner'

export function EmptyState({ icon: Icon = Inbox, title, children, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      <span className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`} role="alert">
      <span className="grid size-11 place-items-center rounded-full bg-red-50 text-red-500">
        <CircleAlert className="size-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-900">Couldn&apos;t load this data</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  )
}

export function LoadingState({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-sm text-slate-500 ${className}`} role="status">
      <Spinner className="size-4 text-emerald-600" />
      {label}
    </div>
  )
}

/** Small ring-style status pill; `tone` is a full class string from the constants maps. */
export function Pill({ tone, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone} ${className}`}>
      {children}
    </span>
  )
}

import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { SEVERITY_DOT } from '@/constants/styles'
import { useAlerts } from '@/hooks/useAlerts'
import { timeAgo } from '@/utils/format'

const ROTATE_MS = 5000

/** Rotates through the most severe open alerts in the navbar. */
export default function AlertTicker() {
  const { latest, openCount, loading, error } = useAlerts()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (latest.length < 2) return undefined
    const timer = setInterval(() => setIndex((i) => i + 1), ROTATE_MS)
    return () => clearInterval(timer)
  }, [latest.length])

  if (loading) return null
  if (error && !latest.length) {
    return <p className="truncate text-xs text-slate-400">Alert feed unavailable</p>
  }
  if (!openCount) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CircleCheck className="size-4" aria-hidden="true" />
        All systems normal: no open alerts
      </p>
    )
  }

  const alert = latest[index % latest.length]
  if (!alert) return null
  return (
    <Link
      to="/alerts"
      className="group flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-2 pr-3 text-xs shadow-xs hover:border-slate-300"
      aria-live="polite"
    >
      <TriangleAlert className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
      <span key={alert.id} className="animate-ticker-in flex min-w-0 items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${SEVERITY_DOT[alert.severity]}`} aria-hidden="true" />
        <span className="shrink-0 font-semibold text-slate-700">{alert.asset?.assetCode ?? 'Asset'}</span>
        <span className="truncate text-slate-600">{alert.message}</span>
        <span className="hidden shrink-0 text-slate-400 xl:inline">· {timeAgo(alert.lastOccurredAt || alert.timestamp)}</span>
      </span>
    </Link>
  )
}

import { Bell, BellOff, RefreshCw } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router'
import { SeverityBadge } from '@/components/ui/Badges'
import { SEVERITY_DOT, SEVERITY_ORDER } from '@/constants/styles'
import { useAlerts } from '@/hooks/useAlerts'
import { useDismiss } from '@/hooks/useDismiss'
import { timeAgo } from '@/utils/format'

/** Bell with open-alert counter and a dropdown of the most severe alerts. */
export default function AlertBell() {
  const { summary, openCount, criticalCount, latest, refresh, lastUpdated } = useAlerts()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`${openCount} open alerts`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {openCount > 0 && (
          <span
            className={`absolute right-1 top-1 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white ${criticalCount ? 'bg-red-500' : 'bg-amber-500'}`}
          >
            {openCount > 99 ? '99+' : openCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Open alerts</p>
              <p className="text-xs text-slate-500">
                {lastUpdated ? `Updated ${timeAgo(lastUpdated)}` : 'Loading…'}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Refresh alerts"
            >
              <RefreshCw className="size-4" />
            </button>
          </div>

          {summary && (
            <div className="grid grid-cols-4 border-b border-slate-100 text-center">
              {SEVERITY_ORDER.map((s) => (
                <div key={s} className="px-2 py-2.5">
                  <p className="text-base font-semibold text-slate-900">{summary.bySeverity[s] ?? 0}</p>
                  <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                    <span className={`size-1.5 rounded-full ${SEVERITY_DOT[s]}`} />
                    {s}
                  </p>
                </div>
              ))}
            </div>
          )}

          {latest.length ? (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {latest.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-xs font-semibold text-slate-700">{a.asset?.assetCode}</span>
                    <span className="ml-auto text-[11px] text-slate-400">{timeAgo(a.lastOccurredAt || a.timestamp)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.message}</p>
                  {a.status === 'Acknowledged' && <p className="mt-1 text-[11px] font-medium text-sky-600">Acknowledged</p>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-slate-500">
              <BellOff className="size-6 text-slate-300" />
              No open alerts
            </div>
          )}

          <Link
            to="/alerts"
            onClick={close}
            className="block border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-center text-sm font-medium text-emerald-700 hover:bg-slate-100"
          >
            View alert centre
          </Link>
        </div>
      )}
    </div>
  )
}

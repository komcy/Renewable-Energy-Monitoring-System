import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

/**
 * Stat tile. `trend`: { delta: number|null, unit: '%'|'pts'|'', higherIsBetter: bool }
 * The trend always carries an arrow icon and text, never colour alone.
 */
export default function KpiCard({ icon: Icon, label, value, unit, sub, trend, tone = 'emerald' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  }

  let trendEl = null
  if (trend) {
    if (trend.delta == null) {
      trendEl = <span className="text-slate-400">No data for previous period</span>
    } else {
      const flat = Math.abs(trend.delta) < 0.05
      const up = trend.delta > 0
      const good = flat ? null : up === trend.higherIsBetter
      const Arrow = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
      const color = good == null ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-600'
      const digits = Number.isInteger(trend.delta) || Math.abs(trend.delta) >= 10 ? 0 : 1
      const amount = `${up ? '+' : ''}${trend.delta.toFixed(digits)}${trend.unit === 'pts' ? ' pts' : trend.unit}`
      trendEl = (
        <span className="inline-flex flex-wrap items-center gap-x-1">
          <span className={`inline-flex items-center gap-0.5 whitespace-nowrap font-semibold ${color}`}>
            <Arrow className="size-3.5" aria-hidden="true" />
            {flat ? 'No change' : amount}
          </span>
          <span className="whitespace-nowrap text-slate-400">vs previous period</span>
        </span>
      )
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid size-9 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
        {value}
        {unit && <span className="ml-1 text-base font-medium text-slate-500">{unit}</span>}
      </p>
      {sub && <p className="mt-1 truncate text-xs text-slate-500">{sub}</p>}
      {trendEl && <p className="mt-3 border-t border-slate-100 pt-3 text-xs">{trendEl}</p>}
    </div>
  )
}

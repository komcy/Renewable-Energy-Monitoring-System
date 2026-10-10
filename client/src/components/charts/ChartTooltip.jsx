/**
 * Recharts tooltip content. `rows(payloadItem)` → [{ label, value, color, dashed? }]
 * Values stay in text ink; the colour lives only in the swatch.
 */
export default function ChartTooltip({ active, payload, label, labelFormatter, rows, footer }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const items = rows(point)
  return (
    <div className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-slate-900">{labelFormatter ? labelFormatter(label, point) : label}</p>
      <ul className="space-y-1">
        {items.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              {r.color && (
                <svg width="12" height="8" aria-hidden="true">
                  <line x1="1" y1="4" x2="11" y2="4" stroke={r.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={r.dashed ? '3 2' : undefined} />
                </svg>
              )}
              {r.label}
            </span>
            <span className="font-semibold tabular-nums text-slate-900">{r.value}</span>
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-slate-500">{footer(point)}</p>}
    </div>
  )
}

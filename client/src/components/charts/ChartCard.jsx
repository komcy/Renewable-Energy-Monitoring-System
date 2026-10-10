import { useState } from 'react'
import SegmentedControl from '@/components/ui/SegmentedControl'

/**
 * Frame for a chart: title, HTML legend, chart/table toggle (every chart has a
 * table twin), and a dimmed state while new data loads instead of a skeleton.
 *
 * legend: [{ label, color, dashed? }]   table: { columns: [{ key, label, align?, format? }], rows }
 */
export default function ChartCard({ title, subtitle, legend, actions, stale = false, table, empty, children, className = '' }) {
  const [view, setView] = useState('chart')
  const showTable = view === 'table' && table

  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-xs ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {table && (
            <SegmentedControl
              size="sm"
              label={`${title} view`}
              value={view}
              onChange={setView}
              options={[
                { value: 'chart', label: 'Chart' },
                { value: 'table', label: 'Table' },
              ]}
            />
          )}
        </div>
      </header>

      {legend?.length > 1 && !showTable && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 px-5 pt-3 text-xs text-slate-600" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="17"
                  y2="4"
                  stroke={l.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={l.dashed ? '4 3' : undefined}
                />
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
      )}

      <div className={`relative flex-1 px-2 pb-3 pt-2 transition-opacity ${stale ? 'opacity-50' : ''}`} aria-busy={stale}>
        {empty ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center text-sm text-slate-500">
            {empty}
          </div>
        ) : showTable ? (
          <div className="max-h-80 overflow-auto px-3">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-xs text-slate-500">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.key} className={`py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
                {table.rows.map((row, i) => (
                  <tr key={row.key ?? i}>
                    {table.columns.map((c) => (
                      <td key={c.key} className={`py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                        {c.format ? c.format(row[c.key], row) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

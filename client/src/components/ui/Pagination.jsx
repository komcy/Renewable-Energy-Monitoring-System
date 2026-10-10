import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, pages, total, limit, onChange }) {
  if (!total) return null
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const btn =
    'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
      <p>
        Showing <span className="font-medium text-slate-700">{from}</span>–<span className="font-medium text-slate-700">{to}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span>
      </p>
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="size-4" /> Prev
        </button>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

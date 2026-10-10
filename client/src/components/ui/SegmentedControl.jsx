/** Compact single-choice toggle. `options`: [{ value, label, disabled?, title? }] */
export default function SegmentedControl({ label, value, onChange, options, size = 'md' }) {
  const h = size === 'sm' ? 'h-7 text-xs px-2.5' : 'h-8 text-sm px-3'
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`${h} whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

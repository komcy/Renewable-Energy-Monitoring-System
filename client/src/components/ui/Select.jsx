import { ChevronDown } from 'lucide-react'
import { useId } from 'react'

/** Styled native <select>. `options`: [{ value, label }] */
export default function Select({ label, hideLabel = false, options, error, className = '', icon: Icon, ...props }) {
  const id = useId()
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-medium text-slate-700'}>
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />}
        <select
          id={id}
          aria-invalid={Boolean(error)}
          className={`block h-10 w-full appearance-none rounded-lg border bg-white pr-9 text-sm text-slate-900 shadow-xs outline-none transition focus:ring-4 ${
            Icon ? 'pl-9' : 'pl-3'
          } ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15' : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/15'}`}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

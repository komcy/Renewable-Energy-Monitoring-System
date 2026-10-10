import { CircleAlert } from 'lucide-react'
import { useId } from 'react'

/**
 * Labelled input with optional leading icon, trailing element and error text.
 * Extra props go to the <input>.
 */
export default function FormField({ label, icon: Icon, error, hint, trailing, className = '', ...inputProps }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className={`pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 ${error ? 'text-red-400' : 'text-slate-400'}`}
            aria-hidden="true"
          />
        )}
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`block h-11 w-full rounded-lg border bg-white text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:ring-4 ${
            Icon ? 'pl-9' : 'pl-3'
          } ${trailing ? 'pr-11' : 'pr-3'} ${
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15'
              : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/15'
          }`}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

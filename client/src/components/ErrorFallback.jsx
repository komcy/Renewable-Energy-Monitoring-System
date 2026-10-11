import { House, RefreshCw, TriangleAlert } from 'lucide-react'
import Button from '@/components/ui/Button'

/** A lazy-loaded chunk that no longer exists (usually after a new deploy). */
const isChunkLoadError = (error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    String(error?.message ?? error),
  )

/** Friendly crash screen shared by the error boundary and route error elements. */
export default function ErrorFallback({ error, fullPage = false, onReset }) {
  const stale = isChunkLoadError(error)
  const message = error?.statusText || error?.message || String(error ?? 'Unknown error')
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center ${fullPage ? 'min-h-full bg-slate-50' : ''}`} role="alert">
      <span className="grid size-14 place-items-center rounded-full bg-amber-100 text-amber-600">
        <TriangleAlert className="size-7" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">{stale ? 'A new version of REMS is available' : 'Something went wrong'}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        {stale
          ? 'Part of the app was updated since this page loaded. Reload to get the latest version.'
          : 'This screen hit an unexpected error. Your data is safe; try reloading, or go back to the dashboard.'}
      </p>
      {!stale && import.meta.env.DEV && (
        <pre className="mt-4 max-w-xl overflow-auto rounded-lg bg-slate-900 px-4 py-3 text-left text-xs text-slate-100">{message}</pre>
      )}
      <div className="mt-6 flex gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            onReset?.()
            window.location.assign('/dashboard')
          }}
        >
          <House className="size-4" /> Dashboard
        </Button>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" /> Reload
        </Button>
      </div>
    </div>
  )
}

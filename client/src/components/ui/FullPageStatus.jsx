import { RefreshCw, ServerCrash } from 'lucide-react'
import Button from './Button'
import Logo from './Logo'
import Spinner from './Spinner'

export function FullPageLoader({ message = 'Loading REMS…' }) {
  return (
    <div className="grid min-h-full place-items-center bg-slate-50 p-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5">
        <Logo />
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4 text-emerald-600" />
          {message}
        </div>
      </div>
    </div>
  )
}

export function ServerUnavailable({ onRetry, onSignOut }) {
  return (
    <div className="grid min-h-full place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-100 text-amber-600">
          <ServerCrash className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Can&apos;t reach the REMS server</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your session is saved, but the API at port 5000 isn&apos;t responding. Start the backend with{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">npm run dev</code> in{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">server/</code>, then retry.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
          <Button onClick={onRetry}>
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  )
}

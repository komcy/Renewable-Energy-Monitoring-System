import { Compass } from 'lucide-react'
import { Link, useLocation } from 'react-router'

export default function NotFoundPage() {
  const { pathname } = useLocation()
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Compass className="size-7" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        Nothing lives at <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{pathname}</code>.
      </p>
      <Link to="/dashboard" className="mt-6 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
        Back to dashboard
      </Link>
    </div>
  )
}

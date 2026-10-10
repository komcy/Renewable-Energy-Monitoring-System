import { ShieldX } from 'lucide-react'
import { Link } from 'react-router'
import { RoleBadge } from '@/components/ui/Badges'
import { useAuth } from '@/hooks/useAuth'

export default function ForbiddenPage() {
  const { user } = useAuth()
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-red-50 text-red-500">
        <ShieldX className="size-7" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">You don&apos;t have access to this page</h1>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-sm text-slate-600">
        Your role is <RoleBadge role={user?.role} />. Ask an administrator if you need more access.
      </p>
      <Link to="/dashboard" className="mt-6 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
        Back to dashboard
      </Link>
    </div>
  )
}

import { ShieldCheck } from 'lucide-react'
import { ROLE_BADGE, SEVERITY_BADGE } from '@/constants/styles'

export function RoleBadge({ role, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ROLE_BADGE[role] || ROLE_BADGE.Viewer} ${className}`}
    >
      {role === 'Admin' && <ShieldCheck className="size-3" aria-hidden="true" />}
      {role}
    </span>
  )
}

export function SeverityBadge({ severity, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${SEVERITY_BADGE[severity] || SEVERITY_BADGE.Low} ${className}`}
    >
      {severity}
    </span>
  )
}

import { ChevronDown, KeyRound, LogOut } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { RoleBadge } from '@/components/ui/Badges'
import { ROLE_DESCRIPTIONS } from '@/constants/roles'
import { useAuth } from '@/hooks/useAuth'
import { useDismiss } from '@/hooks/useDismiss'
import { initials } from '@/utils/format'

const AVATAR = {
  Admin: 'bg-violet-600',
  Operator: 'bg-sky-600',
  Viewer: 'bg-slate-500',
}

export default function UserMenu({ onChangePassword }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className={`grid size-8 place-items-center rounded-full text-xs font-semibold text-white ${AVATAR[user.role]}`}>
          {initials(user.name)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-36 truncate text-sm font-semibold text-slate-800">{user.name}</span>
          <RoleBadge role={user.role} className="mt-0.5" />
        </span>
        <ChevronDown className="hidden size-4 text-slate-400 md:block" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="px-4 py-4">
            <div className="flex items-center gap-3">
              <span className={`grid size-10 place-items-center rounded-full text-sm font-semibold text-white ${AVATAR[user.role]}`}>
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <RoleBadge role={user.role} />
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{ROLE_DESCRIPTIONS[user.role]}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              close()
              onChangePassword()
            }}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <KeyRound className="size-4 text-slate-400" />
            Change password
          </button>
          <button
            type="button"
            onClick={() => logout('user')}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="size-4 text-slate-400" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

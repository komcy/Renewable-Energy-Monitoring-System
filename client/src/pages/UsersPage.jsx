import { KeyRound, LogOut, Pencil, Search, UserCheck, UserPlus, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { usersApi } from '@/api/users'
import { RoleBadge } from '@/components/ui/Badges'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PageHeader from '@/components/ui/PageHeader'
import Pagination from '@/components/ui/Pagination'
import Select from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui/States'
import TempPasswordModal from '@/components/users/TempPasswordModal'
import UserFormModal from '@/components/users/UserFormModal'
import { ROLES } from '@/constants/roles'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime, initials, timeAgo } from '@/utils/format'

const PAGE_SIZE = 20
const AVATAR = { Admin: 'bg-violet-600', Operator: 'bg-sky-600', Viewer: 'bg-slate-500' }

function IconAction({ label, icon: Icon, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <Icon className="size-4" />
    </button>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // null | {} (create) | { user }
  const [confirm, setConfirm] = useState(null)
  const [tempPassword, setTempPassword] = useState(null)

  const query = { search: search.trim() || undefined, role: role || undefined, status: status || undefined, page, limit: PAGE_SIZE }
  const { data, error, initialLoading, stale, reload } = useAsync(() => usersApi.list(query), [query])
  const users = data?.data ?? []
  const counts = data?.counts

  const setFilter = (fn) => (e) => {
    fn(e.target.value)
    setPage(1)
  }

  const askRevoke = (u) =>
    setConfirm({
      title: `Sign ${u.name} out everywhere?`,
      body: <p>Every device signed in as {u.email} will be signed out on its next request. They can sign in again with their password.</p>,
      label: 'Sign out everywhere',
      icon: LogOut,
      tone: 'danger',
      run: async () => {
        const message = await usersApi.revokeSessions(u.id)
        toast.success(message)
      },
    })

  const askReset = (u) =>
    setConfirm({
      title: `Reset ${u.name}'s password?`,
      body: (
        <>
          <p>A new temporary password will be generated and shown to you once. Their current password stops working immediately.</p>
          <p>They&apos;ll be signed out everywhere and asked to choose a new password after signing in.</p>
        </>
      ),
      label: 'Reset password',
      icon: KeyRound,
      tone: 'danger',
      run: async () => {
        const result = await usersApi.resetPassword(u.id)
        setTempPassword({ ...result, intro: `${u.name}'s password has been reset. Give them this temporary password:` })
      },
    })

  const askToggleActive = (u) =>
    setConfirm({
      title: u.isActive ? `Deactivate ${u.name}?` : `Reactivate ${u.name}?`,
      body: u.isActive ? (
        <p>They&apos;ll be signed out immediately and won&apos;t be able to sign in. Their history is kept and you can reactivate them later.</p>
      ) : (
        <p>They&apos;ll be able to sign in again with their existing password.</p>
      ),
      label: u.isActive ? 'Deactivate' : 'Reactivate',
      icon: u.isActive ? UserX : UserCheck,
      tone: u.isActive ? 'danger' : 'primary',
      run: async () => {
        const { message } = await usersApi.update(u.id, { isActive: !u.isActive })
        toast.success(u.isActive ? `${u.name} deactivated` : message)
      },
    })

  return (
    <div>
      <PageHeader
        title="Users & access"
        description="Manage who can use REMS and what they're allowed to do."
        actions={
          <Button onClick={() => setEditing({})}>
            <UserPlus className="size-4" /> Add user
          </Button>
        }
      />

      {counts && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Total users', counts.total, `${counts.active} active`],
            ['Admins', counts.byRole.Admin, 'Full access'],
            ['Operators', counts.byRole.Operator, 'Manage & respond'],
            ['Viewers', counts.byRole.Viewer, 'Read-only'],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={setFilter(setSearch)}
            placeholder="Search name or email…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>
        <Select
          label="Role"
          hideLabel
          className="sm:w-40"
          value={role}
          onChange={setFilter(setRole)}
          options={[{ value: '', label: 'All roles' }, ...Object.values(ROLES).map((r) => ({ value: r, label: r }))]}
        />
        <Select
          label="Status"
          hideLabel
          className="sm:w-44"
          value={status}
          onChange={setFilter(setStatus)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'deactivated', label: 'Deactivated' },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {initialLoading ? (
          <LoadingState label="Loading users…" />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !users.length ? (
          <EmptyState icon={Users} title="No users match these filters" />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${stale ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">User</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Last sign-in</th>
                  <th className="px-3 py-2.5">Created</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const self = u.id === me.id
                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'bg-slate-50/70'}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${u.isActive ? AVATAR[u.role] : 'bg-slate-300'}`}>
                            {initials(u.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {u.name}
                              {self && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Pill tone={u.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20'}>
                            {u.isActive ? 'Active' : 'Deactivated'}
                          </Pill>
                          {u.mustChangePassword && <span className="text-[11px] font-medium text-amber-700">Temporary password</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600" title={u.lastLogin ? formatDateTime(u.lastLogin, { year: 'numeric' }) : undefined}>
                        {u.lastLogin ? timeAgo(u.lastLogin) : <span className="text-slate-400">Never</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatDateTime(u.createdAt, { year: 'numeric', hour: undefined, minute: undefined })}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-0.5">
                          <IconAction label="Edit user" icon={Pencil} onClick={() => setEditing({ user: u })} />
                          <IconAction
                            label={self ? 'Use Change password in your account menu' : 'Reset password'}
                            icon={KeyRound}
                            disabled={self}
                            onClick={() => askReset(u)}
                          />
                          <IconAction label="Sign out everywhere" icon={LogOut} onClick={() => askRevoke(u)} />
                          <IconAction
                            label={self ? "You can't deactivate yourself" : u.isActive ? 'Deactivate' : 'Reactivate'}
                            icon={u.isActive ? UserX : UserCheck}
                            disabled={self}
                            danger={u.isActive}
                            onClick={() => askToggleActive(u)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && (
        <div className="mt-4">
          <Pagination page={data.page} pages={data.pages} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      {editing && (
        <UserFormModal
          user={editing.user}
          isSelf={editing.user?.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null)
            reload()
            if (result.temporaryPassword) {
              setTempPassword({ ...result, intro: `${result.user.name}'s account is ready. Give them this temporary password:` })
            }
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.label}
          icon={confirm.icon}
          tone={confirm.tone}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await confirm.run()
              setConfirm(null)
              reload()
            } catch (err) {
              toast.error(getErrorMessage(err))
              throw err
            }
          }}
        >
          {confirm.body}
        </ConfirmDialog>
      )}
      {tempPassword && (
        <TempPasswordModal
          user={tempPassword.user}
          password={tempPassword.temporaryPassword}
          intro={tempPassword.intro}
          onClose={() => setTempPassword(null)}
        />
      )}
    </div>
  )
}

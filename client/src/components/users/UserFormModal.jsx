import { Mail, User } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import { usersApi } from '@/api/users'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import PasswordField from '@/components/ui/PasswordField'
import { ROLE_DESCRIPTIONS, ROLES } from '@/constants/roles'
import { validateEmail, validatePassword } from '@/utils/validation'

const ROLE_LIST = Object.values(ROLES)

/**
 * Create (no `user`) or edit a user. Creating without a password issues a
 * temporary one, returned via onSaved({ user, temporaryPassword }).
 */
export default function UserFormModal({ user, isSelf, onClose, onSaved }) {
  const editing = Boolean(user)
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'Viewer',
    isActive: user?.isActive ?? true,
    passwordMode: 'temporary',
    password: '',
  })
  const [touched, setTouched] = useState({})
  const [serverErrors, setServerErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const errors = {
    name: form.name.trim() ? '' : 'Name is required',
    email: validateEmail(form.email),
    password: !editing && form.passwordMode === 'set' ? validatePassword(form.password) : '',
  }
  const show = (k) => serverErrors[k] || (touched[k] ? errors[k] : '')
  const bind = (k) => ({
    name: k,
    value: form[k],
    onChange: (e) => {
      setForm((f) => ({ ...f, [k]: e.target.value }))
      if (serverErrors[k]) setServerErrors((s) => ({ ...s, [k]: '' }))
    },
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
  })
  const roleChanged = editing && form.role !== user.role

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true })
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    try {
      if (editing) {
        const body = { name: form.name.trim(), email: form.email.trim() }
        if (!isSelf) Object.assign(body, { role: form.role, isActive: form.isActive })
        const { user: saved, message } = await usersApi.update(user.id, body)
        toast.success(message)
        onSaved({ user: saved })
      } else {
        const result = await usersApi.create({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          ...(form.passwordMode === 'set' && { password: form.password }),
        })
        toast.success(`${result.user.name} added as ${result.user.role}`)
        onSaved(result)
      }
    } catch (err) {
      if (err.response?.status === 409) setServerErrors({ email: 'An account with this email already exists' })
      toast.error(getErrorMessage(err, 'Could not save the user'))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      title={editing ? `Edit ${user.name}` : 'Add user'}
      description={editing ? user.email : 'Create an account and choose what they can do.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {editing ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" icon={User} autoComplete="off" error={show('name')} {...bind('name')} />
          <FormField label="Email" type="email" icon={Mail} autoComplete="off" error={show('email')} {...bind('email')} />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Role</legend>
          {isSelf && <p className="mb-2 text-xs text-slate-500">You can&apos;t change your own role or status.</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLE_LIST.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer flex-col rounded-lg border p-3 text-sm transition ${
                  form.role === r ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-slate-300'
                } ${isSelf ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={form.role === r}
                    disabled={isSelf}
                    onChange={() => setForm((f) => ({ ...f, role: r }))}
                    className="accent-emerald-600"
                  />
                  {r}
                </span>
                <span className="mt-1 text-xs leading-snug text-slate-500">{ROLE_DESCRIPTIONS[r]}</span>
              </label>
            ))}
          </div>
          {roleChanged && (
            <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
              The new role applies to {user.name}&apos;s very next request; their screen updates within a minute.
            </p>
          )}
        </fieldset>

        {editing ? (
          <label className={`flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3 ${isSelf ? 'opacity-60' : ''}`}>
            <span>
              <span className="block text-sm font-medium text-slate-900">Account active</span>
              <span className="block text-xs text-slate-500">Deactivated users can&apos;t sign in and are signed out immediately.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={form.isActive}
              disabled={isSelf}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="size-5 accent-emerald-600"
            />
          </label>
        ) : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Password</legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="pwmode"
                  checked={form.passwordMode === 'temporary'}
                  onChange={() => setForm((f) => ({ ...f, passwordMode: 'temporary' }))}
                  className="mt-0.5 accent-emerald-600"
                />
                <span>
                  Generate a temporary password <span className="text-slate-500">(recommended; they must change it at first sign-in)</span>
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="pwmode"
                  checked={form.passwordMode === 'set'}
                  onChange={() => setForm((f) => ({ ...f, passwordMode: 'set' }))}
                  className="accent-emerald-600"
                />
                Set a password now
              </label>
            </div>
            {form.passwordMode === 'set' && (
              <PasswordField label="Password" className="mt-3" autoComplete="new-password" placeholder="At least 8 characters" error={show('password')} {...bind('password')} />
            )}
          </fieldset>
        )}
      </form>
    </Modal>
  )
}

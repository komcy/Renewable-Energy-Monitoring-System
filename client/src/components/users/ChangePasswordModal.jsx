import { useState } from 'react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import PasswordField from '@/components/ui/PasswordField'
import { useAuth } from '@/hooks/useAuth'
import { passwordStrength, validatePassword } from '@/utils/validation'

const STRENGTH_COLORS = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600']

/** Self-service password change. Other sessions are signed out; this one continues. */
export default function ChangePasswordModal({ onClose }) {
  const { changePassword, user } = useAuth()
  const [values, setValues] = useState({ current: '', next: '', confirm: '' })
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  const errors = {
    current: values.current ? '' : 'Enter your current password',
    next:
      validatePassword(values.next) || (values.next && values.next === values.current ? 'Choose a different password from the current one' : ''),
    confirm: values.confirm !== values.next ? 'Passwords do not match' : '',
  }
  const show = (k) => (k === 'current' && serverError) || (touched[k] ? errors[k] : '')
  const bind = (k) => ({
    name: k,
    value: values[k],
    onChange: (e) => {
      setValues((v) => ({ ...v, [k]: e.target.value }))
      if (k === 'current') setServerError('')
    },
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
  })
  const strength = passwordStrength(values.next)

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ current: true, next: true, confirm: true })
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    try {
      await changePassword(values.current, values.next)
      toast.success('Password changed. Other sessions have been signed out.')
      onClose()
    } catch (err) {
      const message = getErrorMessage(err, 'Could not change your password')
      if (/current password/i.test(message)) setServerError(message)
      else toast.error(message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      busy={saving}
      title="Change password"
      description={user.mustChangePassword ? 'Replace the temporary password you were given.' : 'Other devices will be signed out.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="change-password-form" loading={saving}>
            Change password
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit} noValidate className="space-y-4">
        <PasswordField
          label={user.mustChangePassword ? 'Temporary password' : 'Current password'}
          autoComplete="current-password"
          error={show('current')}
          {...bind('current')}
        />
        <div>
          <PasswordField label="New password" autoComplete="new-password" placeholder="At least 8 characters" error={show('next')} {...bind('next')} />
          {values.next && (
            <div className="mt-2 flex items-center gap-3" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength.score ? STRENGTH_COLORS[strength.score] : 'bg-slate-200'}`} />
                ))}
              </div>
              <span className="w-16 text-right text-xs font-medium text-slate-500">{strength.label}</span>
            </div>
          )}
        </div>
        <PasswordField label="Confirm new password" autoComplete="new-password" error={show('confirm')} {...bind('confirm')} />
      </form>
    </Modal>
  )
}

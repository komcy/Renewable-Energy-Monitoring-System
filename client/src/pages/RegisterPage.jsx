import { Info, Mail, User } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router'
import { getErrorMessage } from '@/api/client'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import PasswordField from '@/components/ui/PasswordField'
import { useAuth } from '@/hooks/useAuth'
import { passwordStrength, validateEmail, validatePassword } from '@/utils/validation'

const STRENGTH_COLORS = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600']

const validate = ({ name, email, password, confirm }) => ({
  name: !name.trim() ? 'Full name is required' : name.trim().length > 100 ? 'Name is too long' : '',
  email: validateEmail(email),
  password: validatePassword(password),
  confirm: !confirm ? 'Please confirm your password' : confirm !== password ? 'Passwords do not match' : '',
})

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [touched, setTouched] = useState({})
  const [serverErrors, setServerErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const errors = validate(values)
  const showError = (field) => serverErrors[field] || (touched[field] ? errors[field] : '')
  const strength = passwordStrength(values.password)

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    if (serverErrors[name]) setServerErrors((s) => ({ ...s, [name]: '' }))
  }
  const onBlur = (e) => setTouched((t) => ({ ...t, [e.target.name]: true }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true, confirm: true })
    if (Object.values(errors).some(Boolean)) return

    setSubmitting(true)
    try {
      const user = await register(values.name, values.email, values.password)
      toast.success(`Account created. Welcome, ${user.name.split(' ')[0]}!`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const message = getErrorMessage(err, 'Registration failed')
      if (err.response?.status === 409) setServerErrors({ email: 'An account with this email already exists' })
      toast.error(message)
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
      <p className="mt-2 text-sm text-slate-600">Get read-only access to REMS monitoring data.</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        <FormField
          label="Full name"
          name="name"
          icon={User}
          autoComplete="name"
          placeholder="Priya Sharma"
          value={values.name}
          onChange={onChange}
          onBlur={onBlur}
          error={showError('name')}
          autoFocus
        />
        <FormField
          label="Email address"
          name="email"
          type="email"
          icon={Mail}
          autoComplete="email"
          placeholder="you@company.com"
          value={values.email}
          onChange={onChange}
          onBlur={onBlur}
          error={showError('email')}
        />
        <div>
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={values.password}
            onChange={onChange}
            onBlur={onBlur}
            error={showError('password')}
          />
          {values.password && (
            <div className="mt-2 flex items-center gap-3" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${i < strength.score ? STRENGTH_COLORS[strength.score] : 'bg-slate-200'}`}
                  />
                ))}
              </div>
              <span className="w-16 text-right text-xs font-medium text-slate-500">{strength.label}</span>
            </div>
          )}
        </div>
        <PasswordField
          label="Confirm password"
          name="confirm"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={values.confirm}
          onChange={onChange}
          onBlur={onBlur}
          error={showError('confirm')}
        />

        <div className="flex gap-2.5 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-inset ring-sky-600/15">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            New accounts start with the <span className="font-semibold">Viewer</span> role (read-only). An administrator
            can grant Operator or Admin access.
          </p>
        </div>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
          Sign in
        </Link>
      </p>
    </div>
  )
}

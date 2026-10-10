import { ArrowRight, Mail } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useLocation, useNavigate } from 'react-router'
import { getErrorMessage } from '@/api/client'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import PasswordField from '@/components/ui/PasswordField'
import { useAuth } from '@/hooks/useAuth'
import { validateEmail } from '@/utils/validation'

const validate = ({ email, password }) => ({
  email: validateEmail(email),
  password: password ? '' : 'Password is required',
})

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState({ email: '', password: '' })
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const errors = validate(values)
  const showError = (field) => (touched[field] ? errors[field] : '')
  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }))
  const onBlur = (e) => setTouched((t) => ({ ...t, [e.target.name]: true }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (Object.values(errors).some(Boolean)) return

    setSubmitting(true)
    try {
      const user = await login(values.email, values.password)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`)
      const from = location.state?.from?.pathname
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Sign-in failed'))
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to REMS</h1>
      <p className="mt-2 text-sm text-slate-600">Monitor your plants, assets and alerts.</p>

      {location.state?.from && !['/', '/dashboard'].includes(location.state.from.pathname) && (
        <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
          Please sign in to continue to <span className="font-medium">{location.state.from.pathname}</span>.
        </p>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
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
          autoFocus
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={values.password}
          onChange={onChange}
          onBlur={onBlur}
          error={showError('password')}
        />
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
          {!submitting && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        New to REMS?{' '}
        <Link to="/register" state={location.state} className="font-semibold text-emerald-700 hover:text-emerald-800">
          Create an account
        </Link>
      </p>
    </div>
  )
}

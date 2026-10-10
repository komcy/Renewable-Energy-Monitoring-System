import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageLoader } from '@/components/ui/FullPageStatus'
import { useAuth } from '@/hooks/useAuth'

/** Login/register pages: signed-in users are sent on to the app. */
export default function PublicOnlyRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader message="Restoring your session…" />
  if (status === 'authenticated') {
    const from = location.state?.from?.pathname
    return <Navigate to={from && from !== '/login' ? from : '/dashboard'} replace />
  }
  return <Outlet />
}

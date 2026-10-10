import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageLoader, ServerUnavailable } from '@/components/ui/FullPageStatus'
import { useAuth } from '@/hooks/useAuth'
import ForbiddenPage from '@/pages/ForbiddenPage'

/**
 * Renders its children (or nested routes) only for signed-in users.
 * With `roles`, also requires one of those roles; others see a 403 page.
 * With `permission`, uses the shared permission map instead.
 */
export default function ProtectedRoute({ roles, permission, children }) {
  const { status, user, retry, logout, hasRole, can } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader message="Restoring your session…" />
  if (status === 'unreachable') return <ServerUnavailable onRetry={retry} onSignOut={() => logout('user')} />
  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if ((roles && !hasRole(roles)) || (permission && !can(permission))) {
    return <ForbiddenPage />
  }
  return children ?? <Outlet />
}

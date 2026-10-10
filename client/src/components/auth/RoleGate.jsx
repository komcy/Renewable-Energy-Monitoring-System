import { useAuth } from '@/hooks/useAuth'

/**
 * Shows children only to permitted users.
 *   <RoleGate roles={['Admin', 'Operator']}>…</RoleGate>
 *   <RoleGate permission="assets:write" fallback={<ReadOnlyNote />}>…</RoleGate>
 */
export default function RoleGate({ roles, permission, fallback = null, children }) {
  const { hasRole, can } = useAuth()
  const allowed = (!roles || hasRole(roles)) && (!permission || can(permission))
  return allowed ? children : fallback
}

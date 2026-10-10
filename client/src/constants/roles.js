export const ROLES = {
  ADMIN: 'Admin',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
}

const { ADMIN, OPERATOR, VIEWER } = ROLES

/**
 * Permission → roles allowed. Mirrors the API's RBAC so the UI never offers
 * an action the server would reject.
 */
export const PERMISSIONS = {
  'dashboard:view': [ADMIN, OPERATOR, VIEWER],
  'plants:write': [ADMIN, OPERATOR],
  'assets:write': [ADMIN, OPERATOR],
  'telemetry:ingest': [ADMIN, OPERATOR],
  'alerts:manage': [ADMIN, OPERATOR],
  'maintenance:manage': [ADMIN, OPERATOR],
  'simulator:control': [ADMIN, OPERATOR],
  'users:manage': [ADMIN],
}

export const ROLE_DESCRIPTIONS = {
  [ADMIN]: 'Full access: users, assets, thresholds, simulator and all monitoring data.',
  [OPERATOR]: 'Manage plants and assets, ingest telemetry, handle alerts and run the simulator.',
  [VIEWER]: 'Read-only access to dashboards, telemetry, alerts and reports.',
}

import {
  Activity,
  BellRing,
  Factory,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  Sun,
  Users,
  Wrench,
} from 'lucide-react'

/** Sidebar items. `permission` hides an item from roles that can't use it. */
export const NAV_SECTIONS = [
  {
    title: 'Monitoring',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/telemetry', label: 'Telemetry', icon: Activity },
      { to: '/alerts', label: 'Alerts', icon: BellRing, badge: 'openAlerts' },
    ],
  },
  {
    title: 'Assets',
    items: [
      { to: '/plants', label: 'Plants', icon: Factory },
      { to: '/assets', label: 'Assets', icon: Sun },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench },
      { to: '/diagnostics', label: 'Diagnostics', icon: HeartPulse },
    ],
  },
  {
    title: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: FileText }],
  },
  {
    title: 'System',
    items: [
      { to: '/simulator', label: 'Simulator', icon: FlaskConical, permission: 'simulator:control' },
      { to: '/users', label: 'Users', icon: Users, permission: 'users:manage' },
    ],
  },
]

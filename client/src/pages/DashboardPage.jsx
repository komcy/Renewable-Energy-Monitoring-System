import { BellRing, Factory, FlaskConical, ShieldAlert, Sun, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { inventoryApi } from '@/api/inventory'
import RoleGate from '@/components/auth/RoleGate'
import { RoleBadge } from '@/components/ui/Badges'
import { ROLE_DESCRIPTIONS } from '@/constants/roles'
import { useAlerts } from '@/hooks/useAlerts'
import { useAuth } from '@/hooks/useAuth'
import { greeting } from '@/utils/format'

function StatCard({ icon: Icon, label, value, sub, tone = 'emerald', to }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  }
  const body = (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300">
      <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{value ?? '–'}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

/**
 * Landing page after sign-in. A placeholder overview until the analytics
 * dashboard (KPIs, charts) is built in the next phase.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const { openCount, criticalCount, loading: alertsLoading } = useAlerts()
  const [inventory, setInventory] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([inventoryApi.plantCount(), inventoryApi.assetCounts()])
      .then(([plants, assets]) => {
        if (!cancelled) setInventory({ plants, assets })
      })
      .catch(() => {
        if (!cancelled) setInventory({ plants: null, assets: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-sm text-slate-400">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {greeting()}, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-300">{ROLE_DESCRIPTIONS[user.role]}</p>
        </div>
        <RoleBadge role={user.role} className="self-start text-xs sm:self-center" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Factory} label="Energy plants" value={inventory?.plants} tone="sky" to="/plants" />
        <StatCard
          icon={Sun}
          label="Active assets"
          value={inventory?.assets?.active}
          sub={inventory?.assets ? `${inventory.assets.total} registered in total` : undefined}
          to="/assets"
        />
        <StatCard
          icon={BellRing}
          label="Open alerts"
          value={alertsLoading ? undefined : openCount}
          sub="Active or acknowledged"
          tone="amber"
          to="/alerts"
        />
        <StatCard
          icon={ShieldAlert}
          label="Critical alerts"
          value={alertsLoading ? undefined : criticalCount}
          sub={criticalCount ? 'Needs attention now' : 'None right now'}
          tone={criticalCount ? 'red' : 'emerald'}
          to="/alerts"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Generation analytics</h2>
          <p className="mt-1 text-sm text-slate-600">
            Live KPIs (current kW, total kWh, efficiency), generation trend charts and asset filters arrive with the
            analytics dashboard in the next phase.
          </p>
        </div>
        <RoleGate permission="simulator:control">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-slate-900">Operator shortcuts</h2>
            <div className="mt-3 space-y-2">
              <Link to="/simulator" className="flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline">
                <FlaskConical className="size-4" /> Run the telemetry simulator
              </Link>
              <Link to="/telemetry" className="flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline">
                <Upload className="size-4" /> Upload telemetry CSV
              </Link>
            </div>
          </div>
        </RoleGate>
      </div>
    </div>
  )
}

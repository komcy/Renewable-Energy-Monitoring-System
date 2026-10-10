import { BatteryCharging, Cable, Cpu, Sun, Wind } from 'lucide-react'

export const ASSET_TYPES = {
  SolarPanel: { label: 'Solar panel', icon: Sun, tone: 'text-amber-600 bg-amber-50' },
  WindTurbine: { label: 'Wind turbine', icon: Wind, tone: 'text-sky-600 bg-sky-50' },
  Inverter: { label: 'Inverter', icon: Cpu, tone: 'text-violet-600 bg-violet-50' },
  BatteryStorage: { label: 'Battery storage', icon: BatteryCharging, tone: 'text-emerald-600 bg-emerald-50' },
  Transformer: { label: 'Transformer', icon: Cable, tone: 'text-slate-600 bg-slate-100' },
}

export const PLANT_TYPES = ['Solar', 'Wind', 'Hybrid']
export const PLANT_STATUSES = ['Operational', 'Maintenance', 'Offline']

export const PLANT_STATUS_BADGE = {
  Operational: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Maintenance: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  Offline: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export const OPERATING_STATUS_BADGE = {
  Normal: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Degraded: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  Fault: 'bg-red-50 text-red-700 ring-red-600/20',
  Offline: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

/** A reading older than this is shown as stale rather than live. */
export const LIVE_WINDOW_MS = 15 * 60 * 1000

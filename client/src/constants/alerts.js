import {
  Activity,
  BatteryWarning,
  CircleSlash,
  Flame,
  Gauge,
  PlugZap,
  TrendingDown,
  TriangleAlert,
  WifiOff,
  Wind,
  Wrench,
} from 'lucide-react'
import { formatNumber } from '@/utils/format'

const v = (n, d = 1) => formatNumber(n, d)

/**
 * Human labels and cause explanations for each rule in the alert engine.
 * `cause(alert)` turns observed/threshold values into a sentence.
 */
export const ALERT_TYPES = {
  OutputDrop: {
    label: 'Sudden output drop',
    icon: TrendingDown,
    cause: (a) =>
      `Output fell ${v(a.observedValue)}% between consecutive readings without a matching change in sunlight or wind (limit ${v(a.thresholdValue, 0)}%).`,
  },
  ZeroGeneration: {
    label: 'Zero generation',
    icon: CircleSlash,
    cause: (a) => `The asset produced no power while conditions predicted about ${v(a.thresholdValue)} kW.`,
  },
  LowEfficiency: {
    label: 'Low efficiency',
    icon: Gauge,
    cause: (a) =>
      `Running at ${v(a.observedValue)}% of the output expected for current conditions, below the ${v(a.thresholdValue, 0)}% minimum.`,
  },
  OverTemperature: {
    label: 'Over-temperature',
    icon: Flame,
    cause: (a) => `Thermal spike: ${v(a.observedValue)}°C exceeded the ${v(a.thresholdValue, 0)}°C operating limit.`,
  },
  HighWindSpeed: {
    label: 'High wind speed',
    icon: Wind,
    cause: (a) => `Wind speed ${v(a.observedValue)} m/s is above the safe operating limit of ${v(a.thresholdValue, 0)} m/s.`,
  },
  LowStateOfCharge: {
    label: 'Low battery charge',
    icon: BatteryWarning,
    cause: (a) => `State of charge ${v(a.observedValue)}% is below the ${v(a.thresholdValue, 0)}% minimum reserve.`,
  },
  FaultStatus: {
    label: 'Device fault',
    icon: PlugZap,
    cause: () => 'The asset reported a Fault operating status.',
  },
  AssetOffline: {
    label: 'Asset offline',
    icon: WifiOff,
    cause: () => 'The asset reported an Offline operating status.',
  },
  CommunicationLoss: {
    label: 'Communication loss',
    icon: WifiOff,
    cause: () => 'No telemetry has been received from the asset.',
  },
  PredictiveFailure: {
    label: 'Predicted failure',
    icon: Wrench,
    cause: () => 'Diagnostics predict a high probability of failure.',
  },
  Other: { label: 'Other', icon: TriangleAlert, cause: () => '' },
}

export const alertTypeInfo = (type) => ALERT_TYPES[type] || { label: type, icon: Activity, cause: () => '' }

export const ALERT_STATUS_BADGE = {
  Active: 'bg-red-50 text-red-700 ring-red-600/20',
  Acknowledged: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

/** Status filter options for the Alert Center (value → API statuses) */
export const STATUS_FILTERS = [
  { value: 'open', label: 'Open', statuses: ['Active', 'Acknowledged'] },
  { value: 'active', label: 'Active', statuses: ['Active'] },
  { value: 'acknowledged', label: 'Acknowledged', statuses: ['Acknowledged'] },
  { value: 'resolved', label: 'Resolved', statuses: ['Resolved'] },
  { value: 'all', label: 'All', statuses: ['Active', 'Acknowledged', 'Resolved'] },
]

export const SEVERITY_STRIPE = {
  Critical: 'bg-red-500',
  High: 'bg-orange-500',
  Medium: 'bg-amber-400',
  Low: 'bg-sky-400',
}

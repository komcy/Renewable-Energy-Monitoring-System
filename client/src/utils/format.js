const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
]

/** "3 minutes ago", "yesterday", ... */
export function timeAgo(date) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000
  if (Number.isNaN(seconds)) return ''
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return rtf.format(Math.round(seconds / size), unit)
    }
  }
  return ''
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const nf = (digits) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits })

export function formatNumber(value, digits = 1) {
  return value == null || Number.isNaN(value) ? '–' : nf(digits).format(value)
}

/** Energy with automatic kWh → MWh → GWh scaling: { value, unit, text } */
export function energyParts(kWh) {
  if (kWh == null) return { value: '–', unit: 'kWh', text: '–' }
  const abs = Math.abs(kWh)
  const [div, unit] = abs >= 1e6 ? [1e6, 'GWh'] : abs >= 1e3 ? [1e3, 'MWh'] : [1, 'kWh']
  const value = formatNumber(kWh / div, div === 1 && abs >= 100 ? 0 : 2)
  return { value, unit, text: `${value} ${unit}` }
}

/** Power with kW → MW scaling: { value, unit, text } */
export function powerParts(kW) {
  if (kW == null) return { value: '–', unit: 'kW', text: '–' }
  const [div, unit] = Math.abs(kW) >= 1000 ? [1000, 'MW'] : [1, 'kW']
  const value = formatNumber(kW / div, div === 1 && Math.abs(kW) >= 100 ? 0 : 2)
  return { value, unit, text: `${value} ${unit}` }
}

export function formatDateTime(date, opts = {}) {
  if (!date) return '–'
  return new Date(date).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}

/** Browser timezone, passed to the API so time buckets match the user's clock. */
export const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** "SolarPanel" → "Solar panel" */
export function humanize(value = '') {
  const s = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

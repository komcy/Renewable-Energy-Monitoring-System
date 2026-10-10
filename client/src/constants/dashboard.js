export const RANGE_PRESETS = [
  { value: '24h', label: 'Last 24 hours', ms: 86_400_000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 86_400_000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 86_400_000 },
  { value: '90d', label: 'Last 90 days', ms: 90 * 86_400_000 },
  { value: 'custom', label: 'Custom range…' },
]

/** Matches the API's limit for hourly aggregation. */
export const MAX_HOURLY_DAYS = 31

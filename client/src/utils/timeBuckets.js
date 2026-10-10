/**
 * Fills missing time buckets with nulls so charts show real gaps instead of
 * drawing straight lines across hours with no data. Buckets are local-time
 * boundaries, matching the API's `timezone` (the browser's own).
 */
const floorToInterval = (date, interval) => {
  const d = new Date(date)
  d.setMinutes(0, 0, 0)
  if (interval === 'day') d.setHours(0)
  return d
}

const step = (d, interval) => {
  const next = new Date(d)
  if (interval === 'day') next.setDate(next.getDate() + 1)
  else next.setHours(next.getHours() + 1)
  return next
}

/** `make(bucketTime, row|undefined)` builds each point. Caps at `max` points. */
export function fillBuckets(rows, { from, to, interval, make, max = 1000 }) {
  const byTime = new Map(rows.map((r) => [new Date(r.bucket).getTime(), r]))
  const out = []
  for (let t = floorToInterval(from, interval); t <= to && out.length < max; t = step(t, interval)) {
    out.push(make(t.getTime(), byTime.get(t.getTime())))
  }
  // Keep any API buckets that didn't line up with local boundaries (e.g. DST shifts)
  const seen = new Set(out.map((p) => p.t))
  for (const [time, row] of byTime) if (!seen.has(time)) out.push(make(time, row))
  return out.sort((a, b) => a.t - b.t)
}

/** Axis tick label: dates at day boundaries, times otherwise. */
export function tickLabel(t, interval, multiDay) {
  const d = new Date(t)
  if (interval === 'day') return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  if (multiDay && d.getHours() === 0) return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function bucketLabel(t, interval) {
  const d = new Date(t)
  if (interval === 'day') return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const end = new Date(t + 3_600_000)
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

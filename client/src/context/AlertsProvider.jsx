import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { alertsApi } from '@/api/alerts'
import { AlertsContext } from './alertsContext'

const POLL_MS = 20_000
const TICKER_SIZE = 5

/**
 * Polls open-alert data once for the whole app shell (navbar counter,
 * ticker, sidebar badge). Pauses while the tab is hidden.
 */
export function AlertsProvider({ children }) {
  const [summary, setSummary] = useState(null)
  const [latest, setLatest] = useState([])
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const [s, active] = await Promise.all([alertsApi.summary(), alertsApi.active()])
      setSummary(s)
      setLatest(active.slice(0, TICKER_SIZE))
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err)
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    let timer
    const tick = () => {
      if (!document.hidden) refresh()
    }
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    // First fetch always runs (even in a background tab) so counts are never a
    // misleading 0; later polls skip while hidden. Deferred to run after mount.
    const first = setTimeout(refresh, 0)
    timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      summary,
      openCount: summary?.totalOpen ?? 0,
      criticalCount: summary?.bySeverity?.Critical ?? 0,
      latest,
      error,
      lastUpdated,
      loading: !summary && !error,
      refresh,
    }),
    [summary, latest, error, lastUpdated, refresh],
  )

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

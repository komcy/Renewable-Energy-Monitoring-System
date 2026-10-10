import { useCallback, useEffect, useEffectEvent, useState } from 'react'

/**
 * Runs an async function whenever `deps` change (compared by value) and keeps
 * the last successful result while a new one loads, so views can dim the old
 * data instead of flashing a skeleton.
 *
 *   const { data, error, initialLoading, stale, reload } = useAsync(() => api.get(id), [id])
 */
export function useAsync(fn, deps, { enabled = true } = {}) {
  const key = JSON.stringify(deps)
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ key: null, data: undefined, error: null })
  const run = useEffectEvent(() => fn())

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    run().then(
      (data) => {
        if (!cancelled) setState({ key, data, error: null })
      },
      (error) => {
        if (!cancelled) setState((s) => ({ key, data: s.data, error }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, nonce, enabled])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    initialLoading: enabled && state.data === undefined && state.key !== key,
    // Deps changed and the matching result hasn't arrived yet
    stale: enabled && state.data !== undefined && state.key !== key,
    reload,
  }
}

/** Calls `callback` every `ms` while the tab is visible. */
export function usePolling(callback, ms, { enabled = true } = {}) {
  const tick = useEffectEvent(() => {
    if (!document.hidden) callback()
  })
  useEffect(() => {
    if (!enabled || !ms) return undefined
    const timer = setInterval(tick, ms)
    return () => clearInterval(timer)
  }, [ms, enabled])
}

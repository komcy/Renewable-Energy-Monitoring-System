import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import { tokenStorage, UNAUTHORIZED_EVENT } from '@/api/client'
import { PERMISSIONS } from '@/constants/roles'
import { isTokenExpired, tokenExpiry } from '@/utils/jwt'
import { AuthContext } from './authContext'

/** Stored token if still valid; clears an expired one. */
function readStoredToken() {
  const token = tokenStorage.get()
  if (token && isTokenExpired(token)) {
    tokenStorage.clear()
    return null
  }
  return token
}

/**
 * Holds the signed-in user and JWT.
 * status: 'loading' (verifying a stored token) | 'authenticated' | 'anonymous'
 *         | 'unreachable' (a token exists but the API could not be reached)
 */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStoredToken)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (token ? 'loading' : 'anonymous'))
  const [attempt, setAttempt] = useState(0)

  const logout = useCallback((reason) => {
    tokenStorage.clear()
    setToken(null)
    setUser(null)
    setStatus('anonymous')
    if (reason === 'expired') {
      toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' })
    } else if (reason === 'user') {
      toast.success('You have been signed out.', { id: 'signed-out' })
    }
  }, [])

  // Verify a stored token on load (and on retry)
  useEffect(() => {
    const stored = tokenStorage.get()
    if (!stored) return undefined
    let cancelled = false
    authApi
      .me()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch((err) => {
        if (cancelled) return
        const code = err.response?.status
        if (code === 401 || code === 403) logout('expired')
        else setStatus('unreachable')
      })
    return () => {
      cancelled = true
    }
  }, [attempt, logout])

  // Sign out when the token's own expiry time is reached
  useEffect(() => {
    if (!token) return undefined
    const exp = tokenExpiry(token)
    if (!exp) return undefined
    const timer = setTimeout(() => logout('expired'), Math.max(exp - Date.now(), 0))
    return () => clearTimeout(timer)
  }, [token, logout])

  // Re-sync the user every minute and when the tab regains focus, so a role
  // change by an Admin shows up in the UI without signing out
  useEffect(() => {
    if (status !== 'authenticated') return undefined
    const sync = () => {
      if (document.hidden) return
      authApi
        .me()
        .then((me) => {
          setUser((prev) => {
            if (prev && me.role !== prev.role) {
              toast(`Your role is now ${me.role}`, { id: 'role-changed', icon: '🔑' })
            }
            return me
          })
        })
        .catch(() => {
          /* 401s are handled by the interceptor; ignore network blips */
        })
    }
    const timer = setInterval(sync, 60_000)
    window.addEventListener('focus', sync)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', sync)
    }
  }, [status])

  // Any API call rejected with 401 means the token is no longer accepted
  useEffect(() => {
    const onUnauthorized = () => logout('expired')
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [logout])

  const startSession = useCallback(({ token: newToken, user: newUser }) => {
    tokenStorage.set(newToken)
    setToken(newToken)
    setUser(newUser)
    setStatus('authenticated')
    return newUser
  }, [])

  const login = useCallback(
    async (email, password) => startSession(await authApi.login(email.trim(), password)),
    [startSession],
  )

  const register = useCallback(
    async (name, email, password) => startSession(await authApi.register(name.trim(), email.trim(), password)),
    [startSession],
  )

  const changePassword = useCallback(
    async (currentPassword, newPassword) => startSession(await authApi.changePassword(currentPassword, newPassword)),
    [startSession],
  )

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  const hasRole = useCallback((...roles) => Boolean(user && roles.flat().includes(user.role)), [user])
  const can = useCallback((permission) => Boolean(user && PERMISSIONS[permission]?.includes(user.role)), [user])

  const value = useMemo(
    () => ({
      user,
      token,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      register,
      logout,
      changePassword,
      retry,
      hasRole,
      can,
    }),
    [user, token, status, login, register, logout, changePassword, retry, hasRole, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

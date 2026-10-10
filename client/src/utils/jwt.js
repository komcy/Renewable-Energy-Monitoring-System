/** Reads the `exp` claim (ms since epoch) from a JWT without verifying it. */
export function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(payload))
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export function isTokenExpired(token, skewMs = 5000) {
  const exp = tokenExpiry(token)
  return exp === null || exp - skewMs <= Date.now()
}

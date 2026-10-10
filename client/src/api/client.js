import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const TOKEN_KEY = 'rems_token'

/** localStorage wrapper that never throws (private mode, blocked storage). */
export const tokenStorage = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

/** Fired when an authenticated request comes back 401 (expired/revoked token). */
export const UNAUTHORIZED_EVENT = 'rems:unauthorized'

const api = axios.create({ baseURL: API_URL, timeout: 20000 })

api.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const sentToken = Boolean(error.config?.headers?.Authorization)
    if (error.response?.status === 401 && sentToken) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    }
    return Promise.reject(error)
  },
)

/** Human-readable message from an API/network error. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error?.response) {
    if (error?.code === 'ECONNABORTED') return 'The server took too long to respond.'
    return 'Cannot reach the REMS server. Make sure the backend is running on port 5000.'
  }
  const data = error.response.data
  if (Array.isArray(data?.details) && typeof data.details[0]?.message === 'string') {
    return data.details.map((d) => d.message).join('. ')
  }
  return data?.message || fallback
}

export default api

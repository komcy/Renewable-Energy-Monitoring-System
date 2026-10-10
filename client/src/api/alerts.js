import api from './client'

export const alertsApi = {
  async summary() {
    const { data } = await api.get('/alerts/summary')
    return data.data
  },
  async active() {
    const { data } = await api.get('/alerts/active')
    return data.data
  },
  /** Paged list. params: { status, severity, alertType, plant, asset, page, limit } (lists comma-joined) */
  async list(params) {
    const { data } = await api.get('/alerts', { params })
    return data
  },
  /** Counts by severity for the same filters (status defaults to open). */
  async counts(params) {
    const { data } = await api.get('/alerts/counts', { params })
    return data.data
  },
  async get(id) {
    const { data } = await api.get(`/alerts/${id}`)
    return data.data
  },
  async acknowledge(id) {
    const { data } = await api.patch(`/alerts/${id}/acknowledge`)
    return data.data
  },
  async resolve(id, resolutionNotes) {
    const { data } = await api.patch(`/alerts/${id}/resolve`, { resolutionNotes })
    return data.data
  },
}

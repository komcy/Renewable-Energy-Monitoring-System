import api from './client'

export const diagnosticsApi = {
  /** Fleet ranked by risk (lowest health first) */
  async fleet() {
    const { data } = await api.get('/maintenance/diagnostics')
    return data.data
  },
  /** Evaluate only: no records are created (any role) */
  async get(assetId) {
    const { data } = await api.get(`/maintenance/diagnostics/${assetId}`)
    return data.data
  },
  /** Evaluate and schedule a predictive work order when risk is High (Admin, Operator) */
  async evaluate(assetId) {
    const { data } = await api.post(`/maintenance/diagnostics/${assetId}/evaluate`)
    return data.data
  },
  async rootCause(alertId) {
    const { data } = await api.get(`/maintenance/diagnostics/alerts/${alertId}`)
    return data.data
  },
}

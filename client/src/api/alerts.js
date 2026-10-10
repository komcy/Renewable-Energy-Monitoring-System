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
}

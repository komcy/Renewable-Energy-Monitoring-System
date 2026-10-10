import api from './client'

export const GENERATING_TYPES = ['SolarPanel', 'WindTurbine']

export const analyticsApi = {
  async dashboard(params) {
    const { data } = await api.get('/analytics/dashboard', { params })
    return data.data
  },
}

export const telemetryApi = {
  /** Time-bucketed averages. params: { interval, plant?, asset?, from, to, timezone, sourceType? } */
  async aggregate({ sourceType, ...params }) {
    const { data } = await api.get('/telemetry/aggregate', {
      params: { ...params, ...(sourceType && { sourceType: sourceType.join(',') }) },
    })
    return data.data
  },
  /** Newest reading per asset, optionally for one plant. */
  async latest(plant) {
    const { data } = await api.get('/telemetry/latest', { params: plant ? { plant } : {} })
    return data.data
  },
}

import api from './client'

export const simulatorApi = {
  async status() {
    const { data } = await api.get('/simulator/status')
    return data.data
  },
  async start(config) {
    const { data } = await api.post('/simulator/start', config)
    return data.data
  },
  async stop() {
    const { data } = await api.post('/simulator/stop')
    return data
  },
  /** { assetCode, type, ticks } → { assetCode, type, ticks, note? } */
  async injectAnomaly(body) {
    const { data } = await api.post('/simulator/anomaly', body)
    return data.data
  },
}

import api from './client'

/** Lightweight counts for overview widgets. */
export const inventoryApi = {
  async plantCount() {
    const { data } = await api.get('/plants', { params: { limit: 1 } })
    return data.total
  },
  async assetCounts() {
    const [all, active] = await Promise.all([
      api.get('/assets', { params: { limit: 1 } }),
      api.get('/assets', { params: { limit: 1, status: 'Active' } }),
    ])
    return { total: all.data.total, active: active.data.total }
  },
}

import api from './client'

export const plantsApi = {
  async list(params = {}) {
    const { data } = await api.get('/plants', { params: { limit: 100, ...params } })
    return data
  },
  async get(id) {
    const { data } = await api.get(`/plants/${id}`)
    return data.data
  },
  async create(body) {
    const { data } = await api.post('/plants', body)
    return data.data
  },
  async update(id, body) {
    const { data } = await api.put(`/plants/${id}`, body)
    return data.data
  },
}

export const assetsApi = {
  async list(params = {}) {
    const { data } = await api.get('/assets', { params: { limit: 500, ...params } })
    return data.data
  },
  /** Paged list with totals: { total, page, pages, data } */
  async page(params = {}) {
    const { data } = await api.get('/assets', { params })
    return data
  },
  async get(id) {
    const { data } = await api.get(`/assets/${id}`)
    return data.data
  },
  async create(body) {
    const { data } = await api.post('/assets', body)
    return data.data
  },
  async update(id, body) {
    const { data } = await api.put(`/assets/${id}`, body)
    return data.data
  },
  async remove(id) {
    await api.delete(`/assets/${id}`)
  },
  async setStatus(id, status) {
    const { data } = await api.patch(`/assets/${id}/status`, { status })
    return data.data
  },
}

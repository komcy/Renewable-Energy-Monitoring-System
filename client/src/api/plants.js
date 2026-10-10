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
  async setStatus(id, status) {
    const { data } = await api.patch(`/assets/${id}/status`, { status })
    return data.data
  },
}

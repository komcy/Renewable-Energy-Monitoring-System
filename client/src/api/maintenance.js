import api from './client'

export const maintenanceApi = {
  async list(params) {
    const { data } = await api.get('/maintenance', { params })
    return data
  },
  async summary(params) {
    const { data } = await api.get('/maintenance/summary', { params })
    return data.data
  },
  async get(id) {
    const { data } = await api.get(`/maintenance/${id}`)
    return data.data
  },
  async create(body) {
    const { data } = await api.post('/maintenance', body)
    return data.data
  },
  async update(id, body) {
    const { data } = await api.put(`/maintenance/${id}`, body)
    return data.data
  },
  /** body: { status, note?, technicianNotes?, cost?, completedAt? } */
  async setStatus(id, body) {
    const { data } = await api.patch(`/maintenance/${id}/status`, body)
    return data.data
  },
  async remove(id) {
    const { data } = await api.delete(`/maintenance/${id}`)
    return data.message
  },
}

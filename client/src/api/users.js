import api from './client'

export const usersApi = {
  async list(params) {
    const { data } = await api.get('/users', { params })
    return data
  },
  /** Returns { user, temporaryPassword? } — a temporary password is issued when none is given. */
  async create(body) {
    const { data } = await api.post('/users', body)
    return { user: data.data, temporaryPassword: data.temporaryPassword }
  },
  async update(id, body) {
    const { data } = await api.put(`/users/${id}`, body)
    return { user: data.data, message: data.message }
  },
  async revokeSessions(id) {
    const { data } = await api.post(`/users/${id}/revoke-sessions`)
    return data.message
  },
  async resetPassword(id) {
    const { data } = await api.post(`/users/${id}/reset-password`)
    return { user: data.data, temporaryPassword: data.temporaryPassword }
  },
}

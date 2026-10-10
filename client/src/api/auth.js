import api from './client'

export const authApi = {
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    return { token: data.token, user: data.user }
  },
  async register(name, email, password) {
    const { data } = await api.post('/auth/register', { name, email, password })
    return { token: data.token, user: data.user }
  },
  async me() {
    const { data } = await api.get('/auth/me')
    return data.user
  },
}

import api from './client'

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

/** Filename from a Content-Disposition header, with a fallback. */
function fileNameFrom(header, fallback) {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header || '')
  if (star) return decodeURIComponent(star[1])
  const plain = /filename="?([^";]+)"?/i.exec(header || '')
  return plain ? plain[1] : fallback
}

export const reportsApi = {
  async list(params) {
    const { data } = await api.get('/reports', { params })
    return data
  },
  async get(id) {
    const { data } = await api.get(`/reports/${id}`)
    return data.data
  },
  /** body: { reportType, plant?, from, to, granularity, timezone } */
  async generate(body) {
    const { data } = await api.post('/reports', body, { timeout: 5 * 60 * 1000 })
    return data.data
  },
  async remove(id) {
    const { data } = await api.delete(`/reports/${id}`)
    return data.message
  },
  /** Fetches the file with the auth header and hands it to the browser as a download. */
  async download(id, format = 'csv') {
    const res = await api.get(`/reports/${id}/download`, { params: { format }, responseType: 'blob', timeout: DOWNLOAD_TIMEOUT_MS })
    const name = fileNameFrom(res.headers['content-disposition'], `rems-report.${format}`)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return { name, size: res.data.size }
  },
}

import api from './client'

export const GENERATING_TYPES = ['SolarPanel', 'WindTurbine']

const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000

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
  /** Paged raw readings. params: { plant, asset, from, to, status, source, sortBy, sort, page, limit } */
  async list(params) {
    const { data } = await api.get('/telemetry', { params })
    return data
  },
  /**
   * Streams a CSV to the server. `onProgress(fraction)` reports upload progress;
   * the promise resolves with the ingestion summary once the server finishes.
   * A file with no valid rows comes back as a 400 that still carries the summary.
   */
  async upload(file, { onProgress, signal } = {}) {
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await api.post('/telemetry/upload', form, {
        timeout: UPLOAD_TIMEOUT_MS,
        signal,
        onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
      })
      return { ok: true, message: data.message, summary: data.data }
    } catch (error) {
      const body = error.response?.data
      if (body?.data?.totalRows !== undefined) return { ok: false, message: body.message, summary: body.data }
      throw error
    }
  },
}

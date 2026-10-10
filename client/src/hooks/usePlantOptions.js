import { plantsApi } from '@/api/plants'
import { useAsync } from './useAsync'

/** Plants for filter dropdowns (id + name), loaded once per mount. */
export function usePlantOptions() {
  const { data } = useAsync(() => plantsApi.list({ limit: 200 }), [])
  return data?.data ?? []
}

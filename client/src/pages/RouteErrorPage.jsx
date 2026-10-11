import { useRouteError } from 'react-router'
import ErrorFallback from '@/components/ErrorFallback'

/** Route-level errorElement: page crashes render inside the app shell. */
export default function RouteErrorPage({ fullPage = false }) {
  const error = useRouteError()
  console.error('[REMS] Route error', error)
  return <ErrorFallback error={error} fullPage={fullPage} />
}

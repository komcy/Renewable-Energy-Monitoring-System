import { useContext } from 'react'
import { AlertsContext } from '@/context/alertsContext'

export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) throw new Error('useAlerts must be used inside <AlertsProvider>')
  return ctx
}

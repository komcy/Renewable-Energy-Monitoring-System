import { lazy } from 'react'

// Data-heavy pages (charts) load on demand; AppLayout wraps the outlet in <Suspense>
export const DashboardPage = lazy(() => import('./DashboardPage'))
export const PlantsPage = lazy(() => import('./PlantsPage'))
export const PlantDetailPage = lazy(() => import('./PlantDetailPage'))
export const AlertsPage = lazy(() => import('./AlertsPage'))

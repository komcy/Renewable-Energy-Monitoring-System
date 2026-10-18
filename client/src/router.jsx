import { createBrowserRouter, Navigate } from 'react-router'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PublicOnlyRoute from '@/components/auth/PublicOnlyRoute'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import {
  AlertsPage,
  AssetsPage,
  DashboardPage,
  MaintenancePage,
  PredictiveMaintenancePage,
  PlantDetailPage,
  PlantsPage,
  ReportsPage,
  SimulatorPage,
  TelemetryPage,
  UsersPage,
} from '@/pages/lazyPages'
import NotFoundPage from '@/pages/NotFoundPage'
import RegisterPage from '@/pages/RegisterPage'
import RouteErrorPage from '@/pages/RouteErrorPage'

export const router = createBrowserRouter([
  // Public marketing page, reachable whether or not you're signed in
  { path: '/welcome', element: <LandingPage />, errorElement: <RouteErrorPage fullPage /> },

  // Public: signed-in users are redirected to the dashboard
  {
    element: <PublicOnlyRoute />,
    errorElement: <RouteErrorPage fullPage />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },

  // Protected app shell
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage fullPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            // Page errors render inside the shell, so navigation keeps working
            errorElement: <RouteErrorPage />,
            children: [
              { path: '/', element: <Navigate to="/dashboard" replace /> },
              { path: '/dashboard', element: <DashboardPage />, handle: { crumb: 'Dashboard' } },
              { path: '/telemetry', element: <TelemetryPage />, handle: { crumb: 'Telemetry' } },
              { path: '/alerts', element: <AlertsPage />, handle: { crumb: 'Alerts' } },
              {
                path: '/plants',
                handle: { crumb: 'Plants' },
                children: [
                  { index: true, element: <PlantsPage /> },
                  { path: ':id', element: <PlantDetailPage />, handle: { crumb: 'Plant details' } },
                ],
              },
              { path: '/assets', element: <AssetsPage />, handle: { crumb: 'Assets' } },
              { path: '/maintenance', element: <MaintenancePage />, handle: { crumb: 'Maintenance' } },
              { path: '/diagnostics', element: <PredictiveMaintenancePage />, handle: { crumb: 'Predictive maintenance' } },
              { path: '/reports', element: <ReportsPage />, handle: { crumb: 'Reports' } },
              {
                path: '/simulator',
                handle: { crumb: 'Simulator' },
                element: (
                  <ProtectedRoute permission="simulator:control">
                    <SimulatorPage />
                  </ProtectedRoute>
                ),
              },
              {
                path: '/users',
                handle: { crumb: 'Users' },
                element: (
                  <ProtectedRoute permission="users:manage">
                    <UsersPage />
                  </ProtectedRoute>
                ),
              },
              { path: '*', element: <NotFoundPage />, handle: { crumb: 'Not found' } },
            ],
          },
        ],
      },
    ],
  },
])

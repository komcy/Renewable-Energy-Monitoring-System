import { createBrowserRouter, Navigate } from 'react-router'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PublicOnlyRoute from '@/components/auth/PublicOnlyRoute'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import ComingSoonPage from '@/pages/ComingSoonPage'
import LoginPage from '@/pages/LoginPage'
import {
  AlertsPage,
  DashboardPage,
  MaintenancePage,
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
              {
                path: '/assets',
                handle: { crumb: 'Assets' },
                element: (
                  <ComingSoonPage
                    title="Assets"
                    description="Register and edit panels, turbines, inverters, batteries and transformers with their thresholds. Until then, manage asset status from each plant's page."
                    phase="Asset management"
                  />
                ),
              },
              { path: '/maintenance', element: <MaintenancePage />, handle: { crumb: 'Maintenance' } },
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

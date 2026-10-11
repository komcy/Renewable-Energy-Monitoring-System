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
  PlantDetailPage,
  PlantsPage,
  SimulatorPage,
  TelemetryPage,
  UsersPage,
} from '@/pages/lazyPages'
import NotFoundPage from '@/pages/NotFoundPage'
import RegisterPage from '@/pages/RegisterPage'

const soon = (title, description, phase) => <ComingSoonPage title={title} description={description} phase={phase} />

export const router = createBrowserRouter([
  // Public: signed-in users are redirected to the dashboard
  {
    element: <PublicOnlyRoute />,
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
    children: [
      {
        element: <AppLayout />,
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
            element: soon('Assets', 'Panels, turbines, inverters, batteries and transformers with status and thresholds.', 'Asset management phase'),
          },
          {
            path: '/maintenance',
            handle: { crumb: 'Maintenance' },
            element: soon('Predictive maintenance', 'Asset health index, failure probability and maintenance work orders.', 'Maintenance phase'),
          },
          {
            path: '/reports',
            handle: { crumb: 'Reports' },
            element: soon('Reports', 'Daily, weekly and monthly performance reports with CSV and PDF export.', 'Reporting phase'),
          },
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
])

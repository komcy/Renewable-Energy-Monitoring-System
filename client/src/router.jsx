import { createBrowserRouter, Navigate } from 'react-router'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PublicOnlyRoute from '@/components/auth/PublicOnlyRoute'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import ComingSoonPage from '@/pages/ComingSoonPage'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
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
          {
            path: '/telemetry',
            handle: { crumb: 'Telemetry' },
            element: soon('Telemetry', 'Browse historical readings, chart trends and upload CSV telemetry.', 'Analytics phase'),
          },
          {
            path: '/alerts',
            handle: { crumb: 'Alerts' },
            element: soon('Alert centre', 'Filter, acknowledge and resolve fault alerts raised by the detection engine.', 'Alert centre phase'),
          },
          {
            path: '/plants',
            handle: { crumb: 'Plants' },
            element: soon('Energy plants', 'Register and manage solar, wind and hybrid plants.', 'Asset management phase'),
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
                {soon('Telemetry simulator', 'Start, stop and inject anomalies into the live telemetry simulator.', 'Simulator UI phase')}
              </ProtectedRoute>
            ),
          },
          {
            path: '/users',
            handle: { crumb: 'Users' },
            element: (
              <ProtectedRoute permission="users:manage">
                {soon('User management', 'Invite users and assign Admin, Operator or Viewer roles.', 'Administration phase')}
              </ProtectedRoute>
            ),
          },
          { path: '*', element: <NotFoundPage />, handle: { crumb: 'Not found' } },
        ],
      },
    ],
  },
])

import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import Breadcrumbs from '@/components/layout/Breadcrumbs'
import Navbar from '@/components/layout/Navbar'
import Sidebar from '@/components/layout/Sidebar'
import { AlertsProvider } from '@/context/AlertsProvider'

const COLLAPSE_KEY = 'rems_sidebar_collapsed'

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** Authenticated shell: sidebar + navbar + breadcrumbs around the page. */
export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }, [collapsed])

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <AlertsProvider>
      <div className="min-h-full">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={closeMobile}
        />
        <div className={`flex min-h-full flex-col transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}>
          <Navbar onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <Breadcrumbs />
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AlertsProvider>
  )
}

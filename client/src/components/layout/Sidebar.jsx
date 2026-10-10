import { ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { NavLink } from 'react-router'
import Logo from '@/components/ui/Logo'
import { NAV_SECTIONS } from '@/constants/navigation'
import { useAlerts } from '@/hooks/useAlerts'
import { useAuth } from '@/hooks/useAuth'

function NavItem({ item, collapsed, badgeCount, onNavigate }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
          isActive ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
        } ${collapsed ? 'justify-center px-0' : ''}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald-400" aria-hidden="true" />}
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {badgeCount > 0 &&
            (collapsed ? (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-slate-900" />
            ) : (
              <span className="ml-auto rounded-full bg-red-500 px-1.5 py-px text-[11px] font-semibold text-white">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            ))}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ collapsed, onToggleCollapse, onNavigate, onClose }) {
  const { can } = useAuth()
  const { openCount } = useAlerts()
  const badges = { openAlerts: openCount }

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <div className={`flex h-16 shrink-0 items-center border-b border-white/5 ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
        <Logo collapsed={collapsed} light />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.permission || can(i.permission))
          if (!items.length) return null
          return (
            <div key={section.title}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden="true" />
              ) : (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
              )}
              <div className="space-y-1">
                {items.map((item) => (
                  <NavItem
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    badgeCount={item.badge ? badges[item.badge] : 0}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {onToggleCollapse && (
        <div className="border-t border-white/5 p-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white ${collapsed ? 'justify-center px-0' : ''}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Desktop: fixed, collapsible rail. Mobile: off-canvas drawer. */
export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }) {
  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block ${collapsed ? 'w-[72px]' : 'w-64'}`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      </aside>

      <div className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? '' : 'pointer-events-none'}`} aria-hidden={!mobileOpen}>
        <div
          className={`absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onMobileClose}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <SidebarContent collapsed={false} onNavigate={onMobileClose} onClose={onMobileClose} />
        </aside>
      </div>
    </>
  )
}

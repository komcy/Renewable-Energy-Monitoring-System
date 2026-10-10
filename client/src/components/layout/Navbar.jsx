import { Menu } from 'lucide-react'
import AlertBell from './AlertBell'
import AlertTicker from './AlertTicker'
import UserMenu from './UserMenu'

export default function Navbar({ onOpenMobileNav }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <div className="hidden min-w-0 flex-1 md:flex">
        <AlertTicker />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <AlertBell />
        <div className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />
        <UserMenu />
      </div>
    </header>
  )
}

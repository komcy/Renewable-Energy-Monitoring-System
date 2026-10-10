import { BellRing, ChartLine, ShieldCheck, Sun, Wind } from 'lucide-react'
import { Outlet } from 'react-router'
import Logo from '@/components/ui/Logo'

const FEATURES = [
  { icon: ChartLine, title: 'Live generation monitoring', text: 'Solar, wind, storage and grid assets in one view.' },
  { icon: BellRing, title: 'Automatic fault alerts', text: 'Rule-based detection of drops, overheating and low efficiency.' },
  { icon: ShieldCheck, title: 'Role-based access', text: 'Administrators, operators and viewers see what they need.' },
]

/** Split-screen layout for login and registration. */
export default function AuthLayout() {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-slate-900 px-12 py-10 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-emerald-500/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-sky-500/10 blur-3xl"
          aria-hidden="true"
        />
        <Logo light />
        <div className="relative my-auto max-w-md">
          <div className="mb-6 flex gap-2 text-emerald-300">
            <Sun className="size-6" />
            <Wind className="size-6" />
          </div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Every kilowatt, every asset, <span className="text-emerald-400">one dashboard.</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Track energy generation, catch faults early and keep your renewable plants performing at their best.
          </p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-emerald-300 ring-1 ring-white/10">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-slate-400">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} REMS · Software Engineering Lab</p>
      </section>

      <section className="flex flex-col justify-center bg-white px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <Outlet />
        </div>
      </section>
    </div>
  )
}

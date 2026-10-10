import { Zap } from 'lucide-react'

export default function Logo({ collapsed = false, light = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-900/20">
        <Zap className="size-5" fill="currentColor" strokeWidth={1.5} />
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className={`block text-base font-bold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>REMS</span>
          <span className={`block text-[11px] font-medium ${light ? 'text-slate-400' : 'text-slate-500'}`}>
            Renewable Energy Monitoring
          </span>
        </span>
      )}
    </div>
  )
}

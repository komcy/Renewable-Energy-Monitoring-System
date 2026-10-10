import { Construction } from 'lucide-react'

/** Placeholder for sections whose UI is built in a later phase. */
export default function ComingSoonPage({ title, description, phase }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Construction className="size-6" />
        </span>
        <p className="mt-4 font-semibold text-slate-900">This screen is on the way</p>
        <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>
        {phase && (
          <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{phase}</span>
        )}
      </div>
    </div>
  )
}

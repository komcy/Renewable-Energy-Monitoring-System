import { ChevronRight, House } from 'lucide-react'
import { useContext } from 'react'
import { Link, useMatches } from 'react-router'
import { BreadcrumbContext } from '@/context/breadcrumbContext'

/**
 * Built from route `handle.crumb` (string or (match) => string). Pages can
 * override their own label with useBreadcrumbLabel (e.g. a plant's name).
 */
export default function Breadcrumbs() {
  const matches = useMatches()
  const { labels } = useContext(BreadcrumbContext)
  const crumbs = matches
    .filter((m) => m.handle?.crumb)
    .map((m) => ({
      path: m.pathname,
      label: labels[m.pathname] || (typeof m.handle.crumb === 'function' ? m.handle.crumb(m) : m.handle.crumb),
    }))

  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        <li>
          <Link to="/dashboard" className="flex items-center hover:text-slate-700" aria-label="Home">
            <House className="size-4" />
          </Link>
        </li>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={c.path} className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5 text-slate-300" aria-hidden="true" />
              {last ? (
                <span className="font-medium text-slate-800" aria-current="page">
                  {c.label}
                </span>
              ) : (
                <Link to={c.path} className="hover:text-slate-700">
                  {c.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

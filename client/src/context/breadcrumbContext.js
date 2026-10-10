import { createContext, useContext, useEffect } from 'react'

/** Lets a page replace its breadcrumb label with loaded data (e.g. a plant name). */
export const BreadcrumbContext = createContext({ labels: {}, setLabel: () => {} })

export function useBreadcrumbLabel(pathname, label) {
  const { setLabel } = useContext(BreadcrumbContext)
  useEffect(() => {
    if (!label) return undefined
    setLabel(pathname, label)
    return () => setLabel(pathname, undefined)
  }, [pathname, label, setLabel])
}

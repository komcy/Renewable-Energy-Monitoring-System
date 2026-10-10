import { CalendarRange, Factory, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Select from '@/components/ui/Select'
import { MAX_HOURLY_DAYS, RANGE_PRESETS } from '@/constants/dashboard'

const inputCls =
  'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15'

/** One filter row above the charts it scopes: plant, range, interval. */
export default function FilterBar({ filters, onChange, plants, hourlyAllowed, onRefresh, refreshing }) {
  const set = (patch) => onChange({ ...filters, ...patch })
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs lg:flex-row lg:items-center">
      <Select
        label="Plant"
        hideLabel
        icon={Factory}
        className="lg:w-60"
        value={filters.plant}
        onChange={(e) => set({ plant: e.target.value })}
        options={[{ value: '', label: 'All plants' }, ...plants.map((p) => ({ value: p.id, label: p.plantName }))]}
      />
      <Select
        label="Date range"
        hideLabel
        icon={CalendarRange}
        className="lg:w-52"
        value={filters.range}
        onChange={(e) => {
          const range = e.target.value
          if (range === 'custom' && !filters.from) {
            const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
            set({ range, from, to: today })
          } else set({ range })
        }}
        options={RANGE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
      />
      {filters.range === 'custom' && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="range-from">From</label>
          <input
            id="range-from"
            type="date"
            className={inputCls}
            value={filters.from}
            max={filters.to || today}
            onChange={(e) => e.target.value && set({ from: e.target.value })}
          />
          <span className="text-sm text-slate-400">to</span>
          <label className="sr-only" htmlFor="range-to">To</label>
          <input
            id="range-to"
            type="date"
            className={inputCls}
            value={filters.to}
            min={filters.from}
            max={today}
            onChange={(e) => e.target.value && set({ to: e.target.value })}
          />
        </div>
      )}
      <div className="flex items-center gap-2 lg:ml-auto">
        <SegmentedControl
          label="Chart interval"
          value={hourlyAllowed ? filters.interval : 'day'}
          onChange={(interval) => set({ interval })}
          options={[
            {
              value: 'hour',
              label: 'Hourly',
              disabled: !hourlyAllowed,
              title: hourlyAllowed ? undefined : `Hourly view is limited to ${MAX_HOURLY_DAYS} days`,
            },
            { value: 'day', label: 'Daily' },
          ]}
        />
        <Button variant="secondary" size="md" onClick={onRefresh} aria-label="Refresh data" className="px-3">
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  )
}

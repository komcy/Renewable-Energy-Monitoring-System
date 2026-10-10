import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { energyParts, formatNumber, powerParts } from '@/utils/format'
import ChartTooltip from './ChartTooltip'
import { axisProps, CHROME, gridProps, SERIES } from './chartTheme'

const ROW = 44

/** Horizontal bars of energy per plant/asset, sorted, values labelled at the bar end. */
export default function BreakdownChart({ items }) {
  const height = Math.max(120, items.length * ROW + 36)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 72, bottom: 0, left: 4 }} barCategoryGap={8}>
        <CartesianGrid {...gridProps} horizontal={false} vertical />
        <XAxis type="number" tickFormatter={(v) => formatNumber(v, 0)} {...axisProps} />
        <YAxis
          type="category"
          dataKey="label"
          width={132}
          tickFormatter={(v) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
          {...axisProps}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: '#f1f5f9' }}
          content={
            <ChartTooltip
              labelFormatter={(label, p) => (p.name ? `${label} · ${p.name}` : label)}
              rows={(p) => [
                { label: 'Energy', value: energyParts(p.energy).text },
                { label: 'Average output', value: powerParts(p.avgPower).text },
                { label: 'Efficiency', value: p.efficiency == null ? '–' : `${formatNumber(p.efficiency, 1)}%` },
                { label: 'Capacity', value: powerParts(p.capacity).text },
              ]}
            />
          }
        />
        <Bar dataKey="energy" fill={SERIES.actual} radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
          <LabelList
            dataKey="energy"
            position="right"
            formatter={(v) => energyParts(v).text}
            style={{ fill: CHROME.tick, fontSize: 12, fontWeight: 500 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

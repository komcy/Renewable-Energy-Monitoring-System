import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bucketLabel, tickLabel } from '@/utils/timeBuckets'
import { energyParts, formatNumber } from '@/utils/format'
import ChartTooltip from './ChartTooltip'
import { axisProps, CHROME, gridProps, SERIES } from './chartTheme'

/**
 * Daily energy (kWh). mode "daily" shows each day's yield as bars;
 * "cumulative" shows the running total. One series, one axis.
 */
export default function EnergyChart({ data, mode, height = 260 }) {
  const tooltip = (
    <ChartTooltip
      labelFormatter={(t) => bucketLabel(t, 'day')}
      rows={(p) => [
        { label: 'Energy that day', value: p.energy == null ? 'No data' : energyParts(p.energy).text },
        { label: 'Running total', value: energyParts(p.cumulative).text },
      ]}
    />
  )
  const xAxis = (
    <XAxis
      dataKey="t"
      type="category"
      tickFormatter={(t) => tickLabel(t, 'day')}
      minTickGap={16}
      {...axisProps}
    />
  )
  const yAxis = <YAxis width={56} tickFormatter={(v) => formatNumber(v, 0)} {...axisProps} axisLine={false} />

  return (
    <ResponsiveContainer width="100%" height={height}>
      {mode === 'cumulative' ? (
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          {xAxis}
          {yAxis}
          <Tooltip cursor={{ stroke: CHROME.cursor, strokeWidth: 1 }} content={tooltip} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={SERIES.actual}
            strokeWidth={2}
            fill={SERIES.actual}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid {...gridProps} />
          {xAxis}
          {yAxis}
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={tooltip} />
          <Bar dataKey="energy" fill={SERIES.actual} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </BarChart>
      )}
    </ResponsiveContainer>
  )
}

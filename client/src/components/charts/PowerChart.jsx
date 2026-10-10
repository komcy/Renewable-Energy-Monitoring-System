import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bucketLabel, tickLabel } from '@/utils/timeBuckets'
import { formatNumber } from '@/utils/format'
import ChartTooltip from './ChartTooltip'
import { axisProps, CHROME, gridProps, SERIES } from './chartTheme'

/** Actual vs expected generation (kW) over time — one axis, same unit. */
export default function PowerChart({ data, interval, multiDay, height = 300 }) {
  // Over several days of hourly data, tick at midnights so labels read as dates
  const dayTicks = interval === 'hour' && multiDay ? data.filter((p) => new Date(p.t).getHours() === 0).map((p) => p.t) : undefined
  const ratio = (p) => (p.actual != null && p.expected > 0 ? `${formatNumber((p.actual / p.expected) * 100, 0)}% of expected` : null)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.actual} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES.actual} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={dayTicks?.length >= 2 ? dayTicks : undefined}
          tickFormatter={(t) => tickLabel(t, interval, multiDay)}
          minTickGap={28}
          {...axisProps}
        />
        <YAxis width={52} tickFormatter={(v) => formatNumber(v, 0)} {...axisProps} axisLine={false} />
        <Tooltip
          cursor={{ stroke: CHROME.cursor, strokeWidth: 1 }}
          content={
            <ChartTooltip
              labelFormatter={(t) => bucketLabel(t, interval)}
              rows={(p) => [
                { label: 'Actual', value: p.actual == null ? 'No data' : `${formatNumber(p.actual, 2)} kW`, color: SERIES.actual },
                { label: 'Expected', value: p.expected == null ? '–' : `${formatNumber(p.expected, 2)} kW`, color: SERIES.expected, dashed: true },
              ]}
              footer={ratio}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="actual"
          name="Actual"
          stroke={SERIES.actual}
          strokeWidth={2}
          fill="url(#actualFill)"
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="expected"
          name="Expected"
          stroke={SERIES.expected}
          strokeWidth={2}
          strokeDasharray="5 4"
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

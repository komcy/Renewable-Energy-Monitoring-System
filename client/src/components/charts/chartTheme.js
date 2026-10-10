/**
 * Chart colours and chrome. Series colours are slots 1–2 of the validated
 * categorical palette (blue, orange; checked for CVD separation and contrast
 * on white). Gridlines and axes are recessive slate hairlines matching the shell.
 */
export const SERIES = {
  actual: '#2a78d6', // slot 1 — measured output
  expected: '#eb6834', // slot 2 — model expectation
}

export const CHROME = {
  grid: '#e2e8f0',
  axis: '#cbd5e1',
  tick: '#64748b',
  cursor: '#94a3b8',
  surface: '#ffffff',
}

export const axisProps = {
  stroke: CHROME.axis,
  tick: { fill: CHROME.tick, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: CHROME.axis },
}

export const gridProps = {
  stroke: CHROME.grid,
  strokeDasharray: undefined, // solid hairlines, never dashed
  vertical: false,
}

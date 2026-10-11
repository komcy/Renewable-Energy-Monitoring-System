/**
 * Builds a sample telemetry CSV for the given assets: the last 6 hours at
 * 15-minute steps with realistic values, plus three deliberately invalid rows
 * so operators can see how rejections are reported.
 */
const COLUMNS = ['assetCode', 'timestamp', 'powerOutput', 'temperature', 'irradiance', 'windSpeed', 'stateOfCharge']
const STEP_MIN = 15
const HOURS = 6

const sunAt = (date) => {
  const h = date.getHours() + date.getMinutes() / 60
  return h > 6 && h < 18 ? 1000 * Math.sin((Math.PI * (h - 6)) / 12) ** 1.2 : 0
}

function rowFor(asset, date, i) {
  const cap = asset.capacity || 100
  const r = { assetCode: asset.assetCode, timestamp: date.toISOString() }
  switch (asset.sourceType) {
    case 'SolarPanel': {
      const irr = Math.round(sunAt(date) * (0.9 + 0.1 * Math.cos(i)))
      r.irradiance = irr
      r.temperature = (24 + irr / 40).toFixed(1)
      r.powerOutput = ((cap * irr) / 1000 * 0.94).toFixed(2)
      break
    }
    case 'WindTurbine': {
      const ws = 6 + 3 * Math.sin(i / 4)
      r.windSpeed = ws.toFixed(2)
      r.powerOutput = ((cap * Math.max(0, ws ** 3 - 27)) / (1728 - 27) * 0.95).toFixed(2)
      r.temperature = '38.0'
      break
    }
    case 'BatteryStorage':
      r.stateOfCharge = (70 - i * 1.2).toFixed(1)
      r.powerOutput = (cap * 0.2).toFixed(2)
      r.temperature = '29.5'
      break
    default:
      r.powerOutput = (cap * 0.4).toFixed(2)
      r.temperature = '55.0'
  }
  return r
}

export function buildSampleCsv(assets) {
  const pick = assets.length
    ? assets.slice(0, 3)
    : [{ assetCode: 'PV-001', sourceType: 'SolarPanel', capacity: 100 }]
  const start = new Date(Date.now() - HOURS * 3_600_000)
  start.setSeconds(0, 0)
  start.setMinutes(Math.floor(start.getMinutes() / STEP_MIN) * STEP_MIN)

  const lines = [COLUMNS.join(',')]
  for (let i = 0; i < (HOURS * 60) / STEP_MIN; i++) {
    const date = new Date(start.getTime() + i * STEP_MIN * 60_000)
    for (const asset of pick) {
      const r = rowFor(asset, date, i)
      lines.push(COLUMNS.map((c) => r[c] ?? '').join(','))
    }
  }
  const code = pick[0].assetCode
  lines.push(`${code},not-a-date,50,30,,,`) // invalid timestamp
  lines.push(`${code},${new Date(start.getTime() + 7 * 60_000).toISOString()},fifty,30,,,`) // non-numeric power
  lines.push(`UNKNOWN-ASSET,${new Date().toISOString()},10,,,,`) // unknown asset
  return { csv: `${lines.join('\n')}\n`, assets: pick.map((a) => a.assetCode), rows: lines.length - 1 }
}

export function downloadText(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

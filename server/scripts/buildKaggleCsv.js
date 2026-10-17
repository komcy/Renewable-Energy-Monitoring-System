/**
 * Converts the Kaggle datasets into REMS telemetry.
 *
 *   Solar: "Solar Power Generation Data" (Plant_1/2 Generation + Weather Sensor files)
 *   Wind:  "Wind Turbine SCADA Dataset" (T1.csv)
 *
 * Put the five raw CSVs in server/samples/kaggle/ and run, from the project root:
 *   node server/scripts/buildKaggleCsv.js [--days 14] [--inverters 6]
 *
 * Writes into server/samples/kaggle/:
 *   rems_telemetry.csv  upload this via Telemetry -> Upload CSV
 *   assets.json         read by seedKaggle.js to create plants and assets
 *
 * Conversions:
 *  - Solar power uses AC_POWER (kW). Plant 1's DC_POWER is ~10x too large in the source data.
 *  - Irradiance: Kaggle kW/m2 -> REMS W/m2. Temperature: module temperature.
 *  - Source timestamps are treated as IST (Asia/Kolkata), converted to UTC, and shifted by
 *    whole days so each dataset ends yesterday. Time of day is preserved.
 *  - Wind: negative power (standby draw) is clipped to 0.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'samples', 'kaggle');
const DAY = 86400000;
const IST = 19800000; // 5h30m
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const DAYS = arg('days', 14);
const N_INV = arg('inverters', 6);
const PV_CAPACITY_KW = 1500; // per inverter block; source max is ~1,411 kW
const WIND_CAPACITY_KW = 3600; // source max is ~3,619 kW
const STC_EFFICIENCY = 18; // %, used only to derive a consistent panelArea

function readCsv(file) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8').replace(/^\uFEFF/, '');
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const cols = head.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

// All parsers return "wall clock" ms (the numbers on the clock, as if UTC)
function parseWall(s) {
  let m;
  if ((m = s.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/))) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]); // dd-mm-yyyy
  if ((m = s.match(/^(\d{2}) (\d{2}) (\d{4}) (\d{2}):(\d{2})$/))) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]); // dd mm yyyy
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/))) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)); // ISO
  throw new Error(`Unrecognised timestamp: ${s}`);
}

const nowIST = Date.now() + IST;
const targetLastDay = Math.floor(nowIST / DAY) * DAY - DAY; // yesterday (IST), as wall-clock midnight

function windowFor(rows) {
  const lastDay = Math.floor(Math.max(...rows.map((r) => r.t)) / DAY) * DAY;
  const from = lastDay - (DAYS - 1) * DAY;
  const shift = targetLastDay - lastDay;
  return { from, shift };
}
const toIso = (wall, shift) => new Date(wall + shift - IST).toISOString();
const num = (x, d) => (x === '' || x == null || Number.isNaN(+x) ? '' : (+x).toFixed(d));

const out = [];
const assets = { plants: [], assets: [] };

// ---- Solar ----
for (const p of [1, 2]) {
  const gen = readCsv(`Plant_${p}_Generation_Data.csv`).map((r) => ({ ...r, t: parseWall(r.DATE_TIME) }));
  const wx = readCsv(`Plant_${p}_Weather_Sensor_Data.csv`).map((r) => ({ ...r, t: parseWall(r.DATE_TIME) }));
  const { from, shift } = windowFor(gen);
  const g = gen.filter((r) => r.t >= from);
  const wxMap = new Map(wx.filter((r) => r.t >= from).map((r) => [r.t, r]));

  // pick the inverters with the most complete data in the window
  const counts = new Map();
  for (const r of g) counts.set(r.SOURCE_KEY, (counts.get(r.SOURCE_KEY) || 0) + 1);
  const keys = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, N_INV).map(([k]) => k).sort();
  if (keys.length < N_INV) console.warn(`Plant ${p}: only ${keys.length} inverters available`);

  const plantName = `Solar Plant ${p}`;
  assets.plants.push({ plantName, plantType: 'Solar', capacity: keys.length * PV_CAPACITY_KW });
  keys.forEach((key, i) => {
    const code = `PV${p}-${String(i + 1).padStart(2, '0')}`;
    assets.assets.push({
      assetCode: code,
      name: `Plant ${p} PV Block ${String(i + 1).padStart(2, '0')}`,
      sourceType: 'SolarPanel',
      plantName,
      capacity: PV_CAPACITY_KW,
      location: `Source inverter ${key}`,
      solarSpecs: { ratedEfficiency: STC_EFFICIENCY, panelArea: Math.round(PV_CAPACITY_KW / (STC_EFFICIENCY / 100)) },
    });
  });
  const codeOf = new Map(keys.map((k, i) => [k, `PV${p}-${String(i + 1).padStart(2, '0')}`]));
  for (const r of g) {
    if (!codeOf.has(r.SOURCE_KEY)) continue;
    const w = wxMap.get(r.t);
    if (!w) continue; // no sensor reading for this slot
    out.push({
      ts: r.t + shift,
      line: [codeOf.get(r.SOURCE_KEY), toIso(r.t, shift), num(r.AC_POWER, 2), num(w.MODULE_TEMPERATURE, 1), num(+w.IRRADIATION * 1000, 1), '', ''].join(','),
    });
  }
}

// ---- Wind ----
{
  const raw = readCsv('T1.csv').map((r) => ({ t: parseWall(r['Date/Time']), p: +r['LV ActivePower (kW)'], ws: +r['Wind Speed (m/s)'] }));
  const { from, shift } = windowFor(raw);
  assets.plants.push({ plantName: 'Wind Farm T1', plantType: 'Wind', capacity: WIND_CAPACITY_KW });
  assets.assets.push({
    assetCode: 'WT-001',
    name: 'Wind Turbine T1',
    sourceType: 'WindTurbine',
    plantName: 'Wind Farm T1',
    capacity: WIND_CAPACITY_KW,
    windSpecs: { cutInSpeed: 3, ratedWindSpeed: 13, cutOutSpeed: 25 },
  });
  for (const r of raw) {
    if (r.t < from) continue;
    out.push({ ts: r.t + shift, line: ['WT-001', toIso(r.t, shift), Math.max(0, r.p).toFixed(2), '', '', r.ws.toFixed(2), ''].join(',') });
  }
}

out.sort((a, b) => a.ts - b.ts || (a.line < b.line ? -1 : 1));
const header = 'assetCode,timestamp,powerOutput,temperature,irradiance,windSpeed,stateOfCharge';
fs.writeFileSync(path.join(DIR, 'rems_telemetry.csv'), [header, ...out.map((o) => o.line)].join('\n') + '\n');
fs.writeFileSync(path.join(DIR, 'assets.json'), JSON.stringify(assets, null, 2));
console.log(`Wrote ${out.length} readings for ${assets.assets.length} assets (${DAYS} days) -> ${DIR}`);

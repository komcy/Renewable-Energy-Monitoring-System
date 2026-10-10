/**
 * Fleet analytics for the dashboard.
 *
 * "Generation" covers generating assets only (SolarPanel, WindTurbine);
 * inverter, transformer and battery readings are power flows, not new energy,
 * and would double-count if summed in.
 */
const Asset = require('../models/Asset');
const { GENERATING_TYPES } = require('../models/Asset');
const EnergyPlant = require('../models/EnergyPlant');
const TelemetryReading = require('../models/TelemetryReading');
const Alert = require('../models/Alert');
const { round } = require('./performanceModel');
const { toObjectId } = require('../utils/validators');

const OPEN = ['Active', 'Acknowledged'];
// An asset counts as "reporting" if it sent a reading this recently
const REPORTING_WINDOW_MS = 15 * 60 * 1000;

/** Per-asset energy/power/efficiency plus the fleet's peak hourly output for a range. */
const periodStats = async (assetIds, from, to, timezone) => {
  if (!assetIds.length) return { perAsset: [], peak: null };
  const [result] = await TelemetryReading.aggregate([
    { $match: { asset: { $in: assetIds }, timestamp: { $gte: from, $lte: to } } },
    {
      $facet: {
        perAsset: [
          // Energy is summed per asset-day (max − min of the running total) so data
          // ingested out of order across days (e.g. a back-dated CSV) still adds up,
          // and the total matches the daily energy chart.
          {
            $group: {
              _id: { asset: '$asset', day: { $dateTrunc: { date: '$timestamp', unit: 'day', timezone } } },
              energyMax: { $max: '$cumulativeEnergy' },
              energyMin: { $min: '$cumulativeEnergy' },
              powerSum: { $sum: '$powerOutput' },
              peakPower: { $max: '$powerOutput' },
              // Ratio-of-sums performance ratio, only where conditions gave an expectation
              actualWithExpected: { $sum: { $cond: [{ $gt: ['$expectedPower', 0] }, '$powerOutput', 0] } },
              expectedSum: { $sum: { $cond: [{ $gt: ['$expectedPower', 0] }, '$expectedPower', 0] } },
              readings: { $sum: 1 },
              lastReading: { $max: '$timestamp' },
            },
          },
          {
            $group: {
              _id: '$_id.asset',
              energy: { $sum: { $max: [0, { $subtract: ['$energyMax', '$energyMin'] }] } },
              powerSum: { $sum: '$powerSum' },
              peakPower: { $max: '$peakPower' },
              actualWithExpected: { $sum: '$actualWithExpected' },
              expectedSum: { $sum: '$expectedSum' },
              readings: { $sum: '$readings' },
              lastReading: { $max: '$lastReading' },
            },
          },
        ],
        // Fleet peak: max over hours of the summed per-asset hourly average output
        peak: [
          {
            $group: {
              _id: { asset: '$asset', hour: { $dateTrunc: { date: '$timestamp', unit: 'hour', timezone } } },
              avgPower: { $avg: '$powerOutput' },
            },
          },
          { $group: { _id: '$_id.hour', power: { $sum: '$avgPower' } } },
          { $sort: { power: -1 } },
          { $limit: 1 },
        ],
      },
    },
  ]);
  return {
    perAsset: result.perAsset.map((a) => ({
      asset: String(a._id),
      energy: a.energy,
      avgPower: a.readings ? a.powerSum / a.readings : null,
      peakPower: a.peakPower,
      actualWithExpected: a.actualWithExpected,
      expectedSum: a.expectedSum,
      readings: a.readings,
      lastReading: a.lastReading,
    })),
    peak: result.peak[0] ? { power: result.peak[0].power, at: result.peak[0]._id } : null,
  };
};

const totals = (rows) => {
  const energy = rows.reduce((s, r) => s + r.energy, 0);
  const actual = rows.reduce((s, r) => s + r.actualWithExpected, 0);
  const expected = rows.reduce((s, r) => s + r.expectedSum, 0);
  return {
    energy,
    efficiency: expected > 0 ? Math.min(100, (actual / expected) * 100) : null,
    readings: rows.reduce((s, r) => s + r.readings, 0),
  };
};

/**
 * @param {{ plant?: string, from: Date, to: Date, timezone: string }} params
 */
const getDashboard = async ({ plant, from, to, timezone }) => {
  const span = to - from;
  const prevFrom = new Date(from.getTime() - span);
  const prevTo = new Date(from.getTime() - 1);

  const assetFilter = { sourceType: { $in: GENERATING_TYPES }, ...(plant && { plant }) };
  const assets = await Asset.find(assetFilter).select('assetCode name sourceType capacity status plant lastReadingAt').lean();
  const ids = assets.map((a) => a._id);
  const alertScope = plant ? { plant } : {};

  const [current, previous, openAlerts, raised, raisedPrev, plants] = await Promise.all([
    periodStats(ids, from, to, timezone),
    periodStats(ids, prevFrom, prevTo, timezone),
    Alert.aggregate([
      // aggregate() doesn't cast, so the plant id must be an ObjectId here
      { $match: { status: { $in: OPEN }, ...(plant && { plant: toObjectId(plant) }) } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    Alert.countDocuments({ ...alertScope, timestamp: { $gte: from, $lte: to } }),
    Alert.countDocuments({ ...alertScope, timestamp: { $gte: prevFrom, $lte: prevTo } }),
    EnergyPlant.find(plant ? { _id: plant } : {}).select('plantName plantType capacity status').lean(),
  ]);

  const cur = totals(current.perAsset);
  const prev = totals(previous.perAsset);
  const hours = span / 3_600_000;
  const generatingCapacity = assets.filter((a) => a.status === 'Active').reduce((s, a) => s + a.capacity, 0);
  const openBySeverity = Object.fromEntries(['Critical', 'High', 'Medium', 'Low'].map((s) => [s, 0]));
  for (const row of openAlerts) openBySeverity[row._id] = row.count;
  const now = Date.now();

  // Breakdown: per plant across the fleet, or per asset within one plant
  const statsByAsset = new Map(current.perAsset.map((r) => [r.asset, r]));
  let breakdown;
  if (plant) {
    breakdown = {
      level: 'asset',
      items: assets.map((a) => {
        const s = statsByAsset.get(String(a._id));
        const t = totals(s ? [s] : []);
        return {
          id: String(a._id),
          label: a.assetCode,
          name: a.name,
          sourceType: a.sourceType,
          capacity: a.capacity,
          energy: round(t.energy, 3),
          avgPower: s ? round(s.avgPower, 3) : null,
          efficiency: t.efficiency == null ? null : round(t.efficiency, 1),
        };
      }),
    };
  } else {
    const byPlant = new Map(plants.map((p) => [String(p._id), { rows: [], capacity: 0 }]));
    for (const a of assets) {
      const bucket = byPlant.get(String(a.plant));
      if (!bucket) continue;
      if (a.status === 'Active') bucket.capacity += a.capacity;
      const s = statsByAsset.get(String(a._id));
      if (s) bucket.rows.push(s);
    }
    breakdown = {
      level: 'plant',
      items: plants.map((p) => {
        const { rows, capacity } = byPlant.get(String(p._id));
        const t = totals(rows);
        return {
          id: String(p._id),
          label: p.plantName,
          plantType: p.plantType,
          status: p.status,
          capacity,
          energy: round(t.energy, 3),
          avgPower: rows.length ? round(rows.reduce((s, r) => s + r.avgPower, 0), 3) : null,
          efficiency: t.efficiency == null ? null : round(t.efficiency, 1),
        };
      }),
    };
  }
  breakdown.items.sort((a, b) => b.energy - a.energy);

  return {
    range: { from, to, previousFrom: prevFrom, previousTo: prevTo, hours: round(hours, 2), timezone },
    kpis: {
      totalGeneration: { kWh: round(cur.energy, 3), previous: round(prev.energy, 3) },
      peakPower: {
        kW: current.peak ? round(current.peak.power, 3) : null,
        at: current.peak?.at ?? null,
        previous: previous.peak ? round(previous.peak.power, 3) : null,
      },
      fleetEfficiency: {
        percent: cur.efficiency == null ? null : round(cur.efficiency, 1),
        previous: prev.efficiency == null ? null : round(prev.efficiency, 1),
      },
      alerts: {
        open: Object.values(openBySeverity).reduce((s, n) => s + n, 0),
        openBySeverity,
        raised,
        raisedPrevious: raisedPrev,
      },
      capacityFactor:
        generatingCapacity > 0 && hours > 0 ? round((cur.energy / (generatingCapacity * hours)) * 100, 1) : null,
      readings: cur.readings,
    },
    fleet: {
      generatingAssets: assets.length,
      activeAssets: assets.filter((a) => a.status === 'Active').length,
      reportingAssets: assets.filter((a) => a.status === 'Active' && a.lastReadingAt && now - new Date(a.lastReadingAt) < REPORTING_WINDOW_MS).length,
      generatingCapacity,
      bySourceType: GENERATING_TYPES.map((type) => ({
        sourceType: type,
        count: assets.filter((a) => a.sourceType === type).length,
        energy: round(
          current.perAsset
            .filter((r) => assets.find((a) => String(a._id) === r.asset)?.sourceType === type)
            .reduce((s, r) => s + r.energy, 0),
          3
        ),
      })),
    },
    breakdown,
  };
};

module.exports = { getDashboard };

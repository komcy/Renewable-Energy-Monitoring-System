/**
 * Report generators. Each returns { title, summary, columns, rows, sections, rowCount }.
 *
 * - PlantPerformance: energy, power, efficiency, capacity factor and alerts per
 *   plant (or per asset when scoped to one plant) per day/week/month bucket.
 * - AlertFrequency: alert counts by type × severity with resolution stats,
 *   plus breakdowns by asset and over time.
 * - TelemetryExport: summary only; rows are streamed by streamTelemetryCsv/Json.
 */
const Asset = require('../models/Asset');
const { GENERATING_TYPES } = require('../models/Asset');
const EnergyPlant = require('../models/EnergyPlant');
const TelemetryReading = require('../models/TelemetryReading');
const Alert = require('../models/Alert');
const { round } = require('./performanceModel');
const { csvRow } = require('../utils/csv');

const UNIT = { Daily: 'day', Weekly: 'week', Monthly: 'month' };
const MAX_EXPORT_ROWS = 500_000;

const bucketLabel = (date, granularity, timezone) => {
  const opts = { timeZone: timezone, year: 'numeric', month: 'short', ...(granularity !== 'Monthly' && { day: '2-digit' }) };
  const text = new Intl.DateTimeFormat('en-GB', opts).format(date);
  return granularity === 'Weekly' ? `Week of ${text}` : text;
};

const scopeLabel = async (plantId) => {
  if (!plantId) return 'All plants';
  const p = await EnergyPlant.findById(plantId).select('plantName').lean();
  return p?.plantName ?? 'Unknown plant';
};

// ---------------------------------------------------------------- performance

const plantPerformance = async ({ plant, from, to, granularity, timezone }) => {
  const unit = UNIT[granularity];
  const byAsset = Boolean(plant);
  const assets = await Asset.find({ sourceType: { $in: GENERATING_TYPES }, ...(plant && { plant }) })
    .select('assetCode name capacity plant status')
    .lean();
  const plants = await EnergyPlant.find(plant ? { _id: plant } : {}).select('plantName capacity').lean();
  const assetIds = assets.map((a) => a._id);

  // Per asset-day first (energy = max − min of running total), then roll up to the bucket
  const perBucket = assetIds.length
    ? await TelemetryReading.aggregate([
        { $match: { asset: { $in: assetIds }, timestamp: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { asset: '$asset', day: { $dateTrunc: { date: '$timestamp', unit: 'day', timezone } } },
            plant: { $first: '$plant' },
            energyMax: { $max: '$cumulativeEnergy' },
            energyMin: { $min: '$cumulativeEnergy' },
            powerSum: { $sum: '$powerOutput' },
            peak: { $max: '$powerOutput' },
            actual: { $sum: { $cond: [{ $gt: ['$expectedPower', 0] }, '$powerOutput', 0] } },
            expected: { $sum: { $cond: [{ $gt: ['$expectedPower', 0] }, '$expectedPower', 0] } },
            readings: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: {
              key: byAsset ? '$_id.asset' : '$plant',
              bucket: { $dateTrunc: { date: '$_id.day', unit, timezone, ...(unit === 'week' && { startOfWeek: 'monday' }) } },
            },
            energy: { $sum: { $max: [0, { $subtract: ['$energyMax', '$energyMin'] }] } },
            powerSum: { $sum: '$powerSum' },
            peak: { $max: '$peak' },
            actual: { $sum: '$actual' },
            expected: { $sum: '$expected' },
            readings: { $sum: '$readings' },
          },
        },
        { $sort: { '_id.bucket': 1 } },
      ])
    : [];

  const alertRows = await Alert.aggregate([
    { $match: { timestamp: { $gte: from, $lte: to }, ...(plant ? { asset: { $in: assets.map((a) => a._id) } } : {}) } },
    {
      $group: {
        _id: {
          key: byAsset ? '$asset' : '$plant',
          bucket: { $dateTrunc: { date: '$timestamp', unit, timezone, ...(unit === 'week' && { startOfWeek: 'monday' }) } },
        },
        alerts: { $sum: 1 },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'Critical'] }, 1, 0] } },
      },
    },
  ]);
  const alertMap = new Map(alertRows.map((r) => [`${r._id.key}|${r._id.bucket.getTime()}`, r]));

  const names = new Map(
    byAsset ? assets.map((a) => [String(a._id), a.assetCode]) : plants.map((p) => [String(p._id), p.plantName])
  );
  const capacity = new Map();
  for (const a of assets) {
    const k = String(byAsset ? a._id : a.plant);
    capacity.set(k, (capacity.get(k) || 0) + a.capacity);
  }
  const bucketHours = (start) => {
    const end = new Date(start);
    if (unit === 'day') end.setUTCDate(end.getUTCDate() + 1);
    else if (unit === 'week') end.setUTCDate(end.getUTCDate() + 7);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    // Clip to the report window
    return (Math.min(end, to) - Math.max(start, from)) / 3_600_000;
  };

  const rows = perBucket.map((b) => {
    const key = String(b._id.key);
    const a = alertMap.get(`${key}|${b._id.bucket.getTime()}`);
    const cap = capacity.get(key) || 0;
    const hours = bucketHours(b._id.bucket);
    return {
      period: bucketLabel(b._id.bucket, granularity, timezone),
      periodStart: b._id.bucket,
      [byAsset ? 'asset' : 'plant']: names.get(key) ?? 'Unknown',
      energyKWh: round(b.energy, 2),
      avgPowerKW: round(b.powerSum / b.readings, 2),
      peakPowerKW: round(b.peak, 2),
      efficiencyPct: b.expected > 0 ? round(Math.min(100, (b.actual / b.expected) * 100), 1) : null,
      capacityFactorPct: cap > 0 && hours > 0 ? round((b.energy / (cap * hours)) * 100, 2) : null,
      readings: b.readings,
      alerts: a?.alerts ?? 0,
      criticalAlerts: a?.critical ?? 0,
    };
  });

  const totalEnergy = rows.reduce((s, r) => s + r.energyKWh, 0);
  const sumActual = perBucket.reduce((s, b) => s + b.actual, 0);
  const sumExpected = perBucket.reduce((s, b) => s + b.expected, 0);
  const scope = await scopeLabel(plant);
  return {
    title: `Plant performance · ${scope} · ${granularity.toLowerCase()}`,
    columns: [
      { key: 'period', label: granularity === 'Monthly' ? 'Month' : granularity === 'Weekly' ? 'Week' : 'Day' },
      { key: byAsset ? 'asset' : 'plant', label: byAsset ? 'Asset' : 'Plant' },
      { key: 'energyKWh', label: 'Energy (kWh)' },
      { key: 'avgPowerKW', label: 'Avg power (kW)' },
      { key: 'peakPowerKW', label: 'Peak power (kW)' },
      { key: 'efficiencyPct', label: 'Efficiency (%)' },
      { key: 'capacityFactorPct', label: 'Capacity factor (%)' },
      { key: 'readings', label: 'Readings' },
      { key: 'alerts', label: 'Alerts' },
      { key: 'criticalAlerts', label: 'Critical alerts' },
    ],
    rows,
    rowCount: rows.length,
    summary: {
      scope,
      totalEnergyKWh: round(totalEnergy, 2),
      peakPowerKW: rows.length ? Math.max(...rows.map((r) => r.peakPowerKW)) : null,
      efficiencyPct: sumExpected > 0 ? round(Math.min(100, (sumActual / sumExpected) * 100), 1) : null,
      totalAlerts: rows.reduce((s, r) => s + r.alerts, 0),
      generatingAssets: assets.length,
      readings: rows.reduce((s, r) => s + r.readings, 0),
    },
  };
};

// ---------------------------------------------------------------- alerts

const alertFrequency = async ({ plant, from, to, granularity, timezone }) => {
  const unit = UNIT[granularity];
  const match = { timestamp: { $gte: from, $lte: to } };
  if (plant) match.asset = { $in: await Asset.find({ plant }).distinct('_id') };
  const hours = { $divide: [{ $subtract: ['$resolvedAt', '$timestamp'] }, 3_600_000] };

  const [byType, byAsset, byBucket] = await Promise.all([
    Alert.aggregate([
      { $match: match },
      {
        $group: {
          _id: { type: '$alertType', severity: '$severity' },
          count: { $sum: 1 },
          occurrences: { $sum: '$occurrenceCount' },
          open: { $sum: { $cond: [{ $in: ['$status', ['Active', 'Acknowledged']] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
          mttr: { $avg: { $cond: [{ $eq: ['$status', 'Resolved'] }, hours, null] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Alert.aggregate([
      { $match: match },
      { $group: { _id: '$asset', count: { $sum: 1 }, critical: { $sum: { $cond: [{ $eq: ['$severity', 'Critical'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'assets', localField: '_id', foreignField: '_id', as: 'asset' } },
      { $unwind: { path: '$asset', preserveNullAndEmptyArrays: true } },
    ]),
    Alert.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateTrunc: { date: '$timestamp', unit, timezone, ...(unit === 'week' && { startOfWeek: 'monday' }) } },
          count: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'Critical'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const rows = byType.map((r) => ({
    alertType: r._id.type,
    severity: r._id.severity,
    incidents: r.count,
    detections: r.occurrences,
    open: r.open,
    resolved: r.resolved,
    resolutionRatePct: r.count ? round((r.resolved / r.count) * 100, 1) : null,
    meanTimeToResolveHours: r.mttr == null ? null : round(r.mttr, 2),
  }));
  const total = rows.reduce((s, r) => s + r.incidents, 0);
  const resolved = rows.reduce((s, r) => s + r.resolved, 0);
  const mttrAll = rows.filter((r) => r.meanTimeToResolveHours != null);
  const scope = await scopeLabel(plant);

  return {
    title: `Alert incident frequency · ${scope} · ${granularity.toLowerCase()}`,
    columns: [
      { key: 'alertType', label: 'Alert type' },
      { key: 'severity', label: 'Severity' },
      { key: 'incidents', label: 'Incidents' },
      { key: 'detections', label: 'Detections' },
      { key: 'open', label: 'Open' },
      { key: 'resolved', label: 'Resolved' },
      { key: 'resolutionRatePct', label: 'Resolution rate (%)' },
      { key: 'meanTimeToResolveHours', label: 'Mean time to resolve (h)' },
    ],
    rows,
    rowCount: rows.length,
    sections: {
      byAsset: byAsset.map((r) => ({
        assetCode: r.asset?.assetCode ?? 'Deleted asset',
        assetName: r.asset?.name ?? null,
        incidents: r.count,
        critical: r.critical,
      })),
      overTime: byBucket.map((r) => ({ period: bucketLabel(r._id, granularity, timezone), periodStart: r._id, incidents: r.count, critical: r.critical })),
    },
    summary: {
      scope,
      totalIncidents: total,
      criticalIncidents: rows.filter((r) => r.severity === 'Critical').reduce((s, r) => s + r.incidents, 0),
      openIncidents: rows.reduce((s, r) => s + r.open, 0),
      resolutionRatePct: total ? round((resolved / total) * 100, 1) : null,
      meanTimeToResolveHours: mttrAll.length
        ? round(mttrAll.reduce((s, r) => s + r.meanTimeToResolveHours * r.resolved, 0) / mttrAll.reduce((s, r) => s + r.resolved, 0), 2)
        : null,
      mostFrequentType: rows[0]?.alertType ?? null,
      noisiestAsset: byAsset[0]?.asset?.assetCode ?? null,
    },
  };
};

// ---------------------------------------------------------------- telemetry export

const EXPORT_COLUMNS = [
  { key: 'timestamp', label: 'timestamp' },
  { key: 'plant', label: 'plant' },
  { key: 'assetCode', label: 'assetCode' },
  { key: 'sourceType', label: 'sourceType' },
  { key: 'powerOutput', label: 'powerOutput_kW' },
  { key: 'expectedPower', label: 'expectedPower_kW' },
  { key: 'efficiency', label: 'efficiency_pct' },
  { key: 'cumulativeEnergy', label: 'cumulativeEnergy_kWh' },
  { key: 'temperature', label: 'temperature_C' },
  { key: 'irradiance', label: 'irradiance_Wm2' },
  { key: 'windSpeed', label: 'windSpeed_ms' },
  { key: 'rotorSpeed', label: 'rotorSpeed_rpm' },
  { key: 'stateOfCharge', label: 'stateOfCharge_pct' },
  { key: 'operatingStatus', label: 'operatingStatus' },
  { key: 'source', label: 'source' },
];

const exportFilter = ({ plant, from, to }) => ({ timestamp: { $gte: from, $lte: to }, ...(plant && { plant }) });

const telemetryExport = async ({ plant, from, to }) => {
  const filter = exportFilter({ plant, from, to });
  const [count, assets, first, last] = await Promise.all([
    TelemetryReading.countDocuments(filter),
    TelemetryReading.distinct('asset', filter),
    TelemetryReading.findOne(filter).sort({ timestamp: 1 }).select('timestamp').lean(),
    TelemetryReading.findOne(filter).sort({ timestamp: -1 }).select('timestamp').lean(),
  ]);
  const scope = await scopeLabel(plant);
  return {
    title: `Fleet telemetry export · ${scope}`,
    columns: EXPORT_COLUMNS,
    rowCount: Math.min(count, MAX_EXPORT_ROWS),
    summary: {
      scope,
      readings: count,
      assets: assets.length,
      firstReading: first?.timestamp ?? null,
      lastReading: last?.timestamp ?? null,
      truncated: count > MAX_EXPORT_ROWS,
      maxRows: MAX_EXPORT_ROWS,
    },
  };
};

/** Streams readings for an export report, oldest first, through `write(chunk)`. */
const streamTelemetry = async (report, { onRow }) => {
  const assets = await Asset.find(report.plant ? { plant: report.plant } : {}).select('assetCode sourceType plant').lean();
  const plants = await EnergyPlant.find(report.plant ? { _id: report.plant } : {}).select('plantName').lean();
  const assetMap = new Map(assets.map((a) => [String(a._id), a]));
  const plantMap = new Map(plants.map((p) => [String(p._id), p.plantName]));

  const cursor = TelemetryReading.find(exportFilter({ plant: report.plant, from: report.period.start, to: report.period.end }))
    .sort({ timestamp: 1 })
    .limit(MAX_EXPORT_ROWS)
    .lean()
    .cursor({ batchSize: 2000 });

  for await (const r of cursor) {
    const asset = assetMap.get(String(r.asset));
    await onRow({
      ...r,
      plant: plantMap.get(String(r.plant)) ?? '',
      assetCode: asset?.assetCode ?? '',
      sourceType: asset?.sourceType ?? '',
    });
  }
};

const GENERATORS = {
  PlantPerformance: plantPerformance,
  AlertFrequency: alertFrequency,
  TelemetryExport: telemetryExport,
};

module.exports = { GENERATORS, streamTelemetry, EXPORT_COLUMNS, MAX_EXPORT_ROWS, csvRow };

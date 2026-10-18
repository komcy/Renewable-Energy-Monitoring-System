/** DiagnosticsEngine + MaintenanceTaskManager of the Predictive Maintenance sequence diagram. */
const Asset = require('../models/Asset');
const Alert = require('../models/Alert');
const TelemetryReading = require('../models/TelemetryReading');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const { scoreHealth, recommend, rankCauses } = require('./healthModel');

const DAY_MS = 86_400_000;
const OPEN_ALERT = ['Active', 'Acknowledged'];
const OPEN_ORDER = ['Scheduled', 'In Progress'];
const ratio = (a, e) => (e > 0 ? (100 * a) / e : null);
const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
const sumIf = (cond, field) => ({ $sum: { $cond: [cond, field, 0] } });

/** queryHistoricalTelemetry(assetId, 30 days) + open alerts → raw metrics. */
async function collectMetrics(asset, now = new Date()) {
  const since = new Date(now - 30 * DAY_MS);
  const split = new Date(now - 7 * DAY_MS);
  const hot = 0.9 * (asset.thresholds?.maxTemperature ?? 75);
  const expected = { $gt: ['$expectedPower', 0] };
  const recent = { $and: [expected, { $gte: ['$timestamp', split] }] };
  const [[g], alertRows] = await Promise.all([
    TelemetryReading.aggregate([
      { $match: { asset: asset._id, timestamp: { $gte: since, $lte: now } } },
      {
        $group: {
          _id: null,
          readings: { $sum: 1 },
          faults: countIf({ $eq: ['$operatingStatus', 'Fault'] }),
          degraded: countIf({ $eq: ['$operatingStatus', 'Degraded'] }),
          hot: countIf({ $gt: [{ $ifNull: ['$temperature', -1000] }, hot] }),
          actual: sumIf(expected, '$powerOutput'),
          expected: sumIf(expected, '$expectedPower'),
          actualRecent: sumIf(recent, '$powerOutput'),
          expectedRecent: sumIf(recent, '$expectedPower'),
        },
      },
    ]),
    Alert.aggregate([{ $match: { asset: asset._id, status: { $in: OPEN_ALERT } } }, { $group: { _id: '$severity', n: { $sum: 1 } } }]),
  ]);
  const n = g?.readings ?? 0;
  return {
    readings: n,
    efficiency: g ? ratio(g.actual, g.expected) : null,
    recentEfficiency: g ? ratio(g.actualRecent, g.expectedRecent) : null,
    priorEfficiency: g ? ratio(g.actual - g.actualRecent, g.expected - g.expectedRecent) : null,
    faultShare: n ? g.faults / n : 0,
    degradedShare: n ? g.degraded / n : 0,
    hotShare: n ? g.hot / n : 0,
    openAlerts: Object.fromEntries(alertRows.map((r) => [r._id, r.n])),
  };
}

/** evaluateAssetHealth(assetId): computeHealthIndexAndTrends() and store the index on the asset. */
async function evaluateAssetHealth(asset) {
  const metrics = await collectMetrics(asset);
  const result = scoreHealth(metrics);
  await Asset.updateOne({ _id: asset._id }, { healthIndex: result.healthIndex });
  return {
    ...result,
    dataQuality: metrics.readings >= 500 ? 'Good' : metrics.readings >= 50 ? 'Limited' : 'Insufficient',
    readingsAnalysed: metrics.readings,
    efficiency: metrics.efficiency,
    openAlerts: metrics.openAlerts,
    recommendation: recommend(asset, result),
  };
}

/** persistMaintenanceTask(taskDetails, "Scheduled"): idempotent; returns the open predictive order if one exists. */
async function scheduleRecommendedTask(asset, diagnosis, user) {
  const rec = diagnosis.recommendation;
  if (!rec.schedule) return { created: false, task: null };
  const existing = await MaintenanceRecord.findOne({ asset: asset._id, status: { $in: OPEN_ORDER }, title: /^Predictive:/ });
  if (existing) return { created: false, task: existing };
  const alert = await Alert.findOne({ asset: asset._id, status: { $in: OPEN_ALERT } }).sort({ createdAt: -1 });
  const record = new MaintenanceRecord({
    title: rec.title,
    description: rec.description,
    maintenanceType: rec.maintenanceType,
    priority: rec.priority,
    scheduledDate: new Date(Date.now() + rec.scheduleInDays * DAY_MS),
    asset: asset._id,
    plant: asset.plant._id ?? asset.plant,
    origin: alert ? 'Alert' : 'Manual',
    ...(alert && { relatedAlert: alert._id }),
    status: 'Scheduled',
    createdBy: user._id,
    statusHistory: [{ status: 'Scheduled', by: user._id, note: 'Created by predictive diagnostics' }],
  });
  try {
    await record.save();
  } catch (err) {
    if (err.code !== 11000) throw err;
    record.workOrderNumber = undefined; // raced with another create for the same number
    await record.save();
  }
  return { created: true, task: record };
}

/** runDiagnosticAnalysis(anomalyId): readings within ±3 h of the alert → ranked probable causes. */
async function analyseAlert(alert, asset) {
  const at = alert.lastOccurredAt ?? alert.createdAt ?? new Date();
  const from = new Date(at.getTime() - 3 * 3_600_000);
  const to = new Date(at.getTime() + 3 * 3_600_000);
  const hot = 0.9 * (asset.thresholds?.maxTemperature ?? 75);
  const [g] = await TelemetryReading.aggregate([
    { $match: { asset: asset._id, timestamp: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        readings: { $sum: 1 },
        avgIrradiance: { $avg: '$irradiance' },
        avgWindSpeed: { $avg: '$windSpeed' },
        avgTemperature: { $avg: '$temperature' },
        avgPower: { $avg: '$powerOutput' },
        faults: countIf({ $eq: ['$operatingStatus', 'Fault'] }),
        hot: countIf({ $gt: [{ $ifNull: ['$temperature', -1000] }, hot] }),
      },
    },
  ]);
  const similar = await Alert.countDocuments({ asset: asset._id, alertType: alert.alertType, createdAt: { $gte: new Date(Date.now() - 30 * DAY_MS) } });
  const n = g?.readings ?? 0;
  const ctx = {
    readings: n,
    avgIrradiance: g?.avgIrradiance ?? null,
    avgWindSpeed: g?.avgWindSpeed ?? null,
    avgTemperature: g?.avgTemperature ?? null,
    avgPower: g?.avgPower ?? null,
    faultShare: n ? g.faults / n : 0,
    hotShare: n ? g.hot / n : 0,
  };
  return { window: { from, to }, context: ctx, similarAlerts30d: similar, probableCauses: rankCauses(alert.alertType, ctx) };
}

module.exports = { evaluateAssetHealth, scheduleRecommendedTask, analyseAlert };

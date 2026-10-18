const Asset = require('../models/Asset');
const Alert = require('../models/Alert');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const ApiError = require('../utils/ApiError');
const { requireId } = require('../utils/validators');
const { evaluateAssetHealth, scheduleRecommendedTask, analyseAlert } = require('../services/diagnosticsEngine');
const { getLocalWeather } = require('../services/weatherService');

const OPEN_ORDER = ['Scheduled', 'In Progress'];
const findAsset = async (id) => {
  const asset = await Asset.findById(requireId(id, 'asset id')).populate('plant', 'plantName location');
  if (!asset) throw new ApiError(404, 'Asset not found');
  return asset;
};

/** getLocalWeather + evaluateAssetHealth (+ optional scheduling) → maintenancePayload. */
const buildPayload = async (asset, user) => {
  const [weather, diagnosis] = await Promise.all([getLocalWeather(asset.plant?.location), evaluateAssetHealth(asset)]);
  const schedule = user ? await scheduleRecommendedTask(asset, diagnosis, user) : { created: false, task: null };
  const [openAlerts, tasks] = await Promise.all([
    Alert.find({ asset: asset._id, status: { $in: ['Active', 'Acknowledged'] } }).sort({ lastOccurredAt: -1 }).limit(10).select('alertType severity status message lastOccurredAt'),
    MaintenanceRecord.find({ asset: asset._id }).sort({ scheduledDate: -1 }).limit(10).populate('plant', 'plantName'),
  ]);
  const notes = [];
  if (weather.available && weather.temperature >= 40) notes.push(`Ambient temperature is ${weather.temperature} °C; thermal stress may be weather-related.`);
  if (weather.available && weather.cloudCover >= 80) notes.push(`Cloud cover is ${weather.cloudCover}%; low output may be weather-related.`);
  return {
    asset: { id: asset._id, assetCode: asset.assetCode, name: asset.name, sourceType: asset.sourceType, plant: asset.plant && { id: asset.plant._id, plantName: asset.plant.plantName } },
    ...diagnosis,
    weather,
    notes,
    scheduled: { created: schedule.created, task: schedule.task },
    openAlerts,
    tasks,
    hasOpenPredictiveTask: tasks.some((t) => OPEN_ORDER.includes(t.status) && /^Predictive:/.test(t.title)),
  };
};

/** GET /api/maintenance/diagnostics/:assetId — evaluate only, no records created (all roles) */
const getAssetDiagnostics = async (req, res) => {
  res.json({ success: true, data: await buildPayload(await findAsset(req.params.assetId), null) });
};

/** POST /api/maintenance/diagnostics/:assetId/evaluate (Admin, Operator) — evaluate and schedule when risk is High */
const evaluateAndSchedule = async (req, res) => {
  const data = await buildPayload(await findAsset(req.params.assetId), req.user);
  res.status(data.scheduled.created ? 201 : 200).json({ success: true, data });
};

/** GET /api/maintenance/diagnostics — fleet ranked by risk, to choose where to look first */
const getFleetRisk = async (req, res) => {
  const assets = await Asset.find({ status: 'Active' }).populate('plant', 'plantName').limit(100);
  const rows = await Promise.all(assets.map(async (a) => ({ a, d: await evaluateAssetHealth(a) })));
  const data = rows
    .map(({ a, d }) => ({ id: a._id, assetCode: a.assetCode, name: a.name, plantName: a.plant?.plantName, healthIndex: d.healthIndex, riskLevel: d.riskLevel, failureProbability: d.failureProbability }))
    .sort((x, y) => x.healthIndex - y.healthIndex);
  res.json({ success: true, data });
};

/** GET /api/maintenance/diagnostics/alerts/:alertId — root-cause breakdown for an anomaly */
const getRootCause = async (req, res) => {
  const alert = await Alert.findById(requireId(req.params.alertId, 'alert id'));
  if (!alert) throw new ApiError(404, 'Alert not found');
  const asset = await findAsset(String(alert.asset));
  res.json({ success: true, data: { alert: { id: alert._id, alertType: alert.alertType, severity: alert.severity, message: alert.message, observedValue: alert.observedValue, thresholdValue: alert.thresholdValue }, ...(await analyseAlert(alert, asset)) } });
};

module.exports = { getAssetDiagnostics, evaluateAndSchedule, getFleetRisk, getRootCause };

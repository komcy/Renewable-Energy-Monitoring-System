const Alert = require('../models/Alert');
const { ALERT_TYPES, SEVERITIES, ALERT_STATUSES } = require('../models/Alert');
const ApiError = require('../utils/ApiError');
const { severityRank } = require('../services/alertEngine');
const {
  requireId,
  queryId,
  queryDate,
  queryEnumList,
  pagination,
  dateRange,
  toObjectId,
} = require('../utils/validators');

const OPEN_STATUSES = ['Active', 'Acknowledged'];
const POPULATE_ASSET = ['asset', 'assetCode name sourceType'];
const POPULATE_PLANT = ['plant', 'plantName'];

const findAlertOr404 = async (id) => {
  const alert = await Alert.findById(requireId(id, 'alert id'));
  if (!alert) throw new ApiError(404, 'Alert not found');
  return alert;
};

/**
 * GET /api/alerts?status=Active,Acknowledged&severity=High,Critical&alertType=&asset=&plant=&from=&to=&page=&limit=
 */
const listAlerts = async (req, res) => {
  const filter = {};
  const status = queryEnumList(req.query, 'status', ALERT_STATUSES);
  const severity = queryEnumList(req.query, 'severity', SEVERITIES);
  const alertType = queryEnumList(req.query, 'alertType', ALERT_TYPES);
  const asset = queryId(req.query, 'asset');
  const plant = queryId(req.query, 'plant');
  const range = dateRange(queryDate(req.query, 'from'), queryDate(req.query, 'to'));
  if (status) filter.status = { $in: status };
  if (severity) filter.severity = { $in: severity };
  if (alertType) filter.alertType = { $in: alertType };
  if (asset) filter.asset = asset;
  if (plant) filter.plant = plant;
  if (range) filter.timestamp = range;

  const { page, limit, skip } = pagination(req.query);
  const [alerts, total] = await Promise.all([
    Alert.find(filter)
      .populate(...POPULATE_ASSET)
      .populate(...POPULATE_PLANT)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit),
    Alert.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: alerts });
};

/** GET /api/alerts/active?severity=&plant=  — unresolved alerts, most severe first */
const listActiveAlerts = async (req, res) => {
  const filter = { status: { $in: OPEN_STATUSES } };
  const severity = queryEnumList(req.query, 'severity', SEVERITIES);
  const plant = queryId(req.query, 'plant');
  if (severity) filter.severity = { $in: severity };
  if (plant) filter.plant = plant;

  const alerts = await Alert.find(filter)
    .populate(...POPULATE_ASSET)
    .populate(...POPULATE_PLANT)
    .sort({ lastOccurredAt: -1 })
    .limit(500);
  alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  res.json({ success: true, count: alerts.length, data: alerts });
};

/** GET /api/alerts/summary?plant=  — open alert counts by severity and status */
const getAlertSummary = async (req, res) => {
  const match = { status: { $in: OPEN_STATUSES } };
  const plant = queryId(req.query, 'plant');
  if (plant) match.plant = toObjectId(plant);

  const rows = await Alert.aggregate([
    { $match: match },
    { $group: { _id: { severity: '$severity', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const byStatus = Object.fromEntries(OPEN_STATUSES.map((s) => [s, 0]));
  let total = 0;
  for (const { _id, count } of rows) {
    bySeverity[_id.severity] += count;
    byStatus[_id.status] += count;
    total += count;
  }
  res.json({ success: true, data: { totalOpen: total, bySeverity, byStatus } });
};

/** GET /api/alerts/:id */
const getAlert = async (req, res) => {
  const alert = await findAlertOr404(req.params.id);
  await alert.populate([
    { path: 'asset', select: 'assetCode name sourceType capacity thresholds' },
    { path: 'plant', select: 'plantName' },
    { path: 'reading' },
    { path: 'acknowledgedBy', select: 'name email role' },
    { path: 'resolvedBy', select: 'name email role' },
  ]);
  res.json({ success: true, data: alert });
};

/** PATCH /api/alerts/:id/acknowledge  (Admin, Operator) */
const acknowledgeAlert = async (req, res) => {
  const alert = await findAlertOr404(req.params.id);
  if (alert.status !== 'Active') {
    throw new ApiError(409, `Only Active alerts can be acknowledged (current status: ${alert.status})`);
  }
  alert.status = 'Acknowledged';
  alert.acknowledgedBy = req.user._id;
  alert.acknowledgedAt = new Date();
  await alert.save();
  res.json({ success: true, data: alert });
};

/** PATCH /api/alerts/:id/resolve  { resolutionNotes }  (Admin, Operator) */
const resolveAlert = async (req, res) => {
  const alert = await findAlertOr404(req.params.id);
  if (alert.status === 'Resolved') throw new ApiError(409, 'Alert is already resolved');

  const notes = typeof req.body?.resolutionNotes === 'string' ? req.body.resolutionNotes.trim() : '';
  if (notes.length < 3) throw new ApiError(400, 'resolutionNotes is required (at least 3 characters)');

  alert.status = 'Resolved';
  alert.resolutionNotes = notes;
  alert.resolvedBy = req.user._id;
  alert.resolvedAt = new Date();
  await alert.save();
  res.json({ success: true, data: alert });
};

module.exports = { listAlerts, listActiveAlerts, getAlertSummary, getAlert, acknowledgeAlert, resolveAlert };

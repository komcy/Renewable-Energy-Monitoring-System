const TelemetryReading = require('../models/TelemetryReading');
const { METRIC_FIELDS } = require('../models/TelemetryReading');
const ApiError = require('../utils/ApiError');
const { ingestReadings } = require('../services/telemetryIngestion');
const { ingestCsvUpload } = require('../services/csvIngestion');
const {
  queryId,
  queryDate,
  queryEnum,
  queryEnumList,
  queryString,
  pagination,
  dateRange,
  toObjectId,
} = require('../utils/validators');

const DAY_MS = 86_400_000;
const INTERVALS = {
  hour: { unit: 'hour', defaultRangeMs: DAY_MS, maxRangeMs: 31 * DAY_MS },
  day: { unit: 'day', defaultRangeMs: 30 * DAY_MS, maxRangeMs: 366 * DAY_MS },
};

/** Shared asset/plant/time filter from query params. */
const buildFilter = (query, { castIds = false } = {}) => {
  const filter = {};
  const asset = queryId(query, 'asset');
  const plant = queryId(query, 'plant');
  if (asset) filter.asset = castIds ? toObjectId(asset) : asset;
  if (plant) filter.plant = castIds ? toObjectId(plant) : plant;
  const range = dateRange(queryDate(query, 'from'), queryDate(query, 'to'));
  if (range) filter.timestamp = range;
  return filter;
};

/**
 * POST /api/telemetry  (Admin, Operator)
 * Body: a single reading, an array of readings, or { readings: [...] }.
 * Each reading: { asset | assetCode, powerOutput, timestamp?, efficiency?, temperature?,
 *   irradiance?, windSpeed?, rotorSpeed?, stateOfCharge?, operatingStatus?, cumulativeEnergy? }
 */
const ingestTelemetry = async (req, res) => {
  const body = req.body;
  let records;
  if (Array.isArray(body)) records = body;
  else if (Array.isArray(body?.readings)) records = body.readings;
  else if (body && typeof body === 'object' && Object.keys(body).length) records = [body];
  else throw new ApiError(400, 'Request body must be a reading, an array of readings, or { readings: [...] }');

  const result = await ingestReadings(records, { source: 'api' });
  const alertSummary = (a) => ({
    id: a.id,
    asset: a.asset,
    alertType: a.alertType,
    severity: a.severity,
    message: a.message,
    occurrenceCount: a.occurrenceCount,
  });

  res.status(201).json({
    success: true,
    inserted: result.inserted,
    alertsCreated: result.alerts.created.length,
    alertsUpdated: result.alerts.updated.length,
    alerts: {
      created: result.alerts.created.map(alertSummary),
      updated: result.alerts.updated.map(alertSummary),
    },
    // Echo processed readings only for small requests
    ...(result.inserted <= 50 && {
      readings: result.readings.map(({ _id, ...r }) => ({ id: _id, ...r })),
    }),
  });
};

/**
 * POST /api/telemetry/upload  (Admin, Operator)
 * multipart/form-data with a CSV in field "file".
 * Required columns: assetCode, timestamp, powerOutput. Optional: temperature, irradiance,
 * windSpeed, stateOfCharge, rotorSpeed, efficiency, operatingStatus, cumulativeEnergy.
 * Valid rows are stored; invalid rows are reported by CSV line number.
 */
const uploadTelemetryCsv = async (req, res) => {
  const summary = await ingestCsvUpload(req);
  const status = summary.accepted > 0 ? 201 : 400;
  res.status(status).json({
    success: summary.accepted > 0,
    message:
      summary.accepted > 0
        ? `Stored ${summary.accepted} of ${summary.totalRows} row(s)${summary.rejected ? `; ${summary.rejected} rejected` : ''}`
        : 'No rows were stored',
    data: summary,
  });
};

/**
 * GET /api/telemetry?asset=&plant=&from=&to=&metrics=powerOutput,efficiency&sort=asc|desc&page=&limit=
 */
const getTelemetry = async (req, res) => {
  const filter = buildFilter(req.query);
  const metrics = queryEnumList(req.query, 'metrics', METRIC_FIELDS);
  const sortDir = queryEnum(req.query, 'sort', ['asc', 'desc']) === 'asc' ? 1 : -1;
  const { page, limit, skip } = pagination(req.query, { defaultLimit: 100, maxLimit: 1000 });

  const projection = metrics
    ? ['asset', 'plant', 'timestamp', 'operatingStatus', ...metrics].join(' ')
    : undefined;

  const [readings, total] = await Promise.all([
    TelemetryReading.find(filter, projection).sort({ timestamp: sortDir }).skip(skip).limit(limit),
    TelemetryReading.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: readings });
};

/** GET /api/telemetry/latest?plant=  — newest reading per asset */
const getLatestTelemetry = async (req, res) => {
  const match = {};
  const plant = queryId(req.query, 'plant');
  if (plant) match.plant = toObjectId(plant);

  const rows = await TelemetryReading.aggregate([
    { $match: match },
    { $sort: { asset: 1, timestamp: -1 } },
    { $group: { _id: '$asset', reading: { $first: '$$ROOT' } } },
    { $lookup: { from: 'assets', localField: '_id', foreignField: '_id', as: 'asset' } },
    { $unwind: '$asset' },
    {
      $project: {
        _id: 0,
        asset: {
          id: '$asset._id',
          assetCode: '$asset.assetCode',
          name: '$asset.name',
          sourceType: '$asset.sourceType',
          capacity: '$asset.capacity',
          status: '$asset.status',
        },
        reading: { $unsetField: { field: '__v', input: '$reading' } },
      },
    },
    { $sort: { 'asset.assetCode': 1 } },
  ]);
  res.json({ success: true, count: rows.length, data: rows });
};

/**
 * GET /api/telemetry/aggregate?interval=hour|day&asset=|plant=&from=&to=&timezone=Asia/Kolkata
 * Time-bucketed averages for charts. With `asset`, values are that asset's;
 * otherwise per-asset buckets are combined (power summed, efficiency averaged).
 */
const getAggregatedTelemetry = async (req, res) => {
  const intervalKey = queryEnum(req.query, 'interval', Object.keys(INTERVALS)) || 'hour';
  const interval = INTERVALS[intervalKey];

  const timezone = queryString(req.query, 'timezone') || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new ApiError(400, `Unknown timezone "${timezone}"`);
  }

  const filter = buildFilter(req.query, { castIds: true });
  const to = filter.timestamp?.$lte || new Date();
  const from = filter.timestamp?.$gte || new Date(to.getTime() - interval.defaultRangeMs);
  if (to - from > interval.maxRangeMs) {
    throw new ApiError(400, `Range too large for interval "${intervalKey}" (max ${interval.maxRangeMs / DAY_MS} days)`);
  }
  filter.timestamp = { $gte: from, $lte: to };

  const r = (expr) => ({ $round: [expr, 3] });
  const pipeline = [
    { $match: filter },
    {
      $group: {
        _id: {
          asset: '$asset',
          bucket: { $dateTrunc: { date: '$timestamp', unit: interval.unit, timezone } },
        },
        avgPower: { $avg: '$powerOutput' },
        peakPower: { $max: '$powerOutput' },
        avgExpectedPower: { $avg: '$expectedPower' },
        avgEfficiency: { $avg: '$efficiency' },
        avgTemperature: { $avg: '$temperature' },
        avgIrradiance: { $avg: '$irradiance' },
        avgWindSpeed: { $avg: '$windSpeed' },
        avgStateOfCharge: { $avg: '$stateOfCharge' },
        energyMax: { $max: '$cumulativeEnergy' },
        energyMin: { $min: '$cumulativeEnergy' },
        readings: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.bucket',
        avgPower: { $sum: '$avgPower' },
        peakPower: { $sum: '$peakPower' },
        avgExpectedPower: { $sum: '$avgExpectedPower' },
        avgEfficiency: { $avg: '$avgEfficiency' },
        avgTemperature: { $avg: '$avgTemperature' },
        avgIrradiance: { $avg: '$avgIrradiance' },
        avgWindSpeed: { $avg: '$avgWindSpeed' },
        avgStateOfCharge: { $avg: '$avgStateOfCharge' },
        energy: { $sum: { $subtract: ['$energyMax', '$energyMin'] } },
        readings: { $sum: '$readings' },
        assets: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        bucket: '$_id',
        avgPower: r('$avgPower'),
        peakPower: r('$peakPower'),
        avgExpectedPower: r('$avgExpectedPower'),
        avgEfficiency: r('$avgEfficiency'),
        avgTemperature: r('$avgTemperature'),
        avgIrradiance: r('$avgIrradiance'),
        avgWindSpeed: r('$avgWindSpeed'),
        avgStateOfCharge: r('$avgStateOfCharge'),
        energy: r('$energy'),
        readings: 1,
        assets: 1,
      },
    },
  ];

  const buckets = await TelemetryReading.aggregate(pipeline);
  res.json({
    success: true,
    interval: intervalKey,
    timezone,
    from,
    to,
    count: buckets.length,
    data: buckets,
  });
};

module.exports = { ingestTelemetry, uploadTelemetryCsv, getTelemetry, getLatestTelemetry, getAggregatedTelemetry };

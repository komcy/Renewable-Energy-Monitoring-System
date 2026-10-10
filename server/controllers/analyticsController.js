const EnergyPlant = require('../models/EnergyPlant');
const ApiError = require('../utils/ApiError');
const { getDashboard } = require('../services/analyticsService');
const { queryId, queryDate, queryString, dateRange } = require('../utils/validators');

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

/**
 * GET /api/analytics/dashboard?plant=&from=&to=&timezone=
 * KPIs for the range with the previous equal-length period for trends,
 * fleet status and a plant (or, with `plant`, asset) breakdown.
 * Defaults to the last 24 hours.
 */
const dashboard = async (req, res) => {
  const plant = queryId(req.query, 'plant');
  const range = dateRange(queryDate(req.query, 'from'), queryDate(req.query, 'to'));
  const to = range?.$lte || new Date();
  const from = range?.$gte || new Date(to.getTime() - DAY_MS);
  if (to - from > MAX_RANGE_DAYS * DAY_MS) throw new ApiError(400, `Range too large (max ${MAX_RANGE_DAYS} days)`);
  if (to - from < 60_000) throw new ApiError(400, 'Range must be at least one minute');

  const timezone = queryString(req.query, 'timezone') || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new ApiError(400, `Unknown timezone "${timezone}"`);
  }
  if (plant && !(await EnergyPlant.exists({ _id: plant }))) throw new ApiError(404, 'Plant not found');

  res.json({ success: true, data: await getDashboard({ plant, from, to, timezone }) });
};

module.exports = { dashboard };

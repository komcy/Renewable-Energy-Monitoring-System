const Report = require('../models/Report');
const { REPORT_TYPES, GRANULARITIES } = require('../models/Report');
const EnergyPlant = require('../models/EnergyPlant');
const ApiError = require('../utils/ApiError');
const { GENERATORS, streamTelemetry } = require('../services/reportService');
const { csvRow, toCsv, slug } = require('../utils/csv');
const { requireId, isValidId, queryEnum, queryId, pagination } = require('../utils/validators');

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
const PREVIEW_ROWS = 50;

const findOr404 = async (id, withRows = false) => {
  const query = Report.findById(requireId(id, 'report id')).populate('plant', 'plantName').populate('generatedBy', 'name');
  if (withRows) query.select('+rows +sections');
  const report = await query;
  if (!report) throw new ApiError(404, 'Report not found');
  return report;
};

const fileName = (report, ext) => {
  // Dates in the report's own timezone, so "Oct 5 – Oct 11" isn't named after Oct 4 in UTC
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: report.timezone || 'UTC' }).format(d);
  return `rems-${slug(report.reportType)}-${slug(report.plant?.plantName ?? 'fleet')}-${day(report.period.start)}-to-${day(report.period.end)}.${ext}`;
};

/**
 * POST /api/reports  { reportType, plant?, from, to, granularity?, timezone? }  (any signed-in role)
 * Generating a report only reads monitoring data, so Viewers/auditors may run it.
 */
const generateReport = async (req, res) => {
  const body = req.body || {};
  const reportType = REPORT_TYPES.find((t) => t.toLowerCase() === String(body.reportType ?? '').toLowerCase());
  if (!reportType) throw new ApiError(400, `reportType must be one of ${REPORT_TYPES.join(', ')}`);
  const granularity = body.granularity === undefined ? 'Daily' : GRANULARITIES.find((g) => g.toLowerCase() === String(body.granularity).toLowerCase());
  if (!granularity) throw new ApiError(400, `granularity must be one of ${GRANULARITIES.join(', ')}`);

  const from = new Date(body.from);
  const to = new Date(body.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(400, 'from and to must be valid dates');
  if (from >= to) throw new ApiError(400, '"from" must be before "to"');
  if (to - from > MAX_RANGE_DAYS * DAY_MS) throw new ApiError(400, `Range too large (max ${MAX_RANGE_DAYS} days)`);

  const timezone = body.timezone === undefined ? 'UTC' : String(body.timezone);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new ApiError(400, `Unknown timezone "${timezone}"`);
  }

  let plant;
  if (body.plant !== undefined && body.plant !== null && body.plant !== '') {
    if (!isValidId(String(body.plant))) throw new ApiError(400, 'plant must be a valid id');
    if (!(await EnergyPlant.exists({ _id: body.plant }))) throw new ApiError(404, 'Plant not found');
    plant = String(body.plant);
  }

  const started = Date.now();
  const result = await GENERATORS[reportType]({ plant, from, to, granularity, timezone });
  const report = await Report.create({
    reportType,
    title: result.title,
    plant,
    period: { start: from, end: to },
    granularity,
    timezone,
    generatedBy: req.user._id,
    rowCount: result.rowCount,
    summary: { ...result.summary, generationMs: Date.now() - started },
    columns: result.columns,
    ...(result.rows && { rows: result.rows }),
    ...(result.sections && { sections: result.sections }),
  });
  await report.populate([
    { path: 'plant', select: 'plantName' },
    { path: 'generatedBy', select: 'name' },
  ]);

  res.status(201).json({
    success: true,
    data: { ...report.toJSON(), preview: (result.rows ?? []).slice(0, PREVIEW_ROWS), sections: result.sections },
  });
};

/** GET /api/reports?reportType=&plant=&page=&limit=  — report history (newest first) */
const listReports = async (req, res) => {
  const filter = {};
  const reportType = queryEnum(req.query, 'reportType', REPORT_TYPES);
  const plant = queryId(req.query, 'plant');
  if (reportType) filter.reportType = reportType;
  if (plant) filter.plant = plant;
  const { page, limit, skip } = pagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const [reports, total] = await Promise.all([
    Report.find(filter).populate('plant', 'plantName').populate('generatedBy', 'name').sort({ generatedAt: -1 }).skip(skip).limit(limit),
    Report.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: reports });
};

/** GET /api/reports/:id  — report with its rows (first 500) and extra sections */
const getReport = async (req, res) => {
  const report = await findOr404(req.params.id, true);
  const json = report.toJSON();
  res.json({ success: true, data: { ...json, rows: (json.rows ?? []).slice(0, 500), rowsTruncated: (json.rows?.length ?? 0) > 500 } });
};

/** GET /api/reports/:id/download?format=csv|json  — file download */
const downloadReport = async (req, res) => {
  const format = queryEnum(req.query, 'format', ['csv', 'json']) || 'csv';
  const report = await findOr404(req.params.id, true);
  const name = fileName(report, format);
  res.attachment(name);

  if (report.reportType === 'TelemetryExport') {
    // Stream straight from a cursor so large exports never sit in memory
    res.type(format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
    const columns = report.columns;
    let first = true;
    if (format === 'csv') res.write(`﻿${csvRow(columns.map((c) => c.label))}`);
    else res.write(`{"report":${JSON.stringify({ id: report.id, title: report.title, period: report.period, summary: report.summary })},"rows":[`);
    await streamTelemetry(report, {
      onRow: async (row) => {
        const chunk =
          format === 'csv'
            ? csvRow(columns.map((c) => row[c.key]))
            : `${first ? '' : ','}${JSON.stringify(Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? null])))}`;
        first = false;
        if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
      },
    });
    res.end(format === 'csv' ? '' : ']}');
    return;
  }

  if (format === 'json') {
    const json = report.toJSON();
    res.type('application/json; charset=utf-8').send(
      JSON.stringify(
        {
          report: { id: json.id, title: json.title, reportType: json.reportType, scope: json.plant?.plantName ?? 'All plants', period: json.period, granularity: json.granularity, timezone: json.timezone, generatedAt: json.generatedAt, generatedBy: json.generatedBy?.name },
          summary: json.summary,
          rows: json.rows ?? [],
          ...(json.sections && { sections: json.sections }),
        },
        null,
        2
      )
    );
    return;
  }
  // UTF-8 BOM so Excel shows symbols such as ° and × correctly
  res.type('text/csv; charset=utf-8').send(`﻿${toCsv(report.columns, report.rows ?? [])}`);
};

/** DELETE /api/reports/:id  — Admin, or the user who generated it */
const deleteReport = async (req, res) => {
  const report = await findOr404(req.params.id);
  const owner = report.generatedBy && String(report.generatedBy._id ?? report.generatedBy) === req.user.id;
  if (req.user.role !== 'Admin' && !owner) throw new ApiError(403, 'Only an Admin or the report author can delete it');
  await report.deleteOne();
  res.json({ success: true, message: 'Report deleted' });
};

module.exports = { generateReport, listReports, getReport, downloadReport, deleteReport };

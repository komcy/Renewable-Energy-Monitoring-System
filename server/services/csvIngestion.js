/**
 * Streamed CSV telemetry ingestion.
 *
 * The uploaded file is streamed (never fully buffered) through csv-parse and
 * fed to the standard ingestion pipeline in batches, so enrichment and alert
 * evaluation are identical to the JSON API. Good rows are stored; bad rows are
 * reported with their CSV line number.
 *
 * Rows should be in time order per asset: energy integration and drop
 * detection compare each reading with the asset's previous one.
 */
const busboy = require('busboy');
const { parse } = require('csv-parse');
const ApiError = require('../utils/ApiError');
const { ingestReadings } = require('./telemetryIngestion');

const BATCH_SIZE = 1000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_ROWS = 200_000;
const MAX_ERROR_DETAILS = 200;

// Canonical column names (matched case-insensitively, ignoring spaces/underscores)
const REQUIRED_COLUMNS = ['assetCode', 'timestamp', 'powerOutput'];
const OPTIONAL_COLUMNS = [
  'temperature',
  'irradiance',
  'windSpeed',
  'stateOfCharge',
  'rotorSpeed',
  'efficiency',
  'operatingStatus',
  'cumulativeEnergy',
];
const KNOWN = new Map(
  [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((c) => [c.toLowerCase(), c])
);
const normalise = (h) => String(h).trim().replace(/[\s_-]/g, '').toLowerCase();

/** Maps header cells to canonical names; throws if required columns are missing. */
const mapHeader = (cells) => {
  const columns = cells.map((cell) => KNOWN.get(normalise(cell)) || null);
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    throw new ApiError(400, `CSV header is missing required column(s): ${missing.join(', ')}`, {
      required: REQUIRED_COLUMNS,
      optional: OPTIONAL_COLUMNS,
      found: cells,
    });
  }
  const dupes = columns.filter((c, i) => c && columns.indexOf(c) !== i);
  if (dupes.length) throw new ApiError(400, `CSV header has duplicate column(s): ${[...new Set(dupes)].join(', ')}`);
  const ignored = cells.filter((_, i) => !columns[i]);
  return { columns, ignored };
};

/** Parses a CSV stream and ingests it batch by batch. */
const ingestCsvStream = async (stream) => {
  const started = Date.now();
  const summary = {
    totalRows: 0,
    accepted: 0,
    rejected: 0,
    batches: 0,
    alertsCreated: 0,
    alertsUpdated: 0,
    ignoredColumns: [],
    errors: [],
  };
  const rejectRow = (line, errors) => {
    summary.rejected += 1;
    if (summary.errors.length < MAX_ERROR_DETAILS) summary.errors.push({ line, errors });
  };

  const parser = parse({
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    skip_records_with_error: true, // malformed quoting etc. → reported, not fatal
    info: true,
  });
  parser.on('skip', (err) => {
    summary.totalRows += 1;
    rejectRow(err.lines ?? null, [`malformed CSV row: ${err.message}`]);
  });
  stream.on('limit', () => {
    parser.destroy(new ApiError(413, `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`));
  });
  stream.on('error', (err) => parser.destroy(err));
  stream.pipe(parser);

  let header;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const current = batch;
    batch = [];
    const result = await ingestReadings(
      current.map((b) => b.record),
      { source: 'csv', partial: true, requireTimestamp: true }
    );
    summary.batches += 1;
    summary.accepted += result.inserted;
    summary.alertsCreated += result.alerts.created.length;
    summary.alertsUpdated += result.alerts.updated.length;
    for (const r of result.rejected) rejectRow(current[r.index].line, r.errors);
  };

  try {
    for await (const { record, info } of parser) {
      if (!header) {
        header = mapHeader(record);
        summary.ignoredColumns = header.ignored;
        continue;
      }
      summary.totalRows += 1;
      if (summary.totalRows > MAX_ROWS) {
        throw new ApiError(413, `CSV exceeds ${MAX_ROWS} data rows`);
      }
      if (record.length !== header.columns.length) {
        rejectRow(info.lines, [`expected ${header.columns.length} columns, found ${record.length}`]);
        continue;
      }
      const obj = {};
      header.columns.forEach((col, i) => {
        if (col && record[i] !== '') obj[col] = record[i];
      });
      batch.push({ line: info.lines, record: obj });
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();
  } catch (err) {
    // Earlier batches are already stored; tell the caller exactly how far we got
    if (err instanceof ApiError) {
      err.details = { ...(err.details || {}), acceptedBeforeError: summary.accepted, ...(summary.errors.length && { rowErrors: summary.errors }) };
    }
    // Drain the rest of the upload so the request completes
    stream.unpipe(parser);
    stream.resume();
    throw err;
  }

  if (!header) throw new ApiError(400, 'CSV file is empty');
  summary.durationMs = Date.now() - started;
  summary.errorsTruncated = summary.rejected > summary.errors.length;
  return summary;
};

/**
 * Reads a multipart/form-data request with a single CSV file in field "file"
 * and ingests it. Resolves with the ingestion summary.
 */
const ingestCsvUpload = (req) =>
  new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) {
      reject(new ApiError(415, 'Use multipart/form-data with the CSV in a field named "file"'));
      return;
    }

    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_BYTES, fields: 10 } });
    } catch (err) {
      reject(new ApiError(400, `Invalid multipart request: ${err.message}`));
      return;
    }

    let fileSeen = false;
    let work;
    bb.on('file', (field, file, info) => {
      if (field !== 'file' || fileSeen) {
        file.resume();
        return;
      }
      fileSeen = true;
      const name = String(info.filename || '').toLowerCase();
      if (!name.endsWith('.csv')) {
        file.resume();
        work = Promise.resolve({ err: new ApiError(400, 'Only .csv files are accepted') });
        return;
      }
      // Settle into a plain value now so an early failure is never an unhandled rejection
      work = ingestCsvStream(file).then(
        (summary) => ({ summary }),
        (err) => ({ err })
      );
    });
    bb.on('error', (err) => reject(new ApiError(400, `Upload failed: ${err.message}`)));
    bb.on('close', () => {
      if (!fileSeen) reject(new ApiError(400, 'No file found. Send the CSV in a form field named "file"'));
      else work.then(({ summary, err }) => (err ? reject(err) : resolve(summary)));
    });
    req.pipe(bb);
  });

module.exports = { ingestCsvUpload, ingestCsvStream, REQUIRED_COLUMNS, OPTIONAL_COLUMNS, BATCH_SIZE };

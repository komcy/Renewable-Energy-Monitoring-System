/**
 * Telemetry ingestion pipeline:
 *   validate → resolve assets → derive expected power / efficiency / energy
 *   → batch insert → run alert engine → update asset "latest" values.
 *
 * A batch is all-or-nothing: if any record is invalid, nothing is stored and
 * the caller gets a 400 listing every bad record.
 */
const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const TelemetryReading = require('../models/TelemetryReading');
const { OPERATING_STATUSES } = require('../models/TelemetryReading');
const ApiError = require('../utils/ApiError');
const { isValidId } = require('../utils/validators');
const { expectedPower, computeEfficiency, energyBetween, round } = require('./performanceModel');
const { processAssetReadings } = require('./alertEngine');

const MAX_BATCH = 5000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
// Output above this multiple of rated capacity is treated as a corrupt value
const MAX_OVER_CAPACITY = 1.5;

// [field, min, max] sanity ranges for numeric inputs
const NUMERIC_FIELDS = [
  ['powerOutput', -Infinity, Infinity],
  ['cumulativeEnergy', 0, Infinity],
  ['efficiency', 0, 100],
  ['irradiance', 0, 1500],
  ['temperature', -50, 200],
  ['windSpeed', 0, 100],
  ['rotorSpeed', 0, 1000],
  ['stateOfCharge', 0, 100],
];

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value.trim());
  return NaN;
};

/** Validates one raw record's own fields (asset lookup happens separately). */
const parseRecord = (raw) => {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['Record must be an object'] };

  const values = {};
  for (const [field, min, max] of NUMERIC_FIELDS) {
    const n = toNumber(raw[field]);
    if (n === undefined) continue;
    if (!Number.isFinite(n)) errors.push(`${field} must be a number`);
    else if (n < min || n > max) errors.push(`${field} must be between ${min} and ${max}`);
    else values[field] = n;
  }
  if (values.powerOutput === undefined && !errors.some((e) => e.startsWith('powerOutput'))) {
    errors.push('powerOutput is required');
  }

  if (raw.operatingStatus !== undefined && raw.operatingStatus !== null) {
    const match = OPERATING_STATUSES.find((s) => s.toLowerCase() === String(raw.operatingStatus).toLowerCase());
    if (!match) errors.push(`operatingStatus must be one of ${OPERATING_STATUSES.join(', ')}`);
    else values.operatingStatus = match;
  }

  if (raw.timestamp !== undefined && raw.timestamp !== null) {
    const ts = new Date(raw.timestamp);
    if (Number.isNaN(ts.getTime())) errors.push('timestamp is not a valid date');
    else if (ts.getTime() > Date.now() + FUTURE_TOLERANCE_MS) errors.push('timestamp is in the future');
    else values.timestamp = ts;
  } else {
    values.timestamp = new Date();
  }

  return { values, errors };
};

const assetKey = (raw) => {
  if (raw?.asset !== undefined) return { id: String(raw.asset) };
  if (raw?.assetCode !== undefined) return { code: String(raw.assetCode).trim().toUpperCase() };
  return {};
};

/** Updates the asset's "latest known" spec values from its newest reading. */
const latestSpecUpdate = (asset, latest) => {
  const set = { lastReadingAt: latest.timestamp };
  const specMap = {
    SolarPanel: ['solarSpecs', ['irradiance', 'temperature']],
    WindTurbine: ['windSpecs', ['windSpeed', 'rotorSpeed']],
    Inverter: ['inverterSpecs', ['temperature']],
    BatteryStorage: ['batterySpecs', ['stateOfCharge', 'temperature']],
    Transformer: ['transformerSpecs', ['temperature']],
  };
  const [specField, keys] = specMap[asset.sourceType] || [];
  for (const key of keys || []) {
    if (latest[key] != null) set[`${specField}.${key}`] = latest[key];
  }
  return set;
};

/**
 * Ingests raw telemetry records.
 * @returns {{ inserted:number, readings:object[], alerts:{created:object[], updated:object[]} }}
 */
const ingestReadings = async (records, { source = 'api' } = {}) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(400, 'Provide at least one telemetry record');
  }
  if (records.length > MAX_BATCH) {
    throw new ApiError(413, `Batch too large: max ${MAX_BATCH} records per request`);
  }

  // Resolve every referenced asset in one query
  const ids = new Set();
  const codes = new Set();
  for (const raw of records) {
    const key = assetKey(raw);
    if (key.id && isValidId(key.id)) ids.add(key.id);
    if (key.code) codes.add(key.code);
  }
  const assets = await Asset.find({
    $or: [{ _id: { $in: [...ids] } }, { assetCode: { $in: [...codes] } }],
  });
  const byId = new Map(assets.map((a) => [a.id, a]));
  const byCode = new Map(assets.map((a) => [a.assetCode, a]));

  const errors = [];
  const parsed = [];
  const seen = new Set();
  records.forEach((raw, index) => {
    const { values, errors: fieldErrors } = parseRecord(raw);
    const key = assetKey(raw);
    let asset;
    if (!key.id && !key.code) fieldErrors.push('asset (id) or assetCode is required');
    else if (key.id && !isValidId(key.id)) fieldErrors.push('asset is not a valid id');
    else {
      asset = key.id ? byId.get(key.id) : byCode.get(key.code);
      if (!asset) fieldErrors.push(`asset not found: ${key.id || key.code}`);
    }

    let code;
    if (asset && asset.status !== 'Active') {
      fieldErrors.push(`asset ${asset.assetCode} is deactivated; telemetry is not accepted`);
      code = 'ASSET_INACTIVE';
    }
    if (asset && values?.powerOutput !== undefined) {
      if (asset.sourceType !== 'BatteryStorage' && values.powerOutput < 0) {
        fieldErrors.push('powerOutput cannot be negative for this asset type');
      }
      if (Math.abs(values.powerOutput) > asset.capacity * MAX_OVER_CAPACITY) {
        fieldErrors.push(`powerOutput ${values.powerOutput} kW is implausible for capacity ${asset.capacity} kW`);
      }
    }
    if (asset && values?.timestamp) {
      const dupKey = `${asset.id}|${values.timestamp.getTime()}`;
      if (seen.has(dupKey)) fieldErrors.push('duplicate timestamp for this asset in the batch');
      seen.add(dupKey);
    }

    if (fieldErrors.length) errors.push({ index, code, errors: fieldErrors });
    else parsed.push({ asset, values });
  });

  if (errors.length) {
    const allInactive = errors.every((e) => e.code === 'ASSET_INACTIVE');
    throw new ApiError(
      allInactive ? 409 : 400,
      `${errors.length} of ${records.length} telemetry record(s) rejected; nothing was stored`,
      errors.slice(0, 100).map(({ index, errors: errs }) => ({ index, errors: errs }))
    );
  }

  // Group by asset, oldest first, so energy integration and drop detection run in order
  const groups = new Map();
  for (const p of parsed) {
    if (!groups.has(p.asset.id)) groups.set(p.asset.id, { asset: p.asset, items: [] });
    groups.get(p.asset.id).items.push(p.values);
  }

  const docs = [];
  const perAsset = [];
  for (const { asset, items } of groups.values()) {
    items.sort((a, b) => a.timestamp - b.timestamp);
    const prevBefore = await TelemetryReading.findOne({ asset: asset._id, timestamp: { $lt: items[0].timestamp } })
      .sort({ timestamp: -1 })
      .lean();

    let prev = prevBefore;
    const assetDocs = [];
    for (const v of items) {
      const expected = expectedPower(asset, v);
      const efficiency = v.efficiency ?? computeEfficiency(asset, v.powerOutput, expected) ?? undefined;
      const cumulativeEnergy =
        v.cumulativeEnergy ?? round((prev?.cumulativeEnergy || 0) + energyBetween(prev, v), 4);
      let operatingStatus = v.operatingStatus;
      if (!operatingStatus) {
        const minEff = asset.thresholds?.minEfficiency;
        operatingStatus = efficiency != null && minEff != null && efficiency < minEff ? 'Degraded' : 'Normal';
      }

      const doc = {
        _id: new mongoose.Types.ObjectId(),
        ...v,
        asset: asset._id,
        plant: asset.plant,
        expectedPower: expected ?? undefined,
        efficiency,
        cumulativeEnergy,
        operatingStatus,
        source,
      };
      assetDocs.push(doc);
      prev = doc;
    }
    docs.push(...assetDocs);
    perAsset.push({ asset, docs: assetDocs, prevBefore });
  }

  await TelemetryReading.insertMany(docs, { ordered: true });

  // Alerts and "latest values" per asset
  const created = [];
  const updated = [];
  const assetUpdates = [];
  for (const { asset, docs: assetDocs, prevBefore } of perAsset) {
    const result = await processAssetReadings(asset, assetDocs, prevBefore);
    created.push(...result.created);
    updated.push(...result.updated);

    const latest = assetDocs[assetDocs.length - 1];
    if (!asset.lastReadingAt || latest.timestamp >= asset.lastReadingAt) {
      assetUpdates.push({ updateOne: { filter: { _id: asset._id }, update: { $set: latestSpecUpdate(asset, latest) } } });
    }
  }
  if (assetUpdates.length) await Asset.bulkWrite(assetUpdates);

  return { inserted: docs.length, readings: docs, alerts: { created, updated } };
};

module.exports = { ingestReadings, MAX_BATCH };

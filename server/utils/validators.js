const mongoose = require('mongoose');
const ApiError = require('./ApiError');

const isValidId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(id);

const requireId = (id, label = 'id') => {
  if (!isValidId(id)) throw new ApiError(400, `Invalid ${label}`);
  return id;
};

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/** Copies only whitelisted keys that are present in obj. */
const pick = (obj, keys) => {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
};

/** Reads a single string query param; repeated params (?a=1&a=2) are rejected. */
const queryString = (query, key) => {
  const value = query?.[key];
  if (value === undefined || value === '') return undefined;
  if (Array.isArray(value)) throw new ApiError(400, `Query parameter "${key}" must appear only once`);
  return String(value);
};

const queryEnum = (query, key, allowed) => {
  const value = queryString(query, key);
  if (value === undefined) return undefined;
  const match = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
  if (!match) throw new ApiError(400, `Invalid ${key}. Allowed: ${allowed.join(', ')}`);
  return match;
};

/** Comma-separated list of enum values, e.g. ?severity=High,Critical */
const queryEnumList = (query, key, allowed) => {
  const value = queryString(query, key);
  if (value === undefined) return undefined;
  return value.split(',').map((v) => {
    const match = allowed.find((a) => a.toLowerCase() === v.trim().toLowerCase());
    if (!match) throw new ApiError(400, `Invalid ${key} "${v}". Allowed: ${allowed.join(', ')}`);
    return match;
  });
};

const queryId = (query, key) => {
  const value = queryString(query, key);
  return value === undefined ? undefined : requireId(value, key);
};

const queryDate = (query, key) => {
  const value = queryString(query, key);
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `Invalid date for "${key}"`);
  return date;
};

const queryInt = (query, key, { min = 1, max = Infinity, fallback } = {}) => {
  const value = queryString(query, key);
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, `"${key}" must be an integer between ${min} and ${max}`);
  }
  return n;
};

const pagination = (query, { defaultLimit = 50, maxLimit = 500 } = {}) => {
  const page = queryInt(query, 'page', { min: 1, max: 100000, fallback: 1 });
  const limit = queryInt(query, 'limit', { min: 1, max: maxLimit, fallback: defaultLimit });
  return { page, limit, skip: (page - 1) * limit };
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Builds a {$gte,$lte} range filter or undefined. */
const dateRange = (from, to) => {
  if (from && to && from > to) throw new ApiError(400, '"from" must be before "to"');
  if (!from && !to) return undefined;
  return { ...(from && { $gte: from }), ...(to && { $lte: to }) };
};

/**
 * Flattens nested update objects into dot paths so a partial update of a
 * sub-document (e.g. thresholds) merges instead of replacing it.
 * Only keys listed in `nested` are flattened.
 */
const flattenNested = (update, nested) => {
  const out = {};
  for (const [key, value] of Object.entries(update)) {
    if (nested.includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [sub, subValue] of Object.entries(value)) out[`${key}.${sub}`] = subValue;
    } else {
      out[key] = value;
    }
  }
  return out;
};

module.exports = {
  isValidId,
  requireId,
  toObjectId,
  pick,
  queryString,
  queryEnum,
  queryEnumList,
  queryId,
  queryDate,
  queryInt,
  pagination,
  escapeRegex,
  dateRange,
  flattenNested,
};

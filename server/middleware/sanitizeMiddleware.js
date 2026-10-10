const ApiError = require('../utils/ApiError');

const MAX_DEPTH = 10;

const findUnsafeKey = (value, depth = 0) => {
  if (depth > MAX_DEPTH) return '(nesting too deep)';
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return key;
    }
    const nested = findUnsafeKey(child, depth + 1);
    if (nested) return nested;
  }
  return null;
};

/**
 * Rejects request bodies/queries containing MongoDB operator keys ($gt, $where, ...),
 * dotted paths or prototype-pollution keys. Rejecting (rather than stripping)
 * keeps behaviour explicit; Express 5's req.query is read-only anyway.
 */
const rejectUnsafeKeys = (req, res, next) => {
  const bad = findUnsafeKey(req.body) || findUnsafeKey(req.query);
  if (bad) throw new ApiError(400, `Disallowed key in request: "${bad}"`);
  next();
};

module.exports = { rejectUnsafeKeys };

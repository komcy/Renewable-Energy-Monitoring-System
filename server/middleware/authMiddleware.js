const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

/**
 * Verifies the Bearer JWT and attaches the current user to req.user.
 * The user is re-loaded from the DB so role changes and deactivation
 * take effect immediately, not only after the token expires.
 */
const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Not authorized: missing token');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    throw new ApiError(401, `Not authorized: ${msg}`);
  }

  const user = await User.findById(payload.id);
  if (!user) throw new ApiError(401, 'Not authorized: user no longer exists');
  if (!user.isActive) throw new ApiError(403, 'Account is deactivated');

  req.user = user;
  next();
};

/**
 * Restricts a route to the given roles. Accepts either an array or
 * a list: authorizeRoles(['Admin', 'Operator']) or authorizeRoles('Admin', 'Operator').
 * Must run after verifyToken.
 */
const authorizeRoles = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) throw new ApiError(401, 'Not authorized');
    if (!allowed.includes(req.user.role)) {
      throw new ApiError(403, `Forbidden: requires role ${allowed.join(' or ')}`);
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles };

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const generateToken = require('../utils/generateToken');

/**
 * POST /api/auth/register  (public)
 * New accounts are always created as Viewer; any `role` in the body is ignored.
 * Admins grant Operator/Admin roles separately.
 */
const register = async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    throw new ApiError(400, 'Name, email and password are required');
  }

  const exists = await User.exists({ email: String(email).toLowerCase().trim() });
  if (exists) throw new ApiError(409, 'An account with this email already exists');

  const user = await User.create({ name, email, password, role: 'Viewer' });

  res.status(201).json({ success: true, token: generateToken(user), user });
};

/**
 * POST /api/auth/login  (public)
 */
const login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
  // Same message for unknown email and wrong password to avoid account enumeration
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new ApiError(403, 'Account is deactivated');

  user.lastLogin = new Date();
  await user.save();

  res.json({ success: true, token: generateToken(user), user });
};

/**
 * POST /api/auth/change-password  (authenticated)
 * { currentPassword, newPassword }. Signs out all other sessions and returns
 * a fresh token for this one.
 */
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    throw new ApiError(400, 'currentPassword and newPassword are required');
  }
  if (newPassword.length < 8) throw new ApiError(400, 'New password must be at least 8 characters');
  if (newPassword === currentPassword) throw new ApiError(400, 'New password must be different from the current one');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw new ApiError(400, 'Current password is incorrect');

  user.password = newPassword;
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  res.json({ success: true, message: 'Password changed', token: generateToken(user), user });
};

/**
 * GET /api/auth/me  (authenticated)
 */
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

module.exports = { register, login, getMe, changePassword };

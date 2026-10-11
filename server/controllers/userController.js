const crypto = require('crypto');
const User = require('../models/User');
const { ROLES } = require('../models/User');
const ApiError = require('../utils/ApiError');
const { requireId, pick, queryEnum, queryString, pagination, escapeRegex } = require('../utils/validators');

const STATUSES = ['active', 'deactivated'];

const findUserOr404 = async (id) => {
  const user = await User.findById(requireId(id, 'user id'));
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

/** Refuses changes that would leave the system without an active Admin. */
const ensureAnotherActiveAdmin = async (user, action) => {
  if (user.role !== 'Admin' || !user.isActive) return;
  const others = await User.countDocuments({ _id: { $ne: user._id }, role: 'Admin', isActive: true });
  if (!others) throw new ApiError(409, `Cannot ${action}: this is the only active Admin`);
};

/** 14-char temporary password with upper, lower, digit and symbol. */
const temporaryPassword = () => {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[crypto.randomInt(s.length)]);
  while (chars.length < 14) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** GET /api/users?search=&role=&status=active|deactivated&page=&limit=  (Admin) */
const listUsers = async (req, res) => {
  const filter = {};
  const role = queryEnum(req.query, 'role', ROLES);
  const status = queryEnum(req.query, 'status', STATUSES);
  const search = queryString(req.query, 'search');
  if (role) filter.role = role;
  if (status) filter.isActive = status === 'active';
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const { page, limit, skip } = pagination(req.query, { defaultLimit: 25, maxLimit: 200 });
  const [users, total, roleCounts] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
    User.aggregate([{ $group: { _id: { role: '$role', active: '$isActive' }, count: { $sum: 1 } } }]),
  ]);

  const counts = { total: 0, active: 0, byRole: Object.fromEntries(ROLES.map((r) => [r, 0])) };
  for (const { _id, count } of roleCounts) {
    counts.total += count;
    counts.byRole[_id.role] += count;
    if (_id.active) counts.active += count;
  }
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), counts, data: users });
};

/** POST /api/users  { name, email, role, password? }  (Admin) */
const createUser = async (req, res) => {
  const body = pick(req.body, ['name', 'email', 'role', 'password']);
  if (!body.name || !body.email) throw new ApiError(400, 'Name and email are required');
  if (body.role !== undefined && !ROLES.includes(body.role)) throw new ApiError(400, `role must be one of ${ROLES.join(', ')}`);
  if (await User.exists({ email: String(body.email).toLowerCase().trim() })) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  // Without a password, issue a temporary one the user must change at first sign-in
  const generated = !body.password;
  const password = generated ? temporaryPassword() : String(body.password);
  const user = await User.create({
    name: body.name,
    email: body.email,
    role: body.role || 'Viewer',
    password,
    mustChangePassword: generated,
  });
  res.status(201).json({ success: true, data: user, ...(generated && { temporaryPassword: password }) });
};

/**
 * PUT /api/users/:id  { name?, email?, role?, isActive? }  (Admin)
 * Role and status changes apply on the user's next request (the auth
 * middleware reloads the user every time).
 */
const updateUser = async (req, res) => {
  const user = await findUserOr404(req.params.id);
  const update = pick(req.body, ['name', 'email', 'role', 'isActive']);
  if (!Object.keys(update).length) throw new ApiError(400, 'Nothing to update. Allowed fields: name, email, role, isActive');
  if (update.role !== undefined && !ROLES.includes(update.role)) throw new ApiError(400, `role must be one of ${ROLES.join(', ')}`);
  if (update.isActive !== undefined && typeof update.isActive !== 'boolean') throw new ApiError(400, 'isActive must be true or false');

  const self = user._id.equals(req.user._id);
  const demoting = update.role !== undefined && update.role !== 'Admin' && user.role === 'Admin';
  const deactivating = update.isActive === false && user.isActive;
  if (self && deactivating) throw new ApiError(400, 'You cannot deactivate your own account');
  if (self && demoting) throw new ApiError(400, 'You cannot remove your own Admin role');
  if (demoting) await ensureAnotherActiveAdmin(user, 'remove the Admin role');
  if (deactivating) await ensureAnotherActiveAdmin(user, 'deactivate this account');

  if (update.email !== undefined) {
    const email = String(update.email).toLowerCase().trim();
    if (await User.exists({ email, _id: { $ne: user._id } })) throw new ApiError(409, 'An account with this email already exists');
  }

  const roleChanged = update.role !== undefined && update.role !== user.role;
  user.set(update);
  if (deactivating) user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  res.json({
    success: true,
    message: roleChanged ? `Role changed to ${user.role}; it applies to their very next request` : 'User updated',
    data: user,
  });
};

/** POST /api/users/:id/revoke-sessions  (Admin) — signs the user out everywhere */
const revokeSessions = async (req, res) => {
  const user = await findUserOr404(req.params.id);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  const self = user._id.equals(req.user._id);
  res.json({
    success: true,
    message: self ? 'All your sessions were signed out, including this one' : `${user.name} has been signed out of all sessions`,
  });
};

/**
 * POST /api/users/:id/reset-password  (Admin)
 * Issues a temporary password (returned once), forces a change at next
 * sign-in and signs the user out everywhere.
 */
const resetPassword = async (req, res) => {
  const user = await findUserOr404(req.params.id);
  if (user._id.equals(req.user._id)) {
    throw new ApiError(400, 'Use "Change password" in your account menu to change your own password');
  }
  const password = temporaryPassword();
  user.password = password;
  user.mustChangePassword = true;
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  res.json({ success: true, message: `Password reset for ${user.name}`, temporaryPassword: password, data: user });
};

module.exports = { listUsers, createUser, updateUser, revokeSessions, resetPassword };

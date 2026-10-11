const MaintenanceRecord = require('../models/MaintenanceRecord');
const {
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
  PRIORITIES,
  OPEN_STATUSES,
  TRANSITIONS,
} = require('../models/MaintenanceRecord');
const Asset = require('../models/Asset');
const Alert = require('../models/Alert');
const ApiError = require('../utils/ApiError');
const {
  requireId,
  pick,
  queryId,
  queryDate,
  queryEnumList,
  queryString,
  pagination,
  dateRange,
  escapeRegex,
  toObjectId,
  isValidId,
} = require('../utils/validators');

const EDITABLE = ['title', 'description', 'maintenanceType', 'priority', 'scheduledDate', 'cost', 'technician', 'technicianNotes'];
const POPULATE = [
  { path: 'asset', select: 'assetCode name sourceType capacity status' },
  { path: 'plant', select: 'plantName' },
  { path: 'createdBy', select: 'name' },
  { path: 'completedBy', select: 'name' },
  { path: 'statusHistory.by', select: 'name' },
];

/** Accepts "In-Progress", "in progress", "InProgress" etc. */
const normaliseStatus = (value) => {
  const key = String(value ?? '').replace(/[\s_-]/g, '').toLowerCase();
  return MAINTENANCE_STATUSES.find((s) => s.replace(/\s/g, '').toLowerCase() === key);
};

const findOr404 = async (id) => {
  const record = await MaintenanceRecord.findById(requireId(id, 'work order id'));
  if (!record) throw new ApiError(404, 'Work order not found');
  return record;
};

/** Saves, retrying once if two creates raced for the same work order number. */
const saveNew = async (record) => {
  try {
    return await record.save();
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.workOrderNumber) {
      record.workOrderNumber = undefined;
      return record.save();
    }
    throw err;
  }
};

/**
 * GET /api/maintenance?status=&priority=&type=&plant=&asset=&from=&to=&search=&overdue=true&page=&limit=
 * Date filters apply to the scheduled date.
 */
const listWorkOrders = async (req, res) => {
  const filter = {};
  const status = queryEnumList(req.query, 'status', MAINTENANCE_STATUSES);
  const priority = queryEnumList(req.query, 'priority', PRIORITIES);
  const type = queryEnumList(req.query, 'type', MAINTENANCE_TYPES);
  const plant = queryId(req.query, 'plant');
  const asset = queryId(req.query, 'asset');
  const range = dateRange(queryDate(req.query, 'from'), queryDate(req.query, 'to'));
  const search = queryString(req.query, 'search');
  if (status) filter.status = { $in: status };
  if (priority) filter.priority = { $in: priority };
  if (type) filter.maintenanceType = { $in: type };
  if (plant) filter.plant = plant;
  if (asset) filter.asset = asset;
  if (range) filter.scheduledDate = range;
  if (queryString(req.query, 'overdue') === 'true') {
    filter.status = 'Scheduled';
    filter.scheduledDate = { ...(filter.scheduledDate || {}), $lt: new Date() };
  }
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    const assetIds = await Asset.find({ $or: [{ assetCode: rx }, { name: rx }] }).distinct('_id');
    filter.$or = [{ title: rx }, { workOrderNumber: rx }, { technician: rx }, { asset: { $in: assetIds } }];
  }

  const { page, limit, skip } = pagination(req.query, { defaultLimit: 100, maxLimit: 500 });
  const [records, total] = await Promise.all([
    MaintenanceRecord.find(filter).populate(POPULATE.slice(0, 2)).sort({ scheduledDate: 1, createdAt: -1 }).skip(skip).limit(limit),
    MaintenanceRecord.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: records });
};

/** GET /api/maintenance/summary?plant=  — counts for the board header */
const getSummary = async (req, res) => {
  const plant = queryId(req.query, 'plant');
  const match = plant ? { plant: toObjectId(plant) } : {};
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byStatus, overdue, completedThisMonth, costThisMonth] = await Promise.all([
    MaintenanceRecord.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    MaintenanceRecord.countDocuments({ ...match, status: 'Scheduled', scheduledDate: { $lt: new Date() } }),
    MaintenanceRecord.countDocuments({ ...match, status: 'Completed', completedAt: { $gte: monthStart } }),
    MaintenanceRecord.aggregate([
      { $match: { ...match, status: 'Completed', completedAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$cost', 0] } } } },
    ]),
  ]);
  const counts = Object.fromEntries(MAINTENANCE_STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) counts[row._id] = row.count;
  res.json({
    success: true,
    data: {
      byStatus: counts,
      open: counts.Scheduled + counts['In Progress'],
      overdue,
      completedThisMonth,
      costThisMonth: costThisMonth[0]?.total ?? 0,
    },
  });
};

/** GET /api/maintenance/:id */
const getWorkOrder = async (req, res) => {
  const record = await findOr404(req.params.id);
  await record.populate([...POPULATE, { path: 'relatedAlert', select: 'alertType severity message status' }]);
  res.json({ success: true, data: { ...record.toJSON(), allowedTransitions: TRANSITIONS[record.status] } });
};

/** POST /api/maintenance  (Admin, Operator) */
const createWorkOrder = async (req, res) => {
  const body = pick(req.body, [...EDITABLE, 'asset', 'relatedAlert']);
  if (!isValidId(String(body.asset ?? ''))) throw new ApiError(400, 'asset is required');
  const asset = await Asset.findById(String(body.asset));
  if (!asset) throw new ApiError(400, 'Asset not found');

  let origin = 'Manual';
  if (body.relatedAlert !== undefined) {
    if (!isValidId(String(body.relatedAlert)) || !(await Alert.exists({ _id: body.relatedAlert, asset: asset._id }))) {
      throw new ApiError(400, 'relatedAlert must be an alert for this asset');
    }
    origin = 'Alert';
  }

  const record = new MaintenanceRecord({
    ...body,
    asset: asset._id,
    plant: asset.plant,
    origin,
    status: 'Scheduled',
    createdBy: req.user._id,
    statusHistory: [{ status: 'Scheduled', by: req.user._id, note: 'Work order created' }],
  });
  await saveNew(record);
  await record.populate(POPULATE.slice(0, 2));
  res.status(201).json({ success: true, data: record });
};

/** PUT /api/maintenance/:id  (Admin, Operator) — edit details of an open work order */
const updateWorkOrder = async (req, res) => {
  const record = await findOr404(req.params.id);
  if (!OPEN_STATUSES.includes(record.status) && Object.keys(pick(req.body, ['title', 'scheduledDate', 'maintenanceType', 'priority'])).length) {
    throw new ApiError(409, `A ${record.status.toLowerCase()} work order can only have its cost and notes updated`);
  }
  const update = pick(req.body, EDITABLE);
  if (!Object.keys(update).length) throw new ApiError(400, `Nothing to update. Allowed fields: ${EDITABLE.join(', ')}`);
  record.set(update);
  await record.save();
  await record.populate(POPULATE.slice(0, 2));
  res.json({ success: true, data: record });
};

/**
 * PATCH /api/maintenance/:id/status  { status, note?, cost?, technicianNotes?, completedAt? }  (Admin, Operator)
 * Completing requires technician notes describing the work done.
 */
const changeStatus = async (req, res) => {
  const record = await findOr404(req.params.id);
  const next = normaliseStatus(req.body?.status);
  if (!next) throw new ApiError(400, `status must be one of ${MAINTENANCE_STATUSES.join(', ')}`);
  if (next === record.status) throw new ApiError(409, `Work order is already ${next}`);
  if (!TRANSITIONS[record.status].includes(next)) {
    const allowed = TRANSITIONS[record.status];
    throw new ApiError(409, `Cannot move from ${record.status} to ${next}${allowed.length ? `; allowed: ${allowed.join(', ')}` : ' (final state)'}`);
  }

  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : undefined;
  const now = new Date();
  if (next === 'In Progress') record.startedAt = record.startedAt || now;
  if (next === 'Completed') {
    const notes = typeof req.body?.technicianNotes === 'string' ? req.body.technicianNotes.trim() : record.technicianNotes;
    if (!notes || notes.length < 3) throw new ApiError(400, 'technicianNotes describing the work done are required to complete a work order');
    record.technicianNotes = notes;
    if (req.body?.cost !== undefined && req.body.cost !== '') record.cost = req.body.cost;
    const completedAt = req.body?.completedAt ? new Date(req.body.completedAt) : now;
    if (Number.isNaN(completedAt.getTime()) || completedAt > new Date(now.getTime() + 60_000)) {
      throw new ApiError(400, 'completedAt must be a valid date, not in the future');
    }
    record.completedAt = completedAt;
    record.completedBy = req.user._id;
  }
  if (next === 'Cancelled') {
    if (!note) throw new ApiError(400, 'A note explaining the cancellation is required');
    record.cancelledAt = now;
  }
  if (next === 'Scheduled') {
    record.cancelledAt = undefined;
  }

  record.status = next;
  record.statusHistory.push({ status: next, at: now, by: req.user._id, note });
  await record.save();
  await record.populate(POPULATE);
  res.json({ success: true, data: { ...record.toJSON(), allowedTransitions: TRANSITIONS[record.status] } });
};

/** DELETE /api/maintenance/:id  (Admin, Operator) — only Scheduled or Cancelled orders */
const deleteWorkOrder = async (req, res) => {
  const record = await findOr404(req.params.id);
  if (!['Scheduled', 'Cancelled'].includes(record.status)) {
    throw new ApiError(409, 'Only scheduled or cancelled work orders can be deleted; completed work is kept for the record');
  }
  await record.deleteOne();
  res.json({ success: true, message: `${record.workOrderNumber} deleted` });
};

module.exports = { listWorkOrders, getSummary, getWorkOrder, createWorkOrder, updateWorkOrder, changeStatus, deleteWorkOrder };

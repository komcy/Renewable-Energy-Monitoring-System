const EnergyPlant = require('../models/EnergyPlant');
const Asset = require('../models/Asset');
const Alert = require('../models/Alert');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const { OPEN_STATUSES } = require('../models/MaintenanceRecord');
const ApiError = require('../utils/ApiError');
const {
  requireId,
  pick,
  queryEnum,
  queryString,
  pagination,
  escapeRegex,
  flattenNested,
} = require('../utils/validators');

const PLANT_FIELDS = ['plantName', 'location', 'plantType', 'capacity', 'status'];
const PLANT_TYPES = EnergyPlant.schema.path('plantType').enumValues;
const PLANT_STATUSES = EnergyPlant.schema.path('status').enumValues;

const findPlantOr404 = async (id) => {
  const plant = await EnergyPlant.findById(requireId(id, 'plant id'));
  if (!plant) throw new ApiError(404, 'Plant not found');
  return plant;
};

/** GET /api/plants?plantType=&status=&search=&page=&limit= */
const listPlants = async (req, res) => {
  const filter = {};
  const plantType = queryEnum(req.query, 'plantType', PLANT_TYPES);
  const status = queryEnum(req.query, 'status', PLANT_STATUSES);
  const search = queryString(req.query, 'search');
  if (plantType) filter.plantType = plantType;
  if (status) filter.status = status;
  if (search) filter.plantName = { $regex: escapeRegex(search), $options: 'i' };

  const { page, limit, skip } = pagination(req.query);
  const [plants, total] = await Promise.all([
    EnergyPlant.find(filter).sort({ plantName: 1 }).skip(skip).limit(limit),
    EnergyPlant.countDocuments(filter),
  ]);

  // Asset counts per plant (total and active)
  const counts = await Asset.aggregate([
    { $match: { plant: { $in: plants.map((p) => p._id) } } },
    {
      $group: {
        _id: '$plant',
        assetCount: { $sum: 1 },
        activeAssets: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
      },
    },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c]));

  res.json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: plants.map((p) => ({
      ...p.toJSON(),
      assetCount: countMap.get(p.id)?.assetCount || 0,
      activeAssets: countMap.get(p.id)?.activeAssets || 0,
    })),
  });
};

/**
 * GET /api/plants/:id  — plant with its assets, open-alert count and, per
 * asset, any open maintenance (In Progress takes precedence over Scheduled).
 */
const getPlant = async (req, res) => {
  const plant = await findPlantOr404(req.params.id);
  const [assets, openAlerts, openOrders] = await Promise.all([
    Asset.find({ plant: plant._id }).select('assetCode name sourceType capacity status healthIndex lastReadingAt').sort({ assetCode: 1 }),
    Alert.countDocuments({ plant: plant._id, status: { $in: ['Active', 'Acknowledged'] } }),
    MaintenanceRecord.find({ plant: plant._id, status: { $in: OPEN_STATUSES } })
      .select('asset workOrderNumber title status scheduledDate priority')
      .sort({ scheduledDate: 1 })
      .lean(),
  ]);

  const byAsset = new Map();
  for (const o of openOrders) {
    const key = String(o.asset);
    const entry = byAsset.get(key) || { openCount: 0, status: 'Scheduled', next: null };
    entry.openCount += 1;
    if (o.status === 'In Progress') entry.status = 'In Progress';
    if (!entry.next || (o.status === 'In Progress' && entry.next.status !== 'In Progress')) {
      entry.next = { id: String(o._id), workOrderNumber: o.workOrderNumber, title: o.title, status: o.status, scheduledDate: o.scheduledDate, priority: o.priority };
    }
    byAsset.set(key, entry);
  }

  res.json({
    success: true,
    data: {
      ...plant.toJSON(),
      assets: assets.map((a) => ({ ...a.toJSON(), maintenance: byAsset.get(a.id) ?? null })),
      openAlerts,
      openMaintenance: openOrders.length,
    },
  });
};

/** POST /api/plants  (Admin, Operator) */
const createPlant = async (req, res) => {
  const plant = await EnergyPlant.create({ ...pick(req.body, PLANT_FIELDS), createdBy: req.user._id });
  res.status(201).json({ success: true, data: plant });
};

/** PUT /api/plants/:id  (Admin, Operator) — partial update; location merges */
const updatePlant = async (req, res) => {
  const plant = await findPlantOr404(req.params.id);
  const update = pick(req.body, PLANT_FIELDS);
  if (!Object.keys(update).length) throw new ApiError(400, `Nothing to update. Allowed fields: ${PLANT_FIELDS.join(', ')}`);
  plant.set(flattenNested(update, ['location']));
  await plant.save();
  res.json({ success: true, data: plant });
};

/** DELETE /api/plants/:id  (Admin, Operator) — only when no assets are attached */
const deletePlant = async (req, res) => {
  const plant = await findPlantOr404(req.params.id);
  const assetCount = await Asset.countDocuments({ plant: plant._id });
  if (assetCount) {
    throw new ApiError(409, `Plant has ${assetCount} asset(s). Delete or move them first, or set the plant status to Offline.`);
  }
  await plant.deleteOne();
  res.json({ success: true, message: 'Plant deleted' });
};

module.exports = { listPlants, getPlant, createPlant, updatePlant, deletePlant };

const Asset = require('../models/Asset');
const { SOURCE_TYPES, SPEC_FIELDS, DEFAULT_THRESHOLDS } = require('../models/Asset');
const EnergyPlant = require('../models/EnergyPlant');
const TelemetryReading = require('../models/TelemetryReading');
const Alert = require('../models/Alert');
const ApiError = require('../utils/ApiError');
const {
  requireId,
  pick,
  queryEnum,
  queryId,
  queryString,
  pagination,
  escapeRegex,
  flattenNested,
} = require('../utils/validators');

const ASSET_STATUSES = ['Active', 'Deactivated'];
const ALL_SPEC_FIELDS = Object.values(SPEC_FIELDS);
const EDITABLE_FIELDS = ['name', 'plant', 'capacity', 'location', 'installationDate', 'thresholds', ...ALL_SPEC_FIELDS];
const CREATE_FIELDS = ['assetCode', 'sourceType', ...EDITABLE_FIELDS];

const findAssetOr404 = async (id) => {
  const asset = await Asset.findById(requireId(id, 'asset id'));
  if (!asset) throw new ApiError(404, 'Asset not found');
  return asset;
};

const ensurePlantExists = async (plantId) => {
  requireId(typeof plantId === 'string' ? plantId : undefined, 'plant id');
  if (!(await EnergyPlant.exists({ _id: plantId }))) throw new ApiError(400, 'Plant not found');
};

/** Rejects spec blocks that don't belong to the asset's type. */
const checkSpecFields = (sourceType, body) => {
  const own = SPEC_FIELDS[sourceType];
  const wrong = ALL_SPEC_FIELDS.filter((f) => f !== own && body[f] !== undefined);
  if (wrong.length) throw new ApiError(400, `${wrong.join(', ')} not valid for ${sourceType}; use ${own}`);
};

/** GET /api/assets?plant=&sourceType=&status=&search=&page=&limit= */
const listAssets = async (req, res) => {
  const filter = {};
  const plant = queryId(req.query, 'plant');
  const sourceType = queryEnum(req.query, 'sourceType', SOURCE_TYPES);
  const status = queryEnum(req.query, 'status', ASSET_STATUSES);
  const search = queryString(req.query, 'search');
  if (plant) filter.plant = plant;
  if (sourceType) filter.sourceType = sourceType;
  if (status) filter.status = status;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: rx }, { assetCode: rx }];
  }

  const { page, limit, skip } = pagination(req.query);
  const [assets, total] = await Promise.all([
    Asset.find(filter).populate('plant', 'plantName plantType').sort({ assetCode: 1 }).skip(skip).limit(limit),
    Asset.countDocuments(filter),
  ]);
  res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: assets });
};

/** GET /api/assets/:id — asset with latest reading and open alert count */
const getAsset = async (req, res) => {
  const asset = await findAssetOr404(req.params.id);
  await asset.populate('plant', 'plantName plantType location');
  const [latestReading, openAlerts] = await Promise.all([
    TelemetryReading.findOne({ asset: asset._id }).sort({ timestamp: -1 }),
    Alert.countDocuments({ asset: asset._id, status: { $in: ['Active', 'Acknowledged'] } }),
  ]);
  res.json({ success: true, data: { ...asset.toJSON(), latestReading, openAlerts } });
};

/** POST /api/assets  (Admin, Operator) */
const createAsset = async (req, res) => {
  const body = pick(req.body, CREATE_FIELDS);
  if (!SOURCE_TYPES.includes(body.sourceType)) {
    throw new ApiError(400, `sourceType is required. Allowed: ${SOURCE_TYPES.join(', ')}`);
  }
  checkSpecFields(body.sourceType, body);
  await ensurePlantExists(body.plant);

  const thresholds = { ...DEFAULT_THRESHOLDS[body.sourceType], ...(body.thresholds || {}) };
  const asset = await Asset.create({ ...body, thresholds, status: 'Active', createdBy: req.user._id });
  res.status(201).json({ success: true, data: asset });
};

/**
 * PUT /api/assets/:id  (Admin, Operator)
 * Partial update of specs, thresholds and details. assetCode, sourceType and
 * status are fixed here (status has its own endpoint).
 */
const updateAsset = async (req, res) => {
  const asset = await findAssetOr404(req.params.id);
  for (const fixed of ['assetCode', 'sourceType', 'status']) {
    if (req.body?.[fixed] !== undefined && req.body[fixed] !== asset[fixed]) {
      throw new ApiError(400, `${fixed} cannot be changed with this endpoint`);
    }
  }

  const update = pick(req.body, EDITABLE_FIELDS);
  if (!Object.keys(update).length) {
    throw new ApiError(400, `Nothing to update. Allowed fields: ${EDITABLE_FIELDS.join(', ')}`);
  }
  checkSpecFields(asset.sourceType, update);

  const plantChanged = update.plant !== undefined && String(update.plant) !== String(asset.plant);
  if (plantChanged) await ensurePlantExists(update.plant);

  asset.set(flattenNested(update, ['thresholds', ...ALL_SPEC_FIELDS]));
  await asset.save();

  // Keep denormalised plant references in history consistent
  if (plantChanged) {
    await Promise.all([
      TelemetryReading.updateMany({ asset: asset._id }, { $set: { plant: asset.plant } }),
      Alert.updateMany({ asset: asset._id }, { $set: { plant: asset.plant } }),
    ]);
  }
  res.json({ success: true, data: asset });
};

/** PATCH /api/assets/:id/status  { status: "Active" | "Deactivated" }  (Admin, Operator) */
const updateAssetStatus = async (req, res) => {
  const asset = await findAssetOr404(req.params.id);
  const status = ASSET_STATUSES.find((s) => s.toLowerCase() === String(req.body?.status ?? '').toLowerCase());
  if (!status) throw new ApiError(400, `status must be one of ${ASSET_STATUSES.join(', ')}`);

  asset.status = status;
  await asset.save();
  res.json({
    success: true,
    message: status === 'Deactivated' ? 'Asset deactivated; new telemetry will be rejected' : 'Asset activated',
    data: asset,
  });
};

/** DELETE /api/assets/:id  (Admin, Operator) — only assets with no telemetry history */
const deleteAsset = async (req, res) => {
  const asset = await findAssetOr404(req.params.id);
  if (await TelemetryReading.exists({ asset: asset._id })) {
    throw new ApiError(409, 'Asset has telemetry history and cannot be deleted. Deactivate it instead.');
  }
  await Promise.all([asset.deleteOne(), Alert.deleteMany({ asset: asset._id })]);
  res.json({ success: true, message: 'Asset deleted' });
};

module.exports = { listAssets, getAsset, createAsset, updateAsset, updateAssetStatus, deleteAsset };

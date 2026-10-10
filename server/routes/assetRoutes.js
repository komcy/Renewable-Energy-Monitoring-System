const express = require('express');
const {
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  updateAssetStatus,
  deleteAsset,
} = require('../controllers/assetController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const canWrite = authorizeRoles(['Admin', 'Operator']);

router.use(verifyToken);

router.get('/', listAssets);
router.get('/:id', getAsset);
router.post('/', canWrite, createAsset);
router.put('/:id', canWrite, updateAsset);
router.patch('/:id/status', canWrite, updateAssetStatus);
router.delete('/:id', canWrite, deleteAsset);

module.exports = router;

const express = require('express');
const {
  listWorkOrders,
  getSummary,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  changeStatus,
  deleteWorkOrder,
} = require('../controllers/maintenanceController');
const { getAssetDiagnostics, evaluateAndSchedule, getFleetRisk, getRootCause } = require('../controllers/diagnosticsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const canManage = authorizeRoles(['Admin', 'Operator']);

router.use(verifyToken);

router.get('/', listWorkOrders);
router.get('/summary', getSummary);
// Predictive diagnostics: declared before '/:id' so these paths are not read as work-order ids
router.get('/diagnostics', getFleetRisk);
router.get('/diagnostics/alerts/:alertId', getRootCause);
router.get('/diagnostics/:assetId', getAssetDiagnostics);
router.post('/diagnostics/:assetId/evaluate', canManage, evaluateAndSchedule);
router.get('/:id', getWorkOrder);
router.post('/', canManage, createWorkOrder);
router.put('/:id', canManage, updateWorkOrder);
router.patch('/:id/status', canManage, changeStatus);
router.delete('/:id', canManage, deleteWorkOrder);

module.exports = router;

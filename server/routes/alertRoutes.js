const express = require('express');
const {
  listAlerts,
  listActiveAlerts,
  getAlertSummary,
  getAlertCounts,
  getAlert,
  acknowledgeAlert,
  resolveAlert,
} = require('../controllers/alertController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const canWrite = authorizeRoles(['Admin', 'Operator']);

router.use(verifyToken);

router.get('/', listAlerts);
router.get('/active', listActiveAlerts);
router.get('/summary', getAlertSummary);
router.get('/counts', getAlertCounts);
router.get('/:id', getAlert);
router.patch('/:id/acknowledge', canWrite, acknowledgeAlert);
router.patch('/:id/resolve', canWrite, resolveAlert);

module.exports = router;

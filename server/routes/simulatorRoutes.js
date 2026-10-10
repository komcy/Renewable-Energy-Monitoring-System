const express = require('express');
const {
  startSimulator,
  stopSimulator,
  getSimulatorStatus,
  injectAnomaly,
} = require('../controllers/simulatorController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const canControl = authorizeRoles(['Admin', 'Operator']);

router.use(verifyToken);

router.get('/status', getSimulatorStatus);
router.post('/start', canControl, startSimulator);
router.post('/stop', canControl, stopSimulator);
router.post('/anomaly', canControl, injectAnomaly);

module.exports = router;

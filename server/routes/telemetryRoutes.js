const express = require('express');
const {
  ingestTelemetry,
  getTelemetry,
  getLatestTelemetry,
  getAggregatedTelemetry,
} = require('../controllers/telemetryController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', getTelemetry);
router.get('/latest', getLatestTelemetry);
router.get('/aggregate', getAggregatedTelemetry);
router.post('/', authorizeRoles(['Admin', 'Operator']), ingestTelemetry);

module.exports = router;

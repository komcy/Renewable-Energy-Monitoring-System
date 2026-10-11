const express = require('express');
const { generateReport, listReports, getReport, downloadReport, deleteReport } = require('../controllers/reportController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// All signed-in roles can generate, view and download reports (read-only on
// monitoring data); deleting is limited to Admins and the author in the controller
router.use(verifyToken);

router.get('/', listReports);
router.post('/', generateReport);
router.get('/:id', getReport);
router.get('/:id/download', downloadReport);
router.delete('/:id', deleteReport);

module.exports = router;

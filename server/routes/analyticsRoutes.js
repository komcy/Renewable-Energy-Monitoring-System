const express = require('express');
const { dashboard } = require('../controllers/analyticsController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/dashboard', dashboard);

module.exports = router;

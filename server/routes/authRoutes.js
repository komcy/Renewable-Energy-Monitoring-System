const express = require('express');
const { register, login, getMe, changePassword } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', verifyToken, getMe);
router.post('/change-password', verifyToken, changePassword);

module.exports = router;

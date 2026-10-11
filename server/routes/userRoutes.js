const express = require('express');
const {
  listUsers,
  createUser,
  updateUser,
  revokeSessions,
  resetPassword,
} = require('../controllers/userController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// User administration is Admin-only
router.use(verifyToken, authorizeRoles('Admin'));

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.post('/:id/revoke-sessions', revokeSessions);
router.post('/:id/reset-password', resetPassword);

module.exports = router;

const express = require('express');
const { listPlants, getPlant, createPlant, updatePlant, deletePlant } = require('../controllers/plantController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const canWrite = authorizeRoles(['Admin', 'Operator']);

router.use(verifyToken);

router.get('/', listPlants);
router.get('/:id', getPlant);
router.post('/', canWrite, createPlant);
router.put('/:id', canWrite, updatePlant);
router.delete('/:id', canWrite, deletePlant);

module.exports = router;

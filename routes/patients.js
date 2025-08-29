
const express = require('express');
const router = express.Router();
const { verifyToken, requireDentistOrAssistant, checkDentistAccess } = require('../middleware/auth');
const { validatePatient } = require('../middleware/validation');
const { getPatients, getPatientById, createPatient, updatePatient, archivePatient, restorePatient } = require('../controllers/patients');

router.use(verifyToken);
router.use(requireDentistOrAssistant);
router.use(checkDentistAccess);

router.get('/', getPatients);
router.get('/:id', getPatientById);
router.post('/', validatePatient, createPatient);
router.put('/:id', validatePatient, updatePatient);
router.post('/archive/:id', archivePatient);
router.post('/restore/:id', restorePatient);

module.exports = router;

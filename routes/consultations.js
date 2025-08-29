const express = require('express');
const router = express.Router();
const { verifyToken, requireDentistOrAssistant, checkDentistAccess, blockPaymentAccess } = require('../middleware/auth');
const { validateConsultation } = require('../middleware/validation');
const { getConsultations, getConsultationById, createConsultation, updateConsultation, deleteConsultation, printReceipt } = require('../controllers/consultations');

router.use(verifyToken);
router.use(requireDentistOrAssistant);
router.use(checkDentistAccess);

router.get('/', getConsultations);
router.get('/:id', getConsultationById);
router.post('/', validateConsultation, createConsultation);
router.put('/:id', validateConsultation, updateConsultation);
router.delete('/:id', deleteConsultation);
router.get('/:id/receipt', blockPaymentAccess, printReceipt);

module.exports = router;

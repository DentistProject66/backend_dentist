const express = require('express');
const router = express.Router();
const { verifyToken, requireDentist, checkDentistAccess, blockPaymentAccess } = require('../middleware/auth');
const { validatePayment } = require('../middleware/validation');
const { getPayments, getPaymentById, createPayment, updatePayment, deletePayment, getFinancialReports, printPaymentReceipt,editPaymentByPatient } = require('../controllers/payments');

router.use(verifyToken);
router.use(requireDentist);
router.use(checkDentistAccess);
router.use(blockPaymentAccess);

router.get('/', getPayments);
router.get('/reports', getFinancialReports); // Move this BEFORE /:id
router.get('/:id', getPaymentById);
router.post('/', validatePayment, createPayment);
router.put('/:id', validatePayment, updatePayment);
router.delete('/:id', deletePayment);
router.get('/:id/receipt', printPaymentReceipt);
router.put('/:payment_id/patient/:patient_id', editPaymentByPatient); 

module.exports = router;
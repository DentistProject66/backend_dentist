const express = require('express');
const router = express.Router();
const { verifyToken, requireDentist, checkDentistAccess, blockPaymentAccess } = require('../middleware/auth');
const { validatePayment } = require('../middleware/validation');
const { getPayments, getPaymentById, createPayment, updatePayment, deletePayment, getFinancialReports, printPaymentReceipt } = require('../controllers/payments');

router.use(verifyToken);
router.use(requireDentist);
router.use(checkDentistAccess);
router.use(blockPaymentAccess);

router.get('/', getPayments);
router.get('/:id', getPaymentById);
router.post('/', validatePayment, createPayment);
router.put('/:id', validatePayment, updatePayment);
router.delete('/:id', deletePayment);
router.get('/reports', getFinancialReports);
router.get('/:id/receipt', printPaymentReceipt);

module.exports = router;

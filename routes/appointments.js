const express = require('express');
const router = express.Router();
const { verifyToken, requireDentistOrAssistant, checkDentistAccess } = require('../middleware/auth');
const { validateAppointment,validateAppointmentUpdate,validateParamId } = require('../middleware/validation');
const { getAppointments, getAppointmentsByDate, getAppointmentById, createAppointment, updateAppointment, cancelAppointment, completeAppointment, getAvailableTimeSlots, getDailySchedule } = require('../controllers/appointments');

router.use(verifyToken);
router.use(requireDentistOrAssistant);
router.use(checkDentistAccess);

router.get('/', getAppointments);
router.get('/schedule/:date', getAppointmentsByDate);
router.get('/:id', getAppointmentById);
router.post('/', validateAppointment, createAppointment);
router.put('/:id', validateAppointmentUpdate, updateAppointment);
router.post('/cancel/:id',validateParamId, cancelAppointment);
router.post('/complete/:id', completeAppointment);
router.get('/slots/:date', getAvailableTimeSlots);
router.get('/daily', getDailySchedule);

module.exports = router;

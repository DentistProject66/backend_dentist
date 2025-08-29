const express = require('express');
const router = express.Router();
const { verifyToken, requireDentistOrAssistant, checkDentistAccess } = require('../middleware/auth');
const { validateAppointment } = require('../middleware/validation');
const { getAppointments, getAppointmentsByDate, getAppointmentById, createAppointment, updateAppointment, cancelAppointment, completeAppointment, getAvailableTimeSlots, getDailySchedule } = require('../controllers/appointments');

router.use(verifyToken);
router.use(requireDentistOrAssistant);
router.use(checkDentistAccess);

router.get('/', getAppointments);
router.get('/schedule/:date', getAppointmentsByDate);
router.get('/:id', getAppointmentById);
router.post('/', validateAppointment, createAppointment);
router.put('/:id', validateAppointment, updateAppointment);
router.post('/cancel/:id', cancelAppointment);
router.post('/complete/:id', completeAppointment);
router.get('/slots/:date', getAvailableTimeSlots);
router.get('/daily', getDailySchedule);

module.exports = router;

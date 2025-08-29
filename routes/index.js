const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const patientRoutes = require('./patients');
const consultationRoutes = require('./consultations');
const appointmentRoutes = require('./appointments');
const paymentRoutes = require('./payments');
const archiveRoutes = require('./archives');

// Mount routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/patients', patientRoutes);
router.use('/consultations', consultationRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/payments', paymentRoutes);
router.use('/archives', archiveRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Dental Practice Management API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
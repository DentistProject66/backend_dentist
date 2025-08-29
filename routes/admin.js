const express = require('express');
const router = express.Router();
const { verifyToken, requireSuperAdmin } = require('../middleware/auth');
const {
  getPendingRegistrations,
  getAllUsers,
  approveUser,
  rejectUser,
  getSystemStats,
  getDentistDetails
} = require('../controllers/adminController');

// Apply authentication middleware to all admin routes
router.use(verifyToken);
router.use(requireSuperAdmin);

// @route   GET /api/admin/pending-registrations
// @desc    Get all pending user registrations
// @access  Private (Super Admin only)
router.get('/pending-registrations', getPendingRegistrations);

// @route   GET /api/admin/users
// @desc    Get all users with pagination and filters
// @access  Private (Super Admin only)
router.get('/users', getAllUsers);

// @route   POST /api/admin/approve/:userId
// @desc    Approve user registration
// @access  Private (Super Admin only)
router.post('/approve/:userId', approveUser);

// @route   POST /api/admin/reject/:userId
// @desc    Reject user registration
// @access  Private (Super Admin only)
router.post('/reject/:userId', rejectUser);

// @route   GET /api/admin/stats
// @desc    Get system statistics
// @access  Private (Super Admin only)
router.get('/stats', getSystemStats);

// @route   GET /api/admin/dentist/:dentistId
// @desc    Get detailed information about a specific dentist
// @access  Private (Super Admin only)
router.get('/dentist/:dentistId', getDentistDetails);

module.exports = router;
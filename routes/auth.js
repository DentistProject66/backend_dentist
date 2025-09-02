const express = require('express');
const router = express.Router();
const { verifyToken, requireSuperAdmin, requireDentist, requireDentistOrAssistant, checkDentistAccess, blockPaymentAccess } = require('../middleware/auth');
const { validateUserRegistration, validateUserLogin } = require('../middleware/validation');
const { register, login, getProfile, updateProfile, changePassword, approveUser, createConsultation } = require('../controllers/authController');
const {getPayments} =require('../controllers/payments');
const {getPatients} =require('../controllers/patients');
// @route   POST /api/auth/register
// @desc    Register new user (dentist or assistant)
// @access  Public
router.post('/register', validateUserRegistration, register);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateUserLogin, login);

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', verifyToken, requireDentistOrAssistant, checkDentistAccess, getProfile);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', verifyToken, requireDentistOrAssistant, checkDentistAccess, updateProfile);

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', verifyToken, requireDentistOrAssistant, checkDentistAccess, changePassword);

// @route   PUT /api/auth/approve-user
// @desc    Approve a user and handle assignments
// @access  Private (Super Admin only)
router.put('/approve-user', verifyToken, requireSuperAdmin, approveUser);

// @route   POST /api/auth/consultations
// @desc    Create a new consultation (dentist or assigned assistant)
// @access  Private
router.post('/consultations', verifyToken, requireDentistOrAssistant, checkDentistAccess, createConsultation);

// @route   GET /api/auth/payments
// @desc    Get payment information
// @access  Private (Dentist only, blocks assistants)
router.get('/payments', verifyToken, requireDentist, checkDentistAccess, blockPaymentAccess, getPayments); // Assuming getPayments exists

// @route   GET /api/auth/patients
// @desc    Get patient records (dentist or assigned assistant)
// @access  Private
router.get('/patients', verifyToken, requireDentistOrAssistant, checkDentistAccess, getPatients); // Assuming getPatients exists

module.exports = router;
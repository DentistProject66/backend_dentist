
const { body, param,validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }
  next();
};

// User registration validation
const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('first_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('last_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('practice_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Practice name must be between 2 and 100 characters'),
  handleValidationErrors
];

// User login validation
const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Patient validation
const validatePatient = [
  body('first_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('last_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  handleValidationErrors
];

// Consultation validation
const validateConsultation = [
  body('first_name')
    .notEmpty()
    .withMessage('First name is required')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters'),
  body('last_name')
    .notEmpty()
    .withMessage('Last name is required')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be between 1 and 100 characters'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number must not exceed 20 characters'),
  body('date_of_consultation')
    .notEmpty()
    .withMessage('Date of consultation is required')
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid consultation date (YYYY-MM-DD)'),
  body('type_of_prosthesis')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Type of prosthesis must be between 2 and 255 characters'),
  body('total_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total price must be a positive number'),
  body('amount_paid')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount paid must be a positive number'),
  body('needs_followup')
    .optional()
    .isBoolean()
    .withMessage('Needs followup must be true or false'),
  body('follow_up_date')
    .if(body('needs_followup').equals(true))
    .notEmpty()
    .withMessage('Follow-up date is required when needs_followup is true')
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid follow-up date (YYYY-MM-DD)'),
  body('follow_up_time')
    .if(body('needs_followup').equals(true))
    .notEmpty()
    .withMessage('Follow-up time is required when needs_followup is true')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid time in HH:MM format'),
  handleValidationErrors
];
// Appointment validation
const validateAppointment = [
  body('patient_id')
    .isInt({ min: 1 })
    .withMessage('Valid patient ID is required'),
  body('consultation_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Consultation ID must be a positive integer'),
  body('appointment_date')
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid appointment date'),
  body('appointment_time')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid time in HH:MM format'),
  body('patient_name')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Patient name must be between 2 and 200 characters'),
  body('patient_phone')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('treatment_type')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Treatment type must be between 2 and 255 characters'),
  body('status')
    .optional()
    .isIn(['confirmed', 'pending', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters'),
  handleValidationErrors
];

const validateAppointmentUpdate = [
  body('patient_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid patient ID is required'),
  body('consultation_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Consultation ID must be a positive integer'),
  body('appointment_date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid appointment date'),
  body('appointment_time')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid time in HH:MM format'),
  body('patient_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Patient name must be between 2 and 200 characters'),
  body('patient_phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('treatment_type')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Treatment type must be between 2 and 255 characters'),
  body('status')
    .optional()
    .isIn(['confirmed', 'pending', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters'),
  handleValidationErrors
];

const validateConsultationUpdate = [
  body('date_of_consultation')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid consultation date (YYYY-MM-DD)'),
  body('type_of_prosthesis')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Type of prosthesis must be between 2 and 255 characters'),
  body('total_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total price must be a positive number'),
  body('amount_paid')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount paid must be a positive number'),
  body('needs_followup')
    .optional()
    .isBoolean()
    .withMessage('Needs followup must be true or false'),
  body('follow_up_date')
    .if(body('needs_followup').equals(true))
    .notEmpty()
    .withMessage('Follow-up date is required when needs_followup is true')
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid follow-up date (YYYY-MM-DD)'),
  body('follow_up_time')
    .if(body('needs_followup').equals(true))
    .notEmpty()
    .withMessage('Follow-up time is required when needs_followup is true')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Please provide a valid time in HH:MM format'),
  handleValidationErrors
];
// Payment validation
const validatePayment = [
  body('consultation_id')
    .isInt({ min: 1 })
    .withMessage('Valid consultation ID is required'),
  body('patient_id')
    .isInt({ min: 1 })
    .withMessage('Valid patient ID is required'),
  body('patient_name')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Patient name must be between 2 and 200 characters'),
  body('payment_date')
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid payment date'),
  body('amount_paid')
    .isFloat({ min: 0.01 })
    .withMessage('Amount paid must be greater than 0'),
  body('payment_method')
    .isIn(['cash', 'check', 'card'])
    .withMessage('Payment method must be cash, check, or card'),
  body('remaining_balance')
    .isFloat({ min: 0 })
    .withMessage('Remaining balance must be 0 or greater'),
  handleValidationErrors
];

// ID parameter validation
const validateId = [
  body('id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
  handleValidationErrors
];
const validateParamId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validatePatient,
  validateConsultation,
  validateAppointment,
  validatePayment,
  validateId,
  validateParamId,
  handleValidationErrors,
  validateConsultationUpdate,
  validateAppointmentUpdate
};

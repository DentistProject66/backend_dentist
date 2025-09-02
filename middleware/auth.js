const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/db');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await executeQuery(
      'SELECT id, email, first_name, last_name, role, status FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user.length) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }

    if (user[0].status !== 'approved') {
      return res.status(401).json({
        success: false,
        message: 'Account not approved. Please wait for admin approval.'
      });
    }

    req.user = user[0];
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Check if user is super admin
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super admin privileges required.'
    });
  }
  next();
};

// Check if user is dentist
const requireDentist = (req, res, next) => {
  if (req.user.role !== 'dentist') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Dentist privileges required.'
    });
  }
  next();
};

// Check if user is dentist or assistant
const requireDentistOrAssistant = (req, res, next) => {
  if (!['dentist', 'assistant'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Dentist or assistant privileges required.'
    });
  }
  next();
};

// Check if user has access to specific dentist's data
const checkDentistAccess = async (req, res, next) => {
  try {
    const requestedDentistId = req.params.dentistId || req.body.dentistId;

    if (req.user.role === 'super_admin') {
      // Super admin can access all data
      return next();
    }

    if (req.user.role === 'dentist') {
      // Dentist can only access their own data
      if (parseInt(requestedDentistId) !== req.user.id && requestedDentistId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own practice data.'
        });
      }
      req.dentistId = req.user.id;
    } else if (req.user.role === 'assistant') {
      // Assistant can only access their assigned dentist's data
      const assignment = await executeQuery(
        'SELECT dentist_id FROM user_assignments WHERE assistant_id = ?',
        [req.user.id]
      );

      if (!assignment.length) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned to any dentist.'
        });
      }

      const assignedDentistId = assignment[0].dentist_id;

      if (requestedDentistId && parseInt(requestedDentistId) !== assignedDentistId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your assigned dentist\'s data.'
        });
      }

      req.dentistId = assignedDentistId;
    }

    next();
  } catch (error) {
    console.error('Access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during access verification.'
    });
  }
};

// Block payment access for assistants
const blockPaymentAccess = (req, res, next) => {
  if (req.user.role === 'assistant') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Assistants cannot access payment information.'
    });
  }
  next();
};

module.exports = {
  verifyToken,
  requireSuperAdmin,
  requireDentist,
  requireDentistOrAssistant,
  checkDentistAccess,
  blockPaymentAccess
};
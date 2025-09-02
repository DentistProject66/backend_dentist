const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/db');

// Generate JWT token
const generateToken = (userId, role) => {
  console.log('Generating token with userId:', userId, 'role:', role); // Debug
  return jwt.sign({ userId, role }, process.env.JWT_SECRET || 'cddff1e9869fb158847363d6a2cbebf0b8aaae2669d10cb920b20c8218e68682', {
    expiresIn: process.env.JWT_EXPIRE || '1h'
  });
};

// Assign assistant to dentist based on practice_name
const assignAssistant = async (newUserId, role, practice_name) => {
  try {
    // Only proceed if the new user is an assistant or dentist
    if (role !== 'assistant' && role !== 'dentist') return;

    // Find matching users of the opposite role with the same practice_name and approved status
    const oppositeRole = role === 'assistant' ? 'dentist' : 'assistant';
    const matchingUsers = await executeQuery(
      'SELECT id FROM users WHERE role = ? AND practice_name = ? AND status = ?',
      [oppositeRole, practice_name, 'approved']
    );

    if (matchingUsers.length > 0) {
      const oppositeUserId = matchingUsers[0].id; // Use first match (adjust if multiple matches needed)
      const isAssignmentExists = await executeQuery(
        'SELECT id FROM user_assignments WHERE dentist_id = ? AND assistant_id = ?',
        [role === 'dentist' ? newUserId : oppositeUserId, role === 'assistant' ? newUserId : oppositeUserId]
      );

      if (!isAssignmentExists.length) {
        await executeQuery(
          'INSERT INTO user_assignments (dentist_id, assistant_id) VALUES (?, ?)',
          [role === 'dentist' ? newUserId : oppositeUserId, role === 'assistant' ? newUserId : oppositeUserId]
        );
        console.log(`Assigned ${role} ${newUserId} to ${oppositeRole} ${oppositeUserId} with practice_name: ${practice_name}`);
      }
    } else {
      console.log(`No ${oppositeRole} found with practice_name: ${practice_name} for ${role} ${newUserId}`);
    }
  } catch (error) {
    console.error('Assignment error:', error);
  }
};

// Register new user (dentist or assistant)
const register = async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, role = 'dentist', practice_name } = req.body;

    // Check if user already exists
    const existingUser = await executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS));

    // Insert new user
    const result = await executeQuery(`
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role, practice_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [email, hashedPassword, first_name, last_name, phone, role, practice_name]);

    const newUserId = result.insertId;

    // Trigger assignment check after registration
    await assignAssistant(newUserId, role, practice_name);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please wait for admin approval.',
      data: {
        userId: newUserId,
        email,
        first_name,
        last_name,
        role,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const users = await executeQuery(
      'SELECT id, email, password_hash, first_name, last_name, role, status, practice_name FROM users WHERE email = ?',
      [email]
    );

    console.log('Database query result:', users); // Debug query result

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users[0];
    console.log('User object:', user); // Debug user object

    // Check if account is approved
    if (user.status !== 'approved') {
      let message = 'Account not approved';
      if (user.status === 'pending') {
        message = 'Account pending approval. Please wait for admin approval.';
      } else if (user.status === 'rejected') {
        message = 'Account has been rejected. Please contact support.';
      }
      
      return res.status(401).json({
        success: false,
        message
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token with role
    const token = generateToken(user.id, user.role);

    // If user is assistant, get assigned dentist info
    let assignedDentist = null;
    if (user.role === 'assistant') {
      const assignment = await executeQuery(`
        SELECT d.id, d.first_name, d.last_name, d.practice_name 
        FROM user_assignments ua 
        JOIN users d ON ua.dentist_id = d.id 
        WHERE ua.assistant_id = ?
      `, [user.id]);
      
      if (assignment.length > 0) {
        assignedDentist = assignment[0];
      }
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          practice_name: user.practice_name,
          assigned_dentist: assignedDentist
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await executeQuery(`
      SELECT id, email, first_name, last_name, phone, role, practice_name, status, created_at
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If user is assistant, get assigned dentist info
    let assignedDentist = null;
    if (user[0].role === 'assistant') {
      const assignment = await executeQuery(`
        SELECT d.id, d.first_name, d.last_name, d.practice_name 
        FROM user_assignments ua 
        JOIN users d ON ua.dentist_id = d.id 
        WHERE ua.assistant_id = ?
      `, [req.user.id]);
      
      if (assignment.length > 0) {
        assignedDentist = assignment[0];
      }
    }

    res.json({
      success: true,
      data: {
        ...user[0],
        assigned_dentist: assignedDentist
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, phone, practice_name } = req.body;
    const userId = req.user.id;

    await executeQuery(`
      UPDATE users 
      SET first_name = ?, last_name = ?, phone = ?, practice_name = ?
      WHERE id = ?
    `, [first_name, last_name, phone, practice_name, userId]);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    // Get current password hash
    const user = await executeQuery(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user[0].password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(new_password, parseInt(process.env.BCRYPT_ROUNDS));

    // Update password
    await executeQuery(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hashedNewPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

// Approve user and handle assignments (optional, if used)
const approveUser = async (req, res) => {
  try {
    const { userId, status } = req.body;

    if (status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Status must be "approved" for this action.'
      });
    }

    const user = await executeQuery(
      'SELECT id, role, practice_name, status FROM users WHERE id = ?',
      [userId]
    );

    if (!user.length || user[0].status !== 'pending') {
      return res.status(404).json({
        success: false,
        message: 'User not found or not pending approval.'
      });
    }

    await executeQuery(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, userId]
    );

    // Trigger assignment check after approval (optional, if moved from register)
    await assignAssistant(userId, user[0].role, user[0].practice_name);

    res.json({
      success: true,
      message: 'User approved successfully.'
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve user.'
    });
  }
};

// Create a new consultation
const createConsultation = async (req, res) => {
  try {
    const { patientId, date, typeOfProsthesis, totalPrice, amountPaid } = req.body;
    const dentistId = req.dentistId; // Set by checkDentistAccess

    // Insert consultation (example logic)
    const result = await executeQuery(
      'INSERT INTO consultations (dentist_id, patient_id, date, type_of_prosthesis, total_price, amount_paid) VALUES (?, ?, ?, ?, ?, ?)',
      [dentistId, patientId, date, typeOfProsthesis, totalPrice, amountPaid]
    );

    res.status(201).json({
      success: true,
      message: 'Consultation created successfully',
      data: { consultationId: result.insertId }
    });
  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create consultation'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  approveUser,
  createConsultation,
  assignAssistant
};
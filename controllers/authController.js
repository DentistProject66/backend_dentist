const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/db');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
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

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please wait for admin approval.',
      data: {
        userId: result.insertId,
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

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

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

    // Generate token
    const token = generateToken(user.id);

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

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword
};
const { executeQuery, executeTransaction } = require('../config/db');

// Get all pending registrations
const getPendingRegistrations = async (req, res) => {
  try {
    const pendingUsers = await executeQuery(`
      SELECT id, email, first_name, last_name, phone, role, practice_name, created_at
      FROM users 
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `);

    res.json({
      success: true,
      data: pendingUsers
    });

  } catch (error) {
    console.error('Get pending registrations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending registrations'
    });
  }
};

// Get all users with status
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, role } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (status) {
      whereClause += ' WHERE status = ?';
      params.push(status);
    }

    if (role) {
      whereClause += status ? ' AND role = ?' : ' WHERE role = ?';
      params.push(role);
    }

    const users = await executeQuery(`
      SELECT id, email, first_name, last_name, phone, role, practice_name, status, created_at, approved_at
      FROM users 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Get total count
    const totalCount = await executeQuery(`
      SELECT COUNT(*) as count FROM users ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount[0].count,
          pages: Math.ceil(totalCount[0].count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
};

// Approve user registration
const approveUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.id;

    // Check if user exists and is pending
    const user = await executeQuery(
      'SELECT id, email, first_name, last_name, status FROM users WHERE id = ? AND status = "pending"',
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found or already processed'
      });
    }

    // Approve user
    await executeQuery(`
      UPDATE users 
      SET status = 'approved', approved_at = NOW(), approved_by = ?
      WHERE id = ?
    `, [adminId, userId]);

    res.json({
      success: true,
      message: `User ${user[0].first_name} ${user[0].last_name} approved successfully`,
      data: {
        userId: user[0].id,
        email: user[0].email,
        status: 'approved'
      }
    });

  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve user'
    });
  }
};

// Reject user registration
const rejectUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.id;

    // Check if user exists and is pending
    const user = await executeQuery(
      'SELECT id, email, first_name, last_name, status FROM users WHERE id = ? AND status = "pending"',
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found or already processed'
      });
    }

    // Reject user
    await executeQuery(`
      UPDATE users 
      SET status = 'rejected', approved_at = NOW(), approved_by = ?
      WHERE id = ?
    `, [adminId, userId]);

    res.json({
      success: true,
      message: `User ${user[0].first_name} ${user[0].last_name} rejected`,
      data: {
        userId: user[0].id,
        email: user[0].email,
        status: 'rejected'
      }
    });

  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject user'
    });
  }
};

// Get system statistics
const getSystemStats = async (req, res) => {
  try {
    // Get user statistics
    const userStats = await executeQuery(`
      SELECT 
        role,
        status,
        COUNT(*) as count
      FROM users
      GROUP BY role, status
    `);

    // Get total patients across all dentists
    const patientStats = await executeQuery(`
      SELECT 
        COUNT(*) as total_patients,
        COUNT(CASE WHEN is_archived = 0 THEN 1 END) as active_patients,
        COUNT(CASE WHEN is_archived = 1 THEN 1 END) as archived_patients
      FROM patients
    `);

    // Get consultation statistics
    const consultationStats = await executeQuery(`
      SELECT 
        COUNT(*) as total_consultations,
        SUM(total_price) as total_revenue,
        SUM(amount_paid) as total_paid,
        SUM(remaining_balance) as total_outstanding
      FROM consultations
    `);

    // Get monthly registration trend
    const monthlyRegistrations = await executeQuery(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as registrations
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // Format user stats
    const formattedUserStats = {};
    userStats.forEach(stat => {
      if (!formattedUserStats[stat.role]) {
        formattedUserStats[stat.role] = {};
      }
      formattedUserStats[stat.role][stat.status] = stat.count;
    });

    res.json({
      success: true,
      data: {
        users: formattedUserStats,
        patients: patientStats[0],
        consultations: consultationStats[0],
        monthly_registrations: monthlyRegistrations
      }
    });

  } catch (error) {
    console.error('Get system stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system statistics'
    });
  }
};

// Get dentist details with their assistants and practice info
const getDentistDetails = async (req, res) => {
  try {
    const { dentistId } = req.params;

    // Get dentist info
    const dentist = await executeQuery(`
      SELECT id, email, first_name, last_name, phone, practice_name, status, created_at, approved_at
      FROM users 
      WHERE id = ? AND role = 'dentist'
    `, [dentistId]);

    if (dentist.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dentist not found'
      });
    }

    // Get assigned assistants
    const assistants = await executeQuery(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.phone, ua.assigned_at
      FROM user_assignments ua
      JOIN users u ON ua.assistant_id = u.id
      WHERE ua.dentist_id = ?
    `, [dentistId]);

    // Get practice statistics
    const practiceStats = await executeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM patients WHERE dentist_id = ? AND is_archived = 0) as active_patients,
        (SELECT COUNT(*) FROM consultations WHERE dentist_id = ?) as total_consultations,
        (SELECT SUM(total_price) FROM consultations WHERE dentist_id = ?) as total_revenue,
        (SELECT SUM(remaining_balance) FROM consultations WHERE dentist_id = ?) as outstanding_balance
    `, [dentistId, dentistId, dentistId, dentistId]);

    res.json({
      success: true,
      data: {
        dentist: dentist[0],
        assistants,
        statistics: practiceStats[0]
      }
    });

  } catch (error) {
    console.error('Get dentist details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dentist details'
    });
  }
};

module.exports = {
  getPendingRegistrations,
  getAllUsers,
  approveUser,
  rejectUser,
  getSystemStats,
  getDentistDetails
};
const { executeQuery, executeTransaction } = require('../config/db');

// Get all patients for a dentist
const getPatients = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, archived } = req.query;
    const dentistId = req.dentistId;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE dentist_id = ?';
    let params = [dentistId];

    // Filter by archived status
    if (archived !== undefined) {
      whereClause += ' AND is_archived = ?';
      params.push(archived === 'true' ? 1 : 0);
    }

    // Search functionality
    if (search) {
      whereClause += ' AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Get patients with latest consultation info
    const patients = await executeQuery(`
      SELECT 
        p.id, p.first_name, p.last_name, p.phone, p.created_at, p.is_archived,
        c.id as latest_consultation_id,
        c.date_of_consultation as last_consultation_date,
        c.type_of_prosthesis as latest_treatment,
        c.total_price,
        c.amount_paid,
        c.remaining_balance,
        CASE 
          WHEN c.remaining_balance = 0 THEN 'Paid'
          WHEN c.amount_paid = 0 THEN 'Pending'
          ELSE 'Partial'
        END as payment_status,
        a.appointment_date as next_appointment_date,
        a.appointment_time as next_appointment_time
      FROM patients p
      LEFT JOIN consultations c ON p.id = c.patient_id 
        AND c.id = (SELECT MAX(id) FROM consultations WHERE patient_id = p.id)
      LEFT JOIN appointments a ON p.id = a.patient_id 
        AND a.appointment_date >= CURDATE() 
        AND a.status IN ('scheduled', 'confirmed', 'pending')
        AND a.id = (SELECT MIN(id) FROM appointments WHERE patient_id = p.id AND appointment_date >= CURDATE() AND status IN ('scheduled', 'confirmed', 'pending'))
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Get total count
    const totalCount = await executeQuery(`
      SELECT COUNT(*) as count FROM patients ${whereClause}
    `, params);

    // If user is assistant, remove payment information
    if (req.user.role === 'assistant') {
      patients.forEach(patient => {
        delete patient.total_price;
        delete patient.amount_paid;
        delete patient.remaining_balance;
        delete patient.payment_status;
      });
    }

    res.json({
      success: true,
      data: {
        patients,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount[0].count,
          pages: Math.ceil(totalCount[0].count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patients'
    });
  }
};

// Get patient by ID with full details
const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get patient info
    const patient = await executeQuery(`
      SELECT * FROM patients 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (patient.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get all consultations
    const consultations = await executeQuery(`
      SELECT * FROM consultations 
      WHERE patient_id = ?
      ORDER BY date_of_consultation DESC
    `, [id]);

    // Get all appointments
    const appointments = await executeQuery(`
      SELECT * FROM appointments 
      WHERE patient_id = ?
      ORDER BY appointment_date DESC, appointment_time DESC
    `, [id]);

    let payments = [];
    
    // Get payments only if user is not assistant
    if (req.user.role !== 'assistant') {
      payments = await executeQuery(`
        SELECT * FROM payments 
        WHERE patient_id = ?
        ORDER BY payment_date DESC
      `, [id]);
    }

    // If user is assistant, remove payment information from consultations
    if (req.user.role === 'assistant') {
      consultations.forEach(consultation => {
        delete consultation.total_price;
        delete consultation.amount_paid;
        delete consultation.remaining_balance;
      });
    }

    res.json({
      success: true,
      data: {
        patient: patient[0],
        consultations,
        appointments,
        payments
      }
    });

  } catch (error) {
    console.error('Get patient by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patient details'
    });
  }
};

// Create new patient
const createPatient = async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body;
    const dentistId = req.dentistId;
    const createdBy = req.user.id;

    // Check if patient already exists for this dentist
    const existingPatient = await executeQuery(`
      SELECT id FROM patients 
      WHERE dentist_id = ? AND phone = ? AND is_archived = 0
    `, [dentistId, phone]);

    if (existingPatient.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Patient with this phone number already exists'
      });
    }

    // Create new patient
    const result = await executeQuery(`
      INSERT INTO patients (dentist_id, first_name, last_name, phone, created_by)
      VALUES (?, ?, ?, ?, ?)
    `, [dentistId, first_name, last_name, phone, createdBy]);

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      data: {
        id: result.insertId,
        first_name,
        last_name,
        phone
      }
    });

  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create patient'
    });
  }
};

// Update patient
const updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, phone } = req.body;
    const dentistId = req.dentistId;

    // Check if patient exists and belongs to this dentist
    const patient = await executeQuery(`
      SELECT id FROM patients 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (patient.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Check if phone number is taken by another patient
    const existingPatient = await executeQuery(`
      SELECT id FROM patients 
      WHERE dentist_id = ? AND phone = ? AND id != ? AND is_archived = 0
    `, [dentistId, phone, id]);

    if (existingPatient.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Another patient with this phone number already exists'
      });
    }

    // Update patient
    await executeQuery(`
      UPDATE patients 
      SET first_name = ?, last_name = ?, phone = ?
      WHERE id = ? AND dentist_id = ?
    `, [first_name, last_name, phone, id, dentistId]);

    res.json({
      success: true,
      message: 'Patient updated successfully'
    });

  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update patient'
    });
  }
};

// Archive patient (soft delete)
const archivePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;
    const archivedBy = req.user.id;

    // Check if patient exists and belongs to this dentist
    const patient = await executeQuery(`
      SELECT * FROM patients 
      WHERE id = ? AND dentist_id = ? AND is_archived = 0
    `, [id, dentistId]);

    if (patient.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const patientData = patient[0];

    // Get all related data for archiving
    const consultations = await executeQuery('SELECT * FROM consultations WHERE patient_id = ?', [id]);
    const appointments = await executeQuery('SELECT * FROM appointments WHERE patient_id = ?', [id]);
    const payments = await executeQuery('SELECT * FROM payments WHERE patient_id = ?', [id]);

    // Start transaction
    const queries = [
      // Archive patient data
      {
        sql: 'INSERT INTO archives (dentist_id, original_table, original_id, data_json, archive_type, archived_by) VALUES (?, ?, ?, ?, ?, ?)',
        params: [dentistId, 'patients', id, JSON.stringify({
          patient: patientData,
          consultations,
          appointments,
          payments
        }), 'deleted', archivedBy]
      },
      // Mark patient as archived
      {
        sql: 'UPDATE patients SET is_archived = 1, archived_at = NOW(), archived_by = ? WHERE id = ?',
        params: [archivedBy, id]
      }
    ];

    await executeTransaction(queries);

    res.json({
      success: true,
      message: 'Patient archived successfully'
    });

  } catch (error) {
    console.error('Archive patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive patient'
    });
  }
};

// Restore patient from archive
const restorePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Check if patient is archived
    const patient = await executeQuery(`
      SELECT * FROM patients 
      WHERE id = ? AND dentist_id = ? AND is_archived = 1
    `, [id, dentistId]);

    if (patient.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Archived patient not found'
      });
    }

    // Restore patient
    await executeQuery(`
      UPDATE patients 
      SET is_archived = 0, archived_at = NULL, archived_by = NULL 
      WHERE id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Patient restored successfully'
    });

  } catch (error) {
    console.error('Restore patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore patient'
    });
  }
};

module.exports = {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  archivePatient,
  restorePatient
};
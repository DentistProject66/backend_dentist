const { executeQuery, executeTransaction } = require('../config/db');
const moment = require('moment');

// Generate receipt number
const generateReceiptNumber = (dentistId, type = 'CON') => {
  const date = moment().format('YYYYMMDD');
  const dentistPad = String(dentistId).padStart(3, '0');
  const timestamp = Date.now().toString().slice(-6);
  return `${type}-${date}-${dentistPad}-${timestamp}`;
};

// Get all consultations for a dentist
const getConsultations = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, date_from, date_to, patient_id } = req.query;
    const dentistId = req.dentistId;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE c.dentist_id = ?';
    let params = [dentistId];

    // Filter by patient
    if (patient_id) {
      whereClause += ' AND c.patient_id = ?';
      params.push(patient_id);
    }

    // Filter by date range
    if (date_from) {
      whereClause += ' AND c.date_of_consultation >= ?';
      params.push(date_from);
    }
    if (date_to) {
      whereClause += ' AND c.date_of_consultation <= ?';
      params.push(date_to);
    }

    // Search functionality
    if (search) {
      whereClause += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.phone LIKE ? OR c.type_of_prosthesis LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get consultations with patient info
    const consultations = await executeQuery(`
      SELECT 
        c.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.phone as patient_phone
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      ${whereClause}
      ORDER BY c.date_of_consultation DESC, c.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Get total count
    const totalCount = await executeQuery(`
      SELECT COUNT(*) as count 
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      ${whereClause}
    `, params);

    // If user is assistant, remove payment information
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
        consultations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount[0].count,
          pages: Math.ceil(totalCount[0].count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get consultations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get consultations'
    });
  }
};

// Get consultation by ID
const getConsultationById = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get consultation with patient info
    const consultation = await executeQuery(`
      SELECT 
        c.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.phone as patient_phone,
        p.first_name,
        p.last_name
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      WHERE c.id = ? AND c.dentist_id = ?
    `, [id, dentistId]);

    if (consultation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    let payments = [];
    
    // Get related payments only if user is not assistant
    if (req.user.role !== 'assistant') {
      payments = await executeQuery(`
        SELECT * FROM payments 
        WHERE consultation_id = ?
        ORDER BY payment_date DESC
      `, [id]);
    }

    // Get related appointments
    const appointments = await executeQuery(`
      SELECT * FROM appointments 
      WHERE consultation_id = ?
      ORDER BY appointment_date DESC
    `, [id]);

    const consultationData = consultation[0];

    // If user is assistant, remove payment information
    if (req.user.role === 'assistant') {
      delete consultationData.total_price;
      delete consultationData.amount_paid;
      delete consultationData.remaining_balance;
    }

    res.json({
      success: true,
      data: {
        consultation: consultationData,
        payments,
        appointments
      }
    });

  } catch (error) {
    console.error('Get consultation by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get consultation details'
    });
  }
};


const createConsultation = async (req, res) => {
  try {
    const {
      patient_id,
      date_of_consultation,
      type_of_prosthesis,
      total_price = 0,
      amount_paid = 0,
      needs_followup = false
    } = req.body;

    const dentistId = req.dentistId;
    const createdBy = req.user.id;

    // Verify patient belongs to this dentist
    const patient = await executeQuery(`
      SELECT id, first_name, last_name, phone FROM patients 
      WHERE id = ? AND dentist_id = ? AND is_archived = 0
    `, [patient_id, dentistId]);

    if (patient.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found or does not belong to your practice'
      });
    }

    // Validate date_of_consultation
    const consultationDate = new Date(date_of_consultation);
    if (isNaN(consultationDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date_of_consultation format. Use YYYY-MM-DD'
      });
    }

    // Generate receipt number
    const receiptNumber = generateReceiptNumber(dentistId, 'CON');

    // Create consultation
    const result = await executeQuery(`
      INSERT INTO consultations (
        patient_id, dentist_id, date_of_consultation, type_of_prosthesis,
        total_price, amount_paid, needs_followup, created_by, receipt_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      patient_id,
      dentistId,
      date_of_consultation,
      type_of_prosthesis,
      total_price,
      amount_paid,
      needs_followup,
      createdBy,
      receiptNumber
    ]);

    const consultationId = result.insertId;

    // If there's an initial payment, record it
    if (amount_paid > 0) {
      const paymentReceiptNumber = generateReceiptNumber(dentistId, 'PAY');
      
      await executeQuery(`
        INSERT INTO payments (
          consultation_id, patient_id, dentist_id, patient_name, payment_date,
          amount_paid, payment_method, remaining_balance, receipt_number, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?)
      `, [
        consultationId,
        patient_id,
        dentistId,
        `${patient[0].first_name} ${patient[0].last_name}`,
        date_of_consultation,
        amount_paid,
        total_price - amount_paid,
        paymentReceiptNumber,
        createdBy
      ]);
    }

    // If needs_followup is true, schedule a follow-up appointment
    let followUpAppointment = null;
    if (needs_followup) {
      // Calculate follow-up date (7 days later)
      const followUpDate = new Date(consultationDate);
      followUpDate.setDate(consultationDate.getDate() + 7);
      const followUpDateStr = followUpDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Default appointment time
      const appointmentTime = '09:00';

      // Check for time slot availability
      const existingAppointments = await executeQuery(`
        SELECT id FROM appointments 
        WHERE dentist_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'cancelled'
      `, [dentistId, followUpDateStr, appointmentTime]);

      if (existingAppointments.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Time slot ${appointmentTime} on ${followUpDateStr} is already taken`
        });
      }

      // Create follow-up appointment
      const appointmentResult = await executeQuery(`
        INSERT INTO appointments (
          patient_id, dentist_id, appointment_date, appointment_time,
          patient_name, patient_phone, treatment_type, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        patient_id,
        dentistId,
        followUpDateStr,
        appointmentTime,
        `${patient[0].first_name} ${patient[0].last_name}`,
        patient[0].phone,
        'Follow-up',
        'scheduled',
        createdBy
      ]);

      followUpAppointment = {
        id: appointmentResult.insertId,
        appointment_date: followUpDateStr,
        appointment_time: appointmentTime,
        treatment_type: 'Follow-up'
      };
    }

    res.status(201).json({
      success: true,
      message: 'Consultation created successfully',
      data: {
        id: consultationId,
        receipt_number: receiptNumber,
        patient_name: `${patient[0].first_name} ${patient[0].last_name}`,
        date_of_consultation,
        type_of_prosthesis,
        total_price,
        amount_paid,
        remaining_balance: total_price - amount_paid,
        needs_followup,
        follow_up_appointment: followUpAppointment
      }
    });

  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create consultation'
    });
  }
};

module.exports = { createConsultation };
// Update consultation
const updateConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date_of_consultation,
      type_of_prosthesis,
      total_price,
      needs_followup
    } = req.body;
    
    const dentistId = req.dentistId;

    // Check if consultation exists and belongs to this dentist
    const consultation = await executeQuery(`
      SELECT id, amount_paid FROM consultations 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (consultation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    // Update consultation
    await executeQuery(`
      UPDATE consultations 
      SET date_of_consultation = ?, type_of_prosthesis = ?, total_price = ?, needs_followup = ?
      WHERE id = ? AND dentist_id = ?
    `, [date_of_consultation, type_of_prosthesis, total_price, needs_followup, id, dentistId]);

    res.json({
      success: true,
      message: 'Consultation updated successfully'
    });

  } catch (error) {
    console.error('Update consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update consultation'
    });
  }
};

// Delete consultation
const deleteConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;
    const archivedBy = req.user.id;

    // Check if consultation exists and belongs to this dentist
    const consultation = await executeQuery(`
      SELECT c.*, CONCAT(p.first_name, ' ', p.last_name) as patient_name
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      WHERE c.id = ? AND c.dentist_id = ?
    `, [id, dentistId]);

    if (consultation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    // Get related data for archiving
    const payments = await executeQuery('SELECT * FROM payments WHERE consultation_id = ?', [id]);
    const appointments = await executeQuery('SELECT * FROM appointments WHERE consultation_id = ?', [id]);

    // Archive and delete in transaction
    const queries = [
      // Archive consultation data
      {
        sql: 'INSERT INTO archives (dentist_id, original_table, original_id, data_json, archive_type, archived_by) VALUES (?, ?, ?, ?, ?, ?)',
        params: [dentistId, 'consultations', id, JSON.stringify({
          consultation: consultation[0],
          payments,
          appointments
        }), 'deleted', archivedBy]
      },
      // Delete related appointments
      {
        sql: 'DELETE FROM appointments WHERE consultation_id = ?',
        params: [id]
      },
      // Delete related payments
      {
        sql: 'DELETE FROM payments WHERE consultation_id = ?',
        params: [id]
      },
      // Delete consultation
      {
        sql: 'DELETE FROM consultations WHERE id = ?',
        params: [id]
      }
    ];

    await executeTransaction(queries);

    res.json({
      success: true,
      message: 'Consultation deleted successfully'
    });

  } catch (error) {
    console.error('Delete consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete consultation'
    });
  }
};

// Print consultation receipt
const printReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get consultation with patient and dentist info
    const consultation = await executeQuery(`
      SELECT 
        c.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.phone as patient_phone,
        CONCAT(u.first_name, ' ', u.last_name) as dentist_name,
        u.practice_name
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      JOIN users u ON c.dentist_id = u.id
      WHERE c.id = ? AND c.dentist_id = ?
    `, [id, dentistId]);

    if (consultation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    // If user is assistant, block access to financial information
    if (req.user.role === 'assistant') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Assistants cannot access financial information.'
      });
    }

    const consultationData = consultation[0];

    // Create receipt data
    const receiptData = {
      receipt_number: consultationData.receipt_number,
      date: moment(consultationData.date_of_consultation).format('DD/MM/YYYY'),
      practice_name: consultationData.practice_name,
      dentist_name: consultationData.dentist_name,
      patient_name: consultationData.patient_name,
      patient_phone: consultationData.patient_phone,
      treatment: consultationData.type_of_prosthesis,
      total_price: consultationData.total_price,
      amount_paid: consultationData.amount_paid,
      remaining_balance: consultationData.remaining_balance
    };

    res.json({
      success: true,
      data: receiptData
    });

  } catch (error) {
    console.error('Print receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate receipt'
    });
  }
};

module.exports = {
  getConsultations,
  getConsultationById,
  createConsultation,
  updateConsultation,
  deleteConsultation,
  printReceipt
};
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
// Get all consultations for a dentist
// Get all consultations for a dentist
const getConsultations = async (req, res) => {
  try {
    const dentistId = req.dentistId;
    const { page = 1, limit = 10 } = req.query;

    // Ensure parameters are numbers and validate types
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    // Debug parameters
    console.log('getConsultations params:', { dentistId, pageNum, limitNum, offset });

    // Validate dentistId
    if (!dentistId || isNaN(dentistId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Dentist ID is required'
      });
    }

    // Use simpler query without LIMIT/OFFSET first to test
    const query = `
      SELECT 
        c.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.phone as patient_phone
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      WHERE c.dentist_id = ?
      ORDER BY c.date_of_consultation DESC, c.created_at DESC
    `;

    // Start with just dentistId parameter, ensure it's an integer
    const params = [parseInt(dentistId, 10)];
    console.log('Executing query with params:', params);

    const consultations = await executeQuery(query, params);

    // Apply pagination in JavaScript for now (temporary solution)
    const startIndex = offset;
    const endIndex = startIndex + limitNum;
    const paginatedConsultations = consultations.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      message: 'Consultations retrieved successfully',
      data: paginatedConsultations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: consultations.length,
        hasMore: endIndex < consultations.length
      }
    });
  } catch (error) {
    console.error('Get consultations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve consultations',
      error: error.message
    });
  }
};

// Get consultation by ID
const getConsultationById = async (req, res) => {
  try {
    const dentistId = req.dentistId;
    const { id } = req.params;

    const query = `
      SELECT 
        c.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.phone as patient_phone,
        a.id as appointment_id,
        a.appointment_date,
        a.appointment_time,
        a.treatment_type
      FROM consultations c
      JOIN patients p ON c.patient_id = p.id
      LEFT JOIN appointments a ON c.id = a.consultation_id AND a.status != 'cancelled'
      WHERE c.id = ? AND c.dentist_id = ?
    `;

    const [consultation] = await executeQuery(query, [id, dentistId]);

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    const response = {
      ...consultation,
      follow_up_appointment: consultation.appointment_id ? {
        id: consultation.appointment_id,
        appointment_date: consultation.appointment_date,
        appointment_time: consultation.appointment_time,
        treatment_type: consultation.treatment_type
      } : null
    };

    res.status(200).json({
      success: true,
      message: 'Consultation retrieved successfully',
      data: response
    });
  } catch (error) {
    console.error('Get consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve consultation',
      error: error.message
    });
  }
};

// Create consultation
// Create consultation - Updated version
const createConsultation = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      phone,
      date_of_consultation,
      type_of_prosthesis,
      total_price = 0,
      amount_paid = 0,
      needs_followup = false,
      follow_up_date,
      follow_up_time = '09:00' // Default to 9:00 AM if not provided
    } = req.body;

    const dentistId = req.dentistId;
    const createdBy = req.user.id;

    // Validate required patient fields
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required'
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

    // Validate follow_up_date and follow_up_time if needs_followup is true
    let followUpDateStr = null;
    let followUpTimeStr = '09:00';
    
    if (needs_followup) {
      if (!follow_up_date) {
        return res.status(400).json({
          success: false,
          message: 'follow_up_date is required when needs_followup is true'
        });
      }
      
      if (!follow_up_time) {
        return res.status(400).json({
          success: false,
          message: 'follow_up_time is required when needs_followup is true'
        });
      }

      const followUpDate = new Date(follow_up_date);
      if (isNaN(followUpDate)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid follow_up_date format. Use YYYY-MM-DD'
        });
      }

      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(follow_up_time)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid follow_up_time format. Use HH:MM (24-hour format)'
        });
      }

      followUpDateStr = follow_up_date;
      followUpTimeStr = follow_up_time;
    }

    // Generate receipt numbers
    const consultationReceiptNumber = generateReceiptNumber(dentistId, 'CON');
    const paymentReceiptNumber = amount_paid > 0 ? generateReceiptNumber(dentistId, 'PAY') : null;

    // Calculate remaining_balance for response and payments table
    const remaining_balance = total_price - amount_paid;

    // Insert patient first to get patient_id
    const patientResult = await executeQuery(
      `
        INSERT INTO patients (
          dentist_id, first_name, last_name, phone, created_by
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [dentistId, first_name, last_name, phone || null, createdBy]
    );
    const patientId = patientResult.insertId;

    // Prepare transaction queries
    const queries = [
      // Create consultation
      {
        sql: `
          INSERT INTO consultations (
            patient_id, dentist_id, date_of_consultation, type_of_prosthesis,
            total_price, amount_paid, needs_followup, created_by, receipt_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          patientId,
          dentistId,
          date_of_consultation,
          type_of_prosthesis,
          total_price,
          amount_paid,
          needs_followup,
          createdBy,
          consultationReceiptNumber
        ]
      }
    ];

    // Add payment if amount_paid > 0
    if (amount_paid > 0) {
      queries.push({
        sql: `
          INSERT INTO payments (
            consultation_id, patient_id, dentist_id, patient_name, payment_date,
            amount_paid, payment_method, remaining_balance, receipt_number, created_by
          ) VALUES (LAST_INSERT_ID(), ?, ?, ?, ?, ?, 'cash', ?, ?, ?)
        `,
        params: [
          patientId,
          dentistId,
          `${first_name} ${last_name}`,
          date_of_consultation,
          amount_paid,
          total_price - amount_paid,
          paymentReceiptNumber,
          createdBy
        ]
      });
    }

    // Add follow-up appointment if needs_followup is true
    let followUpAppointment = null;
    if (needs_followup) {
      // Use the provided follow_up_time instead of hardcoded '09:00'
      const appointmentTime = followUpTimeStr;

      // Check for time slot availability
      const existingAppointments = await executeQuery(
        `
          SELECT id FROM appointments 
          WHERE dentist_id = ? AND appointment_date = ? AND appointment_time = ? AND status != 'cancelled'
        `,
        [dentistId, followUpDateStr, appointmentTime]
      );

      if (existingAppointments.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Time slot ${appointmentTime} on ${followUpDateStr} is already taken`
        });
      }

      queries.push({
        sql: `
          INSERT INTO appointments (
            patient_id, dentist_id, appointment_date, appointment_time,
            patient_name, patient_phone, treatment_type, status, created_by, consultation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, LAST_INSERT_ID())
        `,
        params: [
          patientId,
          dentistId,
          followUpDateStr,
          appointmentTime, // Now uses the provided time
          `${first_name} ${last_name}`,
          phone || null,
          'Follow-up',
          'confirmed',
          createdBy
        ]
      });
    }

    // Execute transaction for consultation, payment, and appointment
    const results = await executeTransaction(queries);

    const consultationId = results[0].insertId;
    if (needs_followup) {
      followUpAppointment = {
        id: results[queries.length - 1].insertId,
        appointment_date: followUpDateStr,
        appointment_time: followUpTimeStr, // Return the actual time used
        treatment_type: 'Follow-up'
      };
    }

    res.status(201).json({
      success: true,
      message: 'Consultation created successfully',
      data: {
        id: consultationId,
        receipt_number: consultationReceiptNumber,
        patient_id: patientId,
        patient_name: `${first_name} ${last_name}`,
        date_of_consultation,
        type_of_prosthesis,
        total_price,
        amount_paid,
        remaining_balance,
        needs_followup,
        follow_up_appointment: followUpAppointment
      }
    });

  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create consultation',
      error: error.message
    });
  }
};


// Update consultation
// Updated updateConsultation function
// Updated updateConsultation function
const updateConsultation = async (req, res) => {
  try {
    const dentistId = req.dentistId;
    const { id } = req.params;
    const { 
      date_of_consultation, 
      type_of_prosthesis, 
      total_price, 
      amount_paid, 
      needs_followup, 
      follow_up_date,
      follow_up_time = '09:00' // Default time if not provided
    } = req.body;

    // Validate inputs
    if (date_of_consultation && isNaN(new Date(date_of_consultation))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date_of_consultation format. Use YYYY-MM-DD'
      });
    }

    if (needs_followup && !follow_up_date) {
      return res.status(400).json({
        success: false,
        message: 'follow_up_date is required when needs_followup is true'
      });
    }

    if (needs_followup && !follow_up_time) {
      return res.status(400).json({
        success: false,
        message: 'follow_up_time is required when needs_followup is true'
      });
    }

    if (follow_up_date && isNaN(new Date(follow_up_date))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid follow_up_date format. Use YYYY-MM-DD'
      });
    }

    // Validate time format if provided
    if (follow_up_time) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(follow_up_time)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid follow_up_time format. Use HH:MM (24-hour format)'
        });
      }
    }

    // Check if consultation exists
    const [consultation] = await executeQuery(
      `SELECT c.*, CONCAT(p.first_name, ' ', p.last_name) as patient_name, p.phone as patient_phone 
       FROM consultations c 
       JOIN patients p ON c.patient_id = p.id 
       WHERE c.id = ? AND c.dentist_id = ?`,
      [id, dentistId]
    );

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    // Prepare update fields
    const updates = {};
    if (date_of_consultation) updates.date_of_consultation = date_of_consultation;
    if (type_of_prosthesis) updates.type_of_prosthesis = type_of_prosthesis;
    if (total_price !== undefined) updates.total_price = total_price;
    if (amount_paid !== undefined) updates.amount_paid = amount_paid;
    if (needs_followup !== undefined) updates.needs_followup = needs_followup;

    if (Object.keys(updates).length === 0 && !needs_followup) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }

    // Check if payment amount changed
    const paymentChanged = amount_paid !== undefined && amount_paid !== consultation.amount_paid;
    const newTotalPrice = total_price !== undefined ? total_price : consultation.total_price;
    const newAmountPaid = amount_paid !== undefined ? amount_paid : consultation.amount_paid;
    const newRemainingBalance = newTotalPrice - newAmountPaid;

    // Update consultation if there are fields to update
    if (Object.keys(updates).length > 0) {
      const updateQuery = `
        UPDATE consultations 
        SET ${Object.keys(updates).map(key => `${key} = ?`).join(', ')}
        WHERE id = ? AND dentist_id = ?
      `;
      const updateParams = [...Object.values(updates), id, dentistId];
      await executeQuery(updateQuery, updateParams);
    }

    // Handle payment table updates when amount_paid changes
    if (paymentChanged) {
      // Check if payment record exists for this consultation
      const [existingPayment] = await executeQuery(
        `SELECT id FROM payments WHERE consultation_id = ?`,
        [id]
      );

      if (newAmountPaid > 0) {
        if (existingPayment) {
          // Update existing payment record
          await executeQuery(
            `
              UPDATE payments 
              SET amount_paid = ?, remaining_balance = ?, payment_date = ?
              WHERE consultation_id = ?
            `,
            [newAmountPaid, newRemainingBalance, new Date().toISOString().split('T')[0], id]
          );
        } else {
          // Create new payment record
          const paymentReceiptNumber = generateReceiptNumber(dentistId, 'PAY');
          await executeQuery(
            `
              INSERT INTO payments (
                consultation_id, patient_id, dentist_id, patient_name, payment_date,
                amount_paid, payment_method, remaining_balance, receipt_number, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?)
            `,
            [
              id,
              consultation.patient_id,
              dentistId,
              consultation.patient_name,
              new Date().toISOString().split('T')[0],
              newAmountPaid,
              newRemainingBalance,
              paymentReceiptNumber,
              consultation.created_by
            ]
          );
        }
      } else if (newAmountPaid === 0 && existingPayment) {
        // Delete payment record if amount is set to 0
        await executeQuery(
          `DELETE FROM payments WHERE consultation_id = ?`,
          [id]
        );
      }
    }

    // Handle follow-up appointment
    if (needs_followup && follow_up_date && follow_up_time) {
      const appointmentTime = follow_up_time; // Use the provided time
      
      // Check for time slot availability (exclude current consultation's appointment)
      const existingAppointments = await executeQuery(
        `
          SELECT id FROM appointments 
          WHERE dentist_id = ? AND appointment_date = ? AND appointment_time = ? 
          AND status != 'cancelled' AND consultation_id != ?
        `,
        [dentistId, follow_up_date, appointmentTime, id]
      );

      if (existingAppointments.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Time slot ${appointmentTime} on ${follow_up_date} is already taken`
        });
      }

      // Update or create appointment
      const [existingAppointment] = await executeQuery(
        `SELECT id FROM appointments WHERE consultation_id = ? AND status != 'cancelled'`,
        [id]
      );

      if (existingAppointment) {
        await executeQuery(
          `
            UPDATE appointments 
            SET appointment_date = ?, appointment_time = ?, treatment_type = ?, status = ?
            WHERE id = ?
          `,
          [follow_up_date, appointmentTime, 'Follow-up', 'confirmed', existingAppointment.id]
        );
      } else {
        await executeQuery(
          `
            INSERT INTO appointments (
              patient_id, dentist_id, appointment_date, appointment_time,
              patient_name, patient_phone, treatment_type, status, created_by, consultation_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            consultation.patient_id,
            dentistId,
            follow_up_date,
            appointmentTime, // Use the provided time
            consultation.patient_name,
            consultation.patient_phone,
            'Follow-up',
            'confirmed',
            consultation.created_by,
            id
          ]
        );
      }
    } else if (needs_followup === false) {
      // Cancel existing appointment when followup is explicitly set to false
      await executeQuery(
        `UPDATE appointments SET status = 'cancelled' WHERE consultation_id = ? AND status != 'cancelled'`,
        [id]
      );
    }

    // Fetch updated consultation
    const [updatedConsultation] = await executeQuery(
      `
        SELECT 
          c.*,
          CONCAT(p.first_name, ' ', p.last_name) as patient_name,
          p.phone as patient_phone
        FROM consultations c
        JOIN patients p ON c.patient_id = p.id
        WHERE c.id = ? AND c.dentist_id = ?
      `,
      [id, dentistId]
    );

    res.status(200).json({
      success: true,
      message: 'Consultation updated successfully',
      data: updatedConsultation
    });
  } catch (error) {
    console.error('Update consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update consultation',
      error: error.message
    });
  }
};
// Delete consultation
const deleteConsultation = async (req, res) => {
  try {
    const dentistId = req.dentistId;
    const { id } = req.params;

    // Check if consultation exists
    const [consultation] = await executeQuery(
      `SELECT * FROM consultations WHERE id = ? AND dentist_id = ?`,
      [id, dentistId]
    );

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    // Soft delete or hard delete (depending on schema)
    await executeQuery(
      `DELETE FROM consultations WHERE id = ? AND dentist_id = ?`,
      [id, dentistId]
    );

    res.status(200).json({
      success: true,
      message: 'Consultation deleted successfully'
    });
  } catch (error) {
    console.error('Delete consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete consultation',
      error: error.message
    });
  }
};

// Print consultation receipt
const printReceipt = async (req, res) => {
  try {
    const dentistId = req.dentistId;
    const { id } = req.params;

    const [consultation] = await executeQuery(
      `
        SELECT 
          c.*,
          CONCAT(p.first_name, ' ', p.last_name) as patient_name,
          p.phone as patient_phone
        FROM consultations c
        JOIN patients p ON c.patient_id = p.id
        WHERE c.id = ? AND c.dentist_id = ?
      `,
      [id, dentistId]
    );

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Receipt generated successfully',
      data: {
        consultation_id: consultation.id,
        receipt_number: consultation.receipt_number,
        patient_name: consultation.patient_name,
        date_of_consultation: consultation.date_of_consultation,
        type_of_prosthesis: consultation.type_of_prosthesis,
        total_price: consultation.total_price,
        amount_paid: consultation.amount_paid,
        remaining_balance: consultation.remaining_balance
      }
    });
  } catch (error) {
    console.error('Print receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate receipt',
      error: error.message
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
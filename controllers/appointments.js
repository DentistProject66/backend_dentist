const { executeQuery } = require('../config/db');
const moment = require('moment');

// Get all appointments for a dentist
const getAppointments = async (req, res) => {
  try {
    const { page = 1, limit = 10, date, status, patient_id } = req.query;
    const dentistId = req.dentistId;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE a.dentist_id = ?';
    let params = [dentistId];

    // Filter by date
    if (date) {
      whereClause += ' AND a.appointment_date = ?';
      params.push(date);
    }

    // Filter by status
    if (status) {
      whereClause += ' AND a.status = ?';
      params.push(status);
    }

    // Filter by patient
    if (patient_id) {
      whereClause += ' AND a.patient_id = ?';
      params.push(patient_id);
    }

    // Get appointments with patient info
    const appointments = await executeQuery(`
      SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_full_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      ${whereClause}
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Get total count
    const totalCount = await executeQuery(`
      SELECT COUNT(*) as count 
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        appointments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount[0].count,
          pages: Math.ceil(totalCount[0].count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get appointments'
    });
  }
};

// Get appointments by date (calendar view)
const getAppointmentsByDate = async (req, res) => {
  try {
    const { date } = req.params;
    const dentistId = req.dentistId;

    // Get appointments for specific date
    const appointments = await executeQuery(`
      SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_full_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.dentist_id = ? AND a.appointment_date = ?
      ORDER BY a.appointment_time ASC
    `, [dentistId, date]);

    res.json({
      success: true,
      data: appointments
    });

  } catch (error) {
    console.error('Get appointments by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get appointments for the specified date'
    });
  }
};

// Get appointment by ID
const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get appointment with patient info
    const appointment = await executeQuery(`
      SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_full_name,
        p.first_name,
        p.last_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ? AND a.dentist_id = ?
    `, [id, dentistId]);

    if (appointment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      data: appointment[0]
    });

  } catch (error) {
    console.error('Get appointment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get appointment details'
    });
  }
};

// Create new appointment
const createAppointment = async (req, res) => {
  try {
    const {
      patient_id,
      consultation_id,
      appointment_date,
      appointment_time,
      patient_name,
      patient_phone,
      treatment_type,
      notes
    } = req.body;
    
    const dentistId = parseInt(req.dentistId, 10);
    const createdBy = parseInt(req.user.id, 10);

    // Validate required fields
    if (!patient_id || !appointment_date || !appointment_time || !patient_name || !patient_phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: patient_id, appointment_date, appointment_time, patient_name, or patient_phone'
      });
    }

    // Ensure optional fields are null if undefined
    const safeConsultationId = consultation_id !== undefined ? consultation_id : null;
    const safeTreatmentType = treatment_type !== undefined ? treatment_type : null;
    const safeNotes = notes !== undefined ? notes : null;

    // Verify patient belongs to this dentist
    const patient = await executeQuery(`
      SELECT id FROM patients 
      WHERE id = ? AND dentist_id = ? AND is_archived = 0
    `, [patient_id, dentistId]);

    if (patient.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found or does not belong to your practice'
      });
    }

    // Check if time slot is available
    const existingAppointment = await executeQuery(`
      SELECT id FROM appointments 
      WHERE dentist_id = ? AND appointment_date = ? AND appointment_time = ? AND status IN ('pending', 'confirmed')
    `, [dentistId, appointment_date, appointment_time]);

    if (existingAppointment.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Time slot is already booked'
      });
    }

    // Create appointment
    const result = await executeQuery(`
      INSERT INTO appointments (
        patient_id, dentist_id, consultation_id, appointment_date, appointment_time,
        patient_name, patient_phone, treatment_type, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [patient_id, dentistId, safeConsultationId, appointment_date, appointment_time, patient_name, patient_phone, safeTreatmentType, safeNotes, createdBy]);

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: {
        id: result.insertId,
        appointment_date,
        appointment_time,
        patient_name,
        treatment_type: safeTreatmentType,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create appointment',
      error: error.message
    });
  }
};

// Update appointment
const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      appointment_date,
      appointment_time,
      patient_name,
      patient_phone,
      treatment_type,
      status,
      notes
    } = req.body;
    
    const dentistId = parseInt(req.dentistId, 10);

    // Ensure optional fields are null if undefined
    const safeTreatmentType = treatment_type !== undefined ? treatment_type : null;
    const safeStatus = status !== undefined ? status : null;
    const safeNotes = notes !== undefined ? notes : null;

    // Check if appointment exists and belongs to this dentist
    const appointment = await executeQuery(`
      SELECT id, appointment_date, appointment_time FROM appointments 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (appointment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    const currentAppointment = appointment[0];

    // If date or time is being changed, check availability
    if ((appointment_date && appointment_date !== currentAppointment.appointment_date) || 
        (appointment_time && appointment_time !== currentAppointment.appointment_time)) {
      
      const existingAppointment = await executeQuery(`
        SELECT id FROM appointments 
        WHERE dentist_id = ? AND appointment_date = ? AND appointment_time = ? 
        AND status IN ('pending', 'confirmed') AND id != ?
      `, [dentistId, appointment_date || currentAppointment.appointment_date, appointment_time || currentAppointment.appointment_time, id]);

      if (existingAppointment.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'New time slot is already booked'
        });
      }
    }

    // Update appointment
    await executeQuery(`
      UPDATE appointments 
      SET appointment_date = COALESCE(?, appointment_date), 
          appointment_time = COALESCE(?, appointment_time), 
          patient_name = COALESCE(?, patient_name), 
          patient_phone = COALESCE(?, patient_phone), 
          treatment_type = ?, 
          status = ?, 
          notes = ?
      WHERE id = ? AND dentist_id = ?
    `, [appointment_date, appointment_time, patient_name, patient_phone, safeTreatmentType, safeStatus, safeNotes, id, dentistId]);

    res.json({
      success: true,
      message: 'Appointment updated successfully'
    });

  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update appointment',
      error: error.message
    });
  }
};

// Cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;
    const dentistId = parseInt(req.dentistId, 10);
    const cancelledBy = parseInt(req.user.id, 10);

    // Ensure optional field is null if undefined
    const safeCancellationReason = cancellation_reason !== undefined ? cancellation_reason : null;

    // Check if appointment exists and belongs to this dentist
    const appointment = await executeQuery(`
      SELECT id FROM appointments 
      WHERE id = ? AND dentist_id = ? AND status IN ('pending', 'confirmed')
    `, [id, dentistId]);

    if (appointment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or already processed'
      });
    }

    // Cancel appointment
    await executeQuery(`
      UPDATE appointments 
      SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, cancellation_reason = ?
      WHERE id = ?
    `, [cancelledBy, safeCancellationReason, id]);

    res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel appointment',
      error: error.message
    });
  }
};

// Mark appointment as completed
const completeAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = parseInt(req.dentistId, 10);

    // Check if appointment exists and belongs to this dentist
    const appointment = await executeQuery(`
      SELECT id FROM appointments 
      WHERE id = ? AND dentist_id = ? AND status IN ('pending', 'confirmed')
    `, [id, dentistId]);

    if (appointment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or already processed'
      });
    }

    // Mark as completed
    await executeQuery(`
      UPDATE appointments 
      SET status = 'completed'
      WHERE id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Appointment marked as completed'
    });

  } catch (error) {
    console.error('Complete appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete appointment',
      error: error.message
    });
  }
};

// Get available time slots for a specific date
const getAvailableTimeSlots = async (req, res) => {
  try {
    const { date } = req.params;
    const dentistId = parseInt(req.dentistId, 10);

    // Define working hours (can be made configurable)
    const workingHours = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
    ];

    // Get booked appointments for the date
    const bookedAppointments = await executeQuery(`
      SELECT appointment_time FROM appointments 
      WHERE dentist_id = ? AND appointment_date = ? AND status IN ('pending', 'confirmed')
    `, [dentistId, date]);

    const bookedTimes = bookedAppointments.map(apt => 
      moment(apt.appointment_time, 'HH:mm:ss').format('HH:mm')
    );

    // Filter available slots
    const availableSlots = workingHours.filter(time => !bookedTimes.includes(time));

    res.json({
      success: true,
      data: {
        date,
        available_slots: availableSlots,
        booked_slots: bookedTimes
      }
    });

  } catch (error) {
    console.error('Get available time slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available time slots',
      error: error.message
    });
  }
};

// Get daily schedule
const getDailySchedule = async (req, res) => {
  try {
    const { date = moment().format('YYYY-MM-DD') } = req.query;
    const dentistId = parseInt(req.dentistId, 10);

    // Get appointments for the day
    const appointments = await executeQuery(`
      SELECT 
        a.*,
        CONCAT(p.first_name, ' ', p.last_name) as patient_full_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.dentist_id = ? AND a.appointment_date = ?
      ORDER BY a.appointment_time ASC
    `, [dentistId, date]);

    // Get summary statistics
    const stats = await executeQuery(`
      SELECT 
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
      FROM appointments
      WHERE dentist_id = ? AND appointment_date = ?
    `, [dentistId, date]);

    res.json({
      success: true,
      data: {
        date,
        appointments,
        statistics: stats[0]
      }
    });

  } catch (error) {
    console.error('Get daily schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get daily schedule',
      error: error.message
    });
  }
};

module.exports = {
  getAppointments,
  getAppointmentsByDate,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  completeAppointment,
  getAvailableTimeSlots,
  getDailySchedule
};

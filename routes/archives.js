const express = require('express');
const router = express.Router();
const { verifyToken, requireDentistOrAssistant, checkDentistAccess } = require('../middleware/auth');
const { executeQuery } = require('../config/db');

router.use(verifyToken);
router.use(requireDentistOrAssistant);
router.use(checkDentistAccess);

// Get archived records
// Get archived records
// Get archived records
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, table, archive_type, search, latest_treatment, archived_at_gte, archived_at_lte } = req.query;
    const dentistId = req.dentistId;
    
    // Convert to integers and validate
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 10, 100); // Cap at 100
    const offset = (pageNum - 1) * limitNum;

    if (pageNum < 1 || limitNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters'
      });
    }

    let whereClause = 'WHERE dentist_id = ?';
    let params = [dentistId];

    // Filter by table type
    if (table) {
      whereClause += ' AND original_table = ?';
      params.push(table);
    }

    // Filter by archive type
    if (archive_type) {
      whereClause += ' AND archive_type = ?';
      params.push(archive_type);
    }

    // Date range filters
    if (archived_at_gte) {
      whereClause += ' AND archived_at >= ?';
      params.push(archived_at_gte);
    }

    if (archived_at_lte) {
      whereClause += ' AND archived_at <= ?';
      params.push(archived_at_lte);
    }

    // Search filter (search in JSON data for patient names)
    if (search) {
      whereClause += ' AND (JSON_EXTRACT(data_json, "$.patient.first_name") LIKE ? OR JSON_EXTRACT(data_json, "$.patient.last_name") LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Treatment filter
    if (latest_treatment && latest_treatment !== 'All Treatments') {
      whereClause += ' AND JSON_EXTRACT(data_json, "$.consultations[0].type_of_prosthesis") = ?';
      params.push(latest_treatment);
    }

    // Build query with LIMIT and OFFSET as literals (not placeholders)
    const archives = await executeQuery(`
      SELECT 
        id,
        original_id,
        original_table,
        archive_type,
        archived_at,
        archived_by,
        data_json
      FROM archives 
      ${whereClause}
      ORDER BY archived_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `, params);

    // Parse JSON data for each archive
    const parsedArchives = archives.map(archive => ({
      ...archive,
      data_json: typeof archive.data_json === 'string' 
        ? JSON.parse(archive.data_json) 
        : archive.data_json
    }));

    // Get total count for pagination
    const totalCount = await executeQuery(`
      SELECT COUNT(*) as count FROM archives 
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        archives: parsedArchives,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount[0].count,
          pages: Math.ceil(totalCount[0].count / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Get archives error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get archived records',
      error: error.message
    });
  }
});
// Restore archived record
// Restore archived record
router.post('/restore/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get the archive record
    const archive = await executeQuery(`
      SELECT * FROM archives 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (archive.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Archived record not found'
      });
    }

    const archiveData = archive[0];
    
    // Parse the JSON data
    let data;
    try {
      data = typeof archiveData.data_json === 'string' 
        ? JSON.parse(archiveData.data_json) 
        : archiveData.data_json;
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid archive data format'
      });
    }

    // Start transaction to restore data
    if (archiveData.original_table === 'patients') {
      // For patients, just update the is_archived flag
      await executeQuery(`
        UPDATE patients 
        SET is_archived = 0, archived_at = NULL, archived_by = NULL 
        WHERE id = ? AND dentist_id = ?
      `, [data.patient.id, dentistId]);

    } else if (archiveData.original_table === 'consultations') {
      // For consultations, restore all related data
      const consultationData = data.consultation;
      
      // Check if consultation already exists (in case of partial restore)
      const existingConsultation = await executeQuery(`
        SELECT id FROM consultations WHERE id = ?
      `, [consultationData.id]);

      if (existingConsultation.length === 0) {
        // Restore consultation
        await executeQuery(`
          INSERT INTO consultations (
            id, patient_id, dentist_id, date_of_consultation, type_of_prosthesis,
            total_price, amount_paid, needs_followup, created_by, receipt_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          consultationData.id, consultationData.patient_id, consultationData.dentist_id,
          consultationData.date_of_consultation, consultationData.type_of_prosthesis,
          consultationData.total_price, consultationData.amount_paid,
          consultationData.needs_followup, consultationData.created_by,
          consultationData.receipt_number
        ]);
      }

      // Restore payments
      if (data.payments && Array.isArray(data.payments)) {
        for (const payment of data.payments) {
          const existingPayment = await executeQuery(`
            SELECT id FROM payments WHERE id = ?
          `, [payment.id]);

          if (existingPayment.length === 0) {
            await executeQuery(`
              INSERT INTO payments (
                id, consultation_id, patient_id, dentist_id, patient_name, payment_date,
                amount_paid, payment_method, remaining_balance, receipt_number, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              payment.id, payment.consultation_id, payment.patient_id, payment.dentist_id,
              payment.patient_name, payment.payment_date, payment.amount_paid,
              payment.payment_method, payment.remaining_balance, payment.receipt_number,
              payment.created_by
            ]);
          }
        }
      }

      // Restore appointments
      if (data.appointments && Array.isArray(data.appointments)) {
        for (const appointment of data.appointments) {
          const existingAppointment = await executeQuery(`
            SELECT id FROM appointments WHERE id = ?
          `, [appointment.id]);

          if (existingAppointment.length === 0) {
            await executeQuery(`
              INSERT INTO appointments (
                id, patient_id, dentist_id, consultation_id, appointment_date,
                appointment_time, patient_name, patient_phone, treatment_type,
                status, notes, created_by, cancelled_at, cancelled_by, cancellation_reason
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              appointment.id, appointment.patient_id, appointment.dentist_id,
              appointment.consultation_id, appointment.appointment_date,
              appointment.appointment_time, appointment.patient_name,
              appointment.patient_phone, appointment.treatment_type,
              appointment.status, appointment.notes, appointment.created_by,
              appointment.cancelled_at, appointment.cancelled_by,
              appointment.cancellation_reason
            ]);
          }
        }
      }
    }

    // Delete the archive record
    await executeQuery('DELETE FROM archives WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Record restored successfully'
    });
    
  } catch (error) {
    console.error('Restore archive error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore archived record',
      error: error.message
    });
  }
});




// Delete archived record and related payments
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get the archive record
    const archive = await executeQuery(`
      SELECT * FROM archives 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (archive.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Archived record not found'
      });
    }

    const archiveData = archive[0];
    
    // Parse the JSON data
    let data;
    try {
      data = typeof archiveData.data_json === 'string' 
        ? JSON.parse(archiveData.data_json) 
        : archiveData.data_json;
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid archive data format'
      });
    }

    // Delete related payments if the archived record is for a patient
    if (archiveData.original_table === 'patients') {
      await executeQuery(`
        DELETE FROM payments 
        WHERE patient_id = ? AND dentist_id = ?
      `, [data.patient.id, dentistId]);
    } else if (archiveData.original_table === 'consultations') {
      // Delete payments associated with this consultation
      await executeQuery(`
        DELETE FROM payments 
        WHERE consultation_id = ? AND dentist_id = ?
      `, [data.consultation.id, dentistId]);
    }

    // Delete the archive record
    await executeQuery('DELETE FROM archives WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Archived record and related payments deleted successfully'
    });
  } catch (error) {
    console.error('Delete archive error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete archived record',
      error: error.message
    });
  }
});
module.exports = router;
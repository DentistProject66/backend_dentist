const express = require('express');
const router = express.Router();
const { verifyToken, requireDentistOrAssistant, checkDentistAccess } = require('../middleware/auth');
const { executeQuery } = require('../config/db');

router.use(verifyToken);
router.use(requireDentistOrAssistant);
router.use(checkDentistAccess);

// Get archived records
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, table, archive_type } = req.query;
    const dentistId = req.dentistId;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE dentist_id = ?';
    let params = [dentistId];

    if (table) {
      whereClause += ' AND original_table = ?';
      params.push(table);
    }
    if (archive_type) {
      whereClause += ' AND archive_type = ?';
      params.push(archive_type);
    }

    const archives = await executeQuery(`
      SELECT * FROM archives 
      ${whereClause}
      ORDER BY archived_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const totalCount = await executeQuery(`
      SELECT COUNT(*) as count FROM archives 
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        archives,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount[0].count,
          pages: Math.ceil(totalCount[0].count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get archives error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get archived records'
    });
  }
});

// Restore archived record
router.post('/restore/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

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
    const data = JSON.parse(archiveData.data_json);

    if (archiveData.original_table === 'patients') {
      await executeQuery(`
        UPDATE patients 
        SET is_archived = 0, archived_at = NULL, archived_by = NULL 
        WHERE id = ?
      `, [data.patient.id]);
    } else if (archiveData.original_table === 'consultations') {
      const consultationData = data.consultation;
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

      for (const payment of data.payments) {
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

      for (const appointment of data.appointments) {
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

    await executeQuery('DELETE FROM archives WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Record restored successfully'
    });
  } catch (error) {
    console.error('Restore archive error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore archived record'
    });
  }
});

module.exports = router;
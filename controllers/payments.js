const { executeQuery, executeTransaction } = require('../config/db');
const moment = require('moment');

// Generate receipt number for payments
const generateReceiptNumber = (dentistId) => {
  const date = moment().format('YYYYMMDD');
  const dentistPad = String(dentistId).padStart(3, '0');
  const timestamp = Date.now().toString().slice(-6);
  return `PAY-${date}-${dentistPad}-${timestamp}`;
};

// Get all payments for a dentist
// Get all payments for a dentist
const getPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, date_from, date_to, patient_id, payment_method } = req.query;
    const dentistId = req.dentistId;
    
    // Convert to integers and validate
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 10, 100); // Cap at 100
    const offset = (pageNum - 1) * limitNum;

    // Validate parameters
    if (pageNum < 1 || limitNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters'
      });
    }

    let whereClause = 'WHERE p.dentist_id = ?';
    let params = [dentistId];

    // Filter by date range
    if (date_from) {
      whereClause += ' AND p.payment_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      whereClause += ' AND p.payment_date <= ?';
      params.push(date_to);
    }

    // Filter by patient
    if (patient_id) {
      whereClause += ' AND p.patient_id = ?';
      params.push(patient_id);
    }

    // Filter by payment method
    if (payment_method) {
      whereClause += ' AND p.payment_method = ?';
      params.push(payment_method);
    }

    // Get payments with consultation info
    const payments = await executeQuery(`
      SELECT 
        p.*,
        c.date_of_consultation,
        c.type_of_prosthesis
      FROM payments p
      JOIN consultations c ON p.consultation_id = c.id
      ${whereClause}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `, params);

    // Get total count
    const totalCount = await executeQuery(`
      SELECT COUNT(*) as count 
      FROM payments p
      JOIN consultations c ON p.consultation_id = c.id
      ${whereClause}
    `, params);

    // Get summary statistics - Specify p.amount_paid to resolve ambiguity
    const summary = await executeQuery(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(p.amount_paid) as total_amount,
        AVG(p.amount_paid) as average_payment
      FROM payments p
      JOIN consultations c ON p.consultation_id = c.id
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        payments,
        summary: summary[0],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount[0].count,
          pages: Math.ceil(totalCount[0].count / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payments',
      error: error.message
    });
  }
};
// Get payment by ID
const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get payment with consultation and patient info
    const payment = await executeQuery(`
      SELECT 
        p.*,
        c.date_of_consultation,
        c.type_of_prosthesis,
        c.total_price as consultation_total,
        pat.first_name,
        pat.last_name,
        pat.phone
      FROM payments p
      JOIN consultations c ON p.consultation_id = c.id
      JOIN patients pat ON p.patient_id = pat.id
      WHERE p.id = ? AND p.dentist_id = ?
    `, [id, dentistId]);

    if (payment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: payment[0]
    });

  } catch (error) {
    console.error('Get payment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment details'
    });
  }
};

// Create new payment
const createPayment = async (req, res) => {
  try {
    const {
      consultation_id,
      patient_id,
      patient_name,
      payment_date,
      amount_paid,
      payment_method
    } = req.body;
    
    const dentistId = req.dentistId;
    const createdBy = req.user.id;

    // Verify consultation belongs to this dentist and get current balance
    const consultation = await executeQuery(`
      SELECT id, total_price, amount_paid, remaining_balance 
      FROM consultations 
      WHERE id = ? AND dentist_id = ?
    `, [consultation_id, dentistId]);

    if (consultation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found or does not belong to your practice'
      });
    }

    const consultationData = consultation[0];

    // Check if payment amount doesn't exceed remaining balance
    if (amount_paid > consultationData.remaining_balance) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed remaining balance of ${consultationData.remaining_balance}`
      });
    }

    // Generate receipt number
    const receiptNumber = generateReceiptNumber(dentistId);
    const newRemainingBalance = consultationData.remaining_balance - amount_paid;

    // Create payment and update consultation in transaction
    const queries = [
      // Insert payment
      {
        sql: `INSERT INTO payments (
          consultation_id, patient_id, dentist_id, patient_name, payment_date,
          amount_paid, payment_method, remaining_balance, receipt_number, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [consultation_id, patient_id, dentistId, patient_name, payment_date, amount_paid, payment_method, newRemainingBalance, receiptNumber, createdBy]
      },
      // Update consultation amount_paid
      {
        sql: `UPDATE consultations 
              SET amount_paid = amount_paid + ? 
              WHERE id = ?`,
        params: [amount_paid, consultation_id]
      }
    ];

    const results = await executeTransaction(queries);
    const paymentId = results[0].insertId;

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        id: paymentId,
        receipt_number: receiptNumber,
        amount_paid,
        payment_method,
        payment_date,
        remaining_balance: newRemainingBalance
      }
    });

  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment'
    });
  }
};

// Update payment
const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_date, payment_method } = req.body;
    const dentistId = req.dentistId;

    // Check if payment exists and belongs to this dentist
    const payment = await executeQuery(`
      SELECT id FROM payments 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (payment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Update payment (only date and method, not amount to maintain data integrity)
    await executeQuery(`
      UPDATE payments 
      SET payment_date = ?, payment_method = ?
      WHERE id = ? AND dentist_id = ?
    `, [payment_date, payment_method, id, dentistId]);

    res.json({
      success: true,
      message: 'Payment updated successfully'
    });

  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment'
    });
  }
};

// Delete payment (with balance recalculation)
const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get payment info
    const payment = await executeQuery(`
      SELECT consultation_id, amount_paid FROM payments 
      WHERE id = ? AND dentist_id = ?
    `, [id, dentistId]);

    if (payment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const paymentData = payment[0];

    // Delete payment and update consultation in transaction
    const queries = [
      // Delete payment
      {
        sql: 'DELETE FROM payments WHERE id = ?',
        params: [id]
      },
      // Update consultation amount_paid
      {
        sql: `UPDATE consultations 
              SET amount_paid = amount_paid - ? 
              WHERE id = ?`,
        params: [paymentData.amount_paid, paymentData.consultation_id]
      }
    ];

    await executeTransaction(queries);

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });

  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payment'
    });
  }
};

// Get financial reports - FIXED VERSION
// Get financial reports - FIXED VERSION
// Get financial reports - FIXED VERSION
const getFinancialReports = async (req, res) => {
  try {
    const { period = 'month', date_from, date_to } = req.query;
    const dentistId = req.dentistId;
    
    console.log('=== DEBUG INFO ===');
    console.log('req.dentistId:', dentistId, 'type:', typeof dentistId);
    console.log('req.user:', req.user);
    console.log('Period:', period);
    console.log('==================');

    let dateFilter = '';
    let params = [parseInt(dentistId)];

    if (date_from && date_to) {
      dateFilter = 'AND DATE(payment_date) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    } else {
      switch (period) {
        case 'today':
          dateFilter = 'AND DATE(payment_date) = CURDATE()';
          break;
        case 'week':
          dateFilter = 'AND DATE(payment_date) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
          break;
        case 'month':
          dateFilter = 'AND DATE(payment_date) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
          break;
        case 'year':
          dateFilter = 'AND DATE(payment_date) >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)';
          break;
      }
    }

    // First, let's check if we have any payments at all for this dentist
    const totalPayments = await executeQuery(`
      SELECT COUNT(*) as count FROM payments WHERE dentist_id = ?
    `, [parseInt(dentistId)]);

    console.log(`Total payments for dentist ${dentistId}:`, totalPayments[0].count);

    // Also check what dentist IDs exist in the database
    const allDentistIds = await executeQuery(`
      SELECT DISTINCT dentist_id FROM payments ORDER BY dentist_id
    `);
    console.log('All dentist IDs in payments table:', allDentistIds.map(row => row.dentist_id));

    // Daily income query
    const dailyIncome = await executeQuery(`
      SELECT 
        DATE(payment_date) as payment_date, 
        COUNT(*) as payment_count, 
        SUM(amount_paid) as daily_income
      FROM payments
      WHERE dentist_id = ? ${dateFilter}
      GROUP BY DATE(payment_date)
      ORDER BY payment_date DESC
      LIMIT 30
    `, params);

    console.log(`Daily income results:`, dailyIncome.length);

    // Payment methods query
    const paymentMethods = await executeQuery(`
      SELECT 
        payment_method, 
        COUNT(*) as payment_count, 
        SUM(amount_paid) as total_amount
      FROM payments
      WHERE dentist_id = ? ${dateFilter}
      GROUP BY payment_method
    `, params);

    // Outstanding payments query
    const outstandingPayments = await executeQuery(`
      SELECT 
        c.id as consultation_id, 
        CONCAT(pat.first_name, ' ', pat.last_name) as patient_name,
        pat.phone, 
        c.date_of_consultation, 
        c.type_of_prosthesis, 
        c.total_price,
        c.amount_paid, 
        c.remaining_balance, 
        DATEDIFF(CURDATE(), c.date_of_consultation) as days_overdue
      FROM consultations c
      JOIN patients pat ON c.patient_id = pat.id
      WHERE c.dentist_id = ? AND c.remaining_balance > 0
    `, [parseInt(dentistId)]);

    // Total stats query
    const totalStats = await executeQuery(`
      SELECT 
        COUNT(*) as total_payments, 
        COALESCE(SUM(amount_paid), 0) as total_income,
        COALESCE(AVG(amount_paid), 0) as average_payment, 
        MIN(DATE(payment_date)) as first_payment_date,
        MAX(DATE(payment_date)) as last_payment_date
      FROM payments
      WHERE dentist_id = ? ${dateFilter}
    `, params);

    // If no data found, return empty but successful response
    const result = {
      success: true,
      data: {
        period,
        total_statistics: totalStats[0] || { 
          total_payments: 0, 
          total_income: 0, 
          average_payment: 0, 
          first_payment_date: null, 
          last_payment_date: null 
        },
        daily_income: dailyIncome || [],
        payment_methods: paymentMethods || [],
        outstanding_payments: outstandingPayments || [],
      },
    };

    console.log('Final result:', JSON.stringify(result, null, 2));
    res.json(result);

  } catch (error) {
    console.error('Get financial reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate financial reports',
      error: error.message,
    });
  }
};
// Print payment receipt
const printPaymentReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const dentistId = req.dentistId;

    // Get payment with full details
    const payment = await executeQuery(`
      SELECT 
        p.*,
        c.date_of_consultation,
        c.type_of_prosthesis,
        CONCAT(pat.first_name, ' ', pat.last_name) as patient_name,
        pat.phone as patient_phone,
        CONCAT(u.first_name, ' ', u.last_name) as dentist_name,
        u.practice_name
      FROM payments p
      JOIN consultations c ON p.consultation_id = c.id
      JOIN patients pat ON p.patient_id = pat.id
      JOIN users u ON p.dentist_id = u.id
      WHERE p.id = ? AND p.dentist_id = ?
    `, [id, dentistId]);

    if (payment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const paymentData = payment[0];

    // Create receipt data
    const receiptData = {
      receipt_number: paymentData.receipt_number,
      payment_date: moment(paymentData.payment_date).format('DD/MM/YYYY'),
      practice_name: paymentData.practice_name,
      dentist_name: paymentData.dentist_name,
      patient_name: paymentData.patient_name,
      patient_phone: paymentData.patient_phone,
      treatment: paymentData.type_of_prosthesis,
      consultation_date: moment(paymentData.date_of_consultation).format('DD/MM/YYYY'),
      amount_paid: paymentData.amount_paid,
      payment_method: paymentData.payment_method,
      remaining_balance: paymentData.remaining_balance
    };

    res.json({
      success: true,
      data: receiptData
    });

  } catch (error) {
    console.error('Print payment receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payment receipt'
    });
  }
};

module.exports = {
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  getFinancialReports,
  printPaymentReceipt
};
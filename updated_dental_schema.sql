-- Dental Practice Management System Database
-- Simplified version with only PDF requirements + Multi-Dentist Authentication

CREATE DATABASE IF NOT EXISTS dental_practice_db;
USE dental_practice_db;

-- ================================
-- 1. AUTHENTICATION TABLES
-- ================================

-- Users table for authentication and dentist management
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role ENUM('super_admin', 'dentist', 'assistant') NOT NULL DEFAULT 'dentist',
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    practice_name VARCHAR(255), -- For dentists
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    approved_by INT NULL,
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_role (role),
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Assistant assignments to dentists
CREATE TABLE user_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dentist_id INT NOT NULL,
    assistant_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dentist_id (dentist_id),
    INDEX idx_assistant_id (assistant_id),
    FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assistant_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_assignment (dentist_id, assistant_id)
);

-- ================================
-- 2. PATIENT MANAGEMENT TABLE
-- ================================

-- Patients table
CREATE TABLE patients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dentist_id INT NOT NULL, -- Which dentist this patient belongs to
    first_name VARCHAR(100) NOT NULL, -- PrÃ©nom
    last_name VARCHAR(100) NOT NULL, -- Nom
    phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL,
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMP NULL,
    archived_by INT NULL,
    INDEX idx_dentist_id (dentist_id),
    INDEX idx_full_name (first_name, last_name),
    INDEX idx_phone (phone),
    INDEX idx_is_archived (is_archived),
    FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ================================
-- 3. CONSULTATION TABLE
-- ================================

-- Consultations table
CREATE TABLE consultations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    dentist_id INT NOT NULL,
    date_of_consultation DATE NOT NULL,
    type_of_prosthesis VARCHAR(255), -- Type de ProthÃ¨se
    teinte VARCHAR(100), -- Teinte (shade/color)
    total_price DECIMAL(10,2) DEFAULT 0.00, -- Tarif
    amount_paid DECIMAL(10,2) DEFAULT 0.00, -- Montant PayÃ©
    remaining_balance DECIMAL(10,2) GENERATED ALWAYS AS (total_price - amount_paid) STORED, -- Reste Ã  Payer
    needs_followup BOOLEAN DEFAULT FALSE, -- Needs Follow-up Appointment
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL,
    receipt_number VARCHAR(50) UNIQUE,
    INDEX idx_patient_id (patient_id),
    INDEX idx_dentist_id (dentist_id),
    INDEX idx_consultation_date (date_of_consultation),
    INDEX idx_receipt_number (receipt_number),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- ================================
-- 4. APPOINTMENTS TABLE
-- ================================

-- Appointments table
CREATE TABLE appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    dentist_id INT NOT NULL,
    consultation_id INT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    patient_name VARCHAR(200) NOT NULL, -- Patient Name
    patient_phone VARCHAR(20) NOT NULL, -- Patient Phone
    treatment_type VARCHAR(255), -- Treatment Type
    status ENUM('confirmed', 'pending', 'completed', 'cancelled') DEFAULT 'pending', -- Appointment Status
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL,
    INDEX idx_patient_id (patient_id),
    INDEX idx_dentist_id (dentist_id),
    INDEX idx_appointment_date (appointment_date),
    INDEX idx_status (status),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- ================================
-- 5. PAYMENT MANAGEMENT TABLE
-- ================================

-- Payments table
CREATE TABLE payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    consultation_id INT NOT NULL,
    patient_id INT NOT NULL,
    dentist_id INT NOT NULL,
    patient_name VARCHAR(200) NOT NULL, -- Patient Name
    payment_date DATE NOT NULL,
    amount_paid DECIMAL(10,2) NOT NULL, -- Amount Paid
    payment_method ENUM('cash', 'check', 'card') NOT NULL, -- Payment Method (Cash/Check/Card)
    remaining_balance DECIMAL(10,2) NOT NULL, -- Remaining Balance
    receipt_number VARCHAR(50) UNIQUE NOT NULL, -- Receipt Number
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL,
    INDEX idx_consultation_id (consultation_id),
    INDEX idx_patient_id (patient_id),
    INDEX idx_dentist_id (dentist_id),
    INDEX idx_payment_date (payment_date),
    INDEX idx_receipt_number (receipt_number),
    FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- ================================
-- 6. ARCHIVE TABLE
-- ================================

-- Archive table
CREATE TABLE archives (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dentist_id INT NOT NULL,
    original_table VARCHAR(50) NOT NULL, -- 'patients', 'consultations', etc.
    original_id INT NOT NULL,
    data_json JSON NOT NULL, -- Complete record data
    archive_type ENUM('completed', 'deleted') NOT NULL, -- Completed Cases / Deleted Patients
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by INT NOT NULL,
    INDEX idx_dentist_id (dentist_id),
    INDEX idx_original_table (original_table),
    INDEX idx_archive_type (archive_type),
    INDEX idx_archived_at (archived_at),
    FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- ================================
-- 7. INITIAL DATA
-- ================================

-- Insert default super admin
INSERT INTO users (email, password_hash, first_name, last_name, role, status, created_at) 
VALUES 
('admin@dentalcare.com', '$2y$10$example_hashed_password', 'System', 'Administrator', 'super_admin', 'approved', NOW());

-- ================================
-- 8. TRIGGERS FOR AUTOMATION
-- ================================

-- Trigger to update consultation amount_paid when payment is added
DELIMITER //
CREATE TRIGGER update_consultation_payment_after_insert
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
    UPDATE consultations 
    SET amount_paid = (
        SELECT COALESCE(SUM(amount_paid), 0) 
        FROM payments 
        WHERE consultation_id = NEW.consultation_id
    )
    WHERE id = NEW.consultation_id;
END//

-- Trigger to generate receipt numbers for consultations
CREATE TRIGGER generate_receipt_number_consultation
BEFORE INSERT ON consultations
FOR EACH ROW
BEGIN
    IF NEW.receipt_number IS NULL THEN
        SET NEW.receipt_number = CONCAT('CON-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(NEW.dentist_id, 3, '0'), '-', LPAD((SELECT COALESCE(MAX(id), 0) + 1 FROM consultations), 6, '0'));
    END IF;
END//

-- Trigger to generate receipt numbers for payments
CREATE TRIGGER generate_receipt_number_payment
BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
    IF NEW.receipt_number IS NULL THEN
        SET NEW.receipt_number = CONCAT('PAY-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(NEW.dentist_id, 3, '0'), '-', LPAD((SELECT COALESCE(MAX(id), 0) + 1 FROM payments), 6, '0'));
    END IF;
END//

DELIMITER ;

-- ================================
-- END OF DATABASE SCHEMA
-- ================================
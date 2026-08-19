-- ─────────────────────────────────────────────────────────────────────────
--  dShield Global Site — PDF report columns
--
--  RUN AFTER schema-orders.sql.
--
--     mysql -u root -p < db/schema-orders.sql
--     mysql -u root -p < db/schema-pdf.sql
--
--  Safe to re-run. MySQL 8 has no ADD COLUMN IF NOT EXISTS, so every column
--  goes through information_schema — the same pattern as schema-legal.sql.
--
--  pdf_status is SEPARATE from the order's fulfilment_status on purpose. A
--  failed PDF must never make a delivered order look undelivered: the
--  customer has the page and the email, and a missing file is an
--  inconvenience where a missing report is a chargeback.
--
--  pdf_sha256 is printed in the document footer so a customer and their
--  auditor can compare two copies by eye and know they are identical.
-- ─────────────────────────────────────────────────────────────────────────

USE dshield;

DROP PROCEDURE IF EXISTS dshield_add_column;
DELIMITER $$
CREATE PROCEDURE dshield_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN spec TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', spec);
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;

CALL dshield_add_column('orders', 'pdf_path',   'VARCHAR(300) NULL AFTER report_json');
CALL dshield_add_column('orders', 'pdf_sha256', 'CHAR(64) NULL AFTER pdf_path');
CALL dshield_add_column('orders', 'pdf_bytes',  'INT UNSIGNED NULL AFTER pdf_sha256');
CALL dshield_add_column('orders', 'pdf_status', "ENUM('none','pending','ready','failed') NOT NULL DEFAULT 'none' AFTER pdf_bytes");
CALL dshield_add_column('orders', 'pdf_error',  'VARCHAR(500) NULL AFTER pdf_status');

DROP PROCEDURE IF EXISTS dshield_add_column;

-- ─────────────────────────────────────────────────────────────────────────
--  dShield Global Site — orders and payment events
--
--  RUN THIS AFTER schema.sql, schema-legal.sql AND schema-mail.sql.
--
--     mysql -u root -p < db/schema.sql
--     mysql -u root -p < db/schema-legal.sql
--     mysql -u root -p < db/schema-mail.sql
--     mysql -u root -p < db/schema-orders.sql
--
--  Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

USE dshield;


-- ── orders ───────────────────────────────────────────────────────────────
--
-- The order records WHAT WAS BOUGHT, before any money moves. v6.3 accepted a
-- domain at checkout, validated it, and discarded it — so even a correct
-- webhook arrived with nothing to scan. The domain is stored here at
-- creation and an assessment tier without one is refused before payment.
--
-- `fulfilment_status` is separate from `status` on purpose. "They paid" and
-- "they received it" are different facts, and the whole reason this table
-- exists is that v6.3 could be true on the first and false on the second
-- with nothing recording the gap. A paid order that was never delivered must
-- be findable in one query:
--
--     SELECT * FROM orders WHERE status='paid' AND fulfilment_status<>'delivered';
CREATE TABLE IF NOT EXISTS orders (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_ref           CHAR(36)     NOT NULL,          -- our public reference
  email               VARCHAR(190) NOT NULL,
  name                VARCHAR(120) NULL,
  company             VARCHAR(160) NULL,
  domain              VARCHAR(253) NULL,              -- NULL only for non-assessment products
  tier                VARCHAR(30)  NOT NULL,

  amount_paise        INT UNSIGNED NOT NULL,          -- what we asked for
  currency            CHAR(3)      NOT NULL DEFAULT 'INR',

  status              ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  fulfilment_status   ENUM('none','running','delivered','failed') NOT NULL DEFAULT 'none',
  fulfilment_error    VARCHAR(500) NULL,

  razorpay_order_id   VARCHAR(60)  NULL,

  -- THE IDEMPOTENCY GUARANTEE, and it is a database constraint rather than a
  -- flag in memory on purpose. A webhook that arrives twice, or a webhook
  -- racing the browser callback, must produce one scan, one report and one
  -- email. A second attempt to record the same payment fails this unique key
  -- and is caught, instead of quietly producing a second report.
  payment_id          VARCHAR(60)  NULL,
  amount_paid_paise   INT UNSIGNED NULL,              -- what actually arrived

  terms_version       SMALLINT UNSIGNED NULL,
  scan_id             CHAR(36)     NULL,
  report_token        CHAR(64)     NULL,
  report_expires_at   TIMESTAMP    NULL,

  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at             TIMESTAMP    NULL,
  delivered_at        TIMESTAMP    NULL,

  UNIQUE KEY uq_order_ref (order_ref),
  UNIQUE KEY uq_payment_id (payment_id),
  UNIQUE KEY uq_report_token (report_token),
  INDEX idx_status (status),
  INDEX idx_fulfilment (fulfilment_status),
  INDEX idx_email (email),
  INDEX idx_rzp_order (razorpay_order_id)
) ENGINE=InnoDB;


-- ── payment_events ───────────────────────────────────────────────────────
--
-- Every webhook received, exactly as it arrived, valid or not. NEVER DELETED.
--
-- When a customer says they paid and got nothing, this is the only place
-- that can settle it — and a webhook with a bad signature is precisely the
-- one worth keeping, because it is either an integration fault or somebody
-- probing the endpoint.
CREATE TABLE IF NOT EXISTS payment_events (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type        VARCHAR(60)  NULL,
  razorpay_order_id VARCHAR(60)  NULL,
  payment_id        VARCHAR(60)  NULL,
  signature_valid   BOOLEAN      NOT NULL DEFAULT FALSE,
  raw_body          JSON         NULL,
  received_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_payment (payment_id),
  INDEX idx_rzp_order (razorpay_order_id),
  INDEX idx_received (received_at),
  INDEX idx_valid (signature_valid)
) ENGINE=InnoDB;


-- ── orders.report_json ───────────────────────────────────────────────────
-- Added through information_schema: MySQL 8 has no ADD COLUMN IF NOT EXISTS
-- and this file must stay safe to re-run.
--
-- The report is stored as built. Re-opening a paid link must show the same
-- document a customer already read — a report that changes when you reload
-- it is not something anyone can act on, and it is what they paid for.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'report_json'
);
SET @ddl := IF(@col = 0,
  'ALTER TABLE orders ADD COLUMN report_json LONGTEXT NULL AFTER report_token',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

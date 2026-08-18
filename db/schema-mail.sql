-- ─────────────────────────────────────────────────────────────────────────
--  dShield Global Site — mail outbox
--
--  RUN THIS AFTER db/schema.sql AND db/schema-legal.sql.
--
--     mysql -u root -p < db/schema.sql
--     mysql -u root -p < db/schema-legal.sql
--     mysql -u root -p < db/schema-mail.sql
--
--  Safe to re-run.
--
--  WHY A TABLE AND NOT A DIRECT SEND
--
--  Nothing calls SendGrid inside a request handler. Every message is written
--  here first and a worker picks it up afterwards.
--
--  A Dolluz SendGrid account was frozen once. Every message attempted during
--  that window was dropped and gone, with nothing recording it had ever been
--  attempted — so nobody could say who had not been written to. A row
--  survives an outage, a restart and a bad deploy.
--
--  It also keeps the visitor off the critical path: an enquiry form confirms
--  in milliseconds whether or not mail is working at all.
-- ─────────────────────────────────────────────────────────────────────────

USE dshield;

CREATE TABLE IF NOT EXISTS mail_outbox (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  to_email    VARCHAR(190) NOT NULL,
  template    VARCHAR(40)  NOT NULL,   -- notify_confirm · scan_result · enquiry_ack · enquiry_alert

  -- Decides two things: whether suppression applies, and whether the footer
  -- must carry an unsubscribe link.
  --
  --   transactional  something the person asked for in that moment
  --   marketing      something we chose to send  → suppression + unsubscribe
  --   internal       an alert to Dolluz, not to a customer
  --
  -- When in doubt the answer is 'marketing'. Being wrong in that direction
  -- costs one unsent email; being wrong the other way is an unlawful send.
  category    ENUM('transactional','marketing','internal') NOT NULL,

  subject     VARCHAR(255) NOT NULL,

  -- Everything the template needs. The BODY IS RENDERED AT SEND TIME from
  -- this, never stored pre-rendered — otherwise fixing a typo in a template
  -- means re-queueing every row that has not gone out yet.
  payload     JSON         NOT NULL,

  -- 'suppressed' is deliberately NOT 'failed'. "We chose not to send this"
  -- and "we tried and could not" are different facts, and collapsing them
  -- makes this table unable to answer either question later.
  status      ENUM('queued','sending','sent','failed','suppressed') NOT NULL DEFAULT 'queued',

  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error  VARCHAR(500) NULL,
  queued_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     TIMESTAMP    NULL,

  -- The worker's only query: status + oldest first.
  INDEX idx_status_queued (status, queued_at),
  INDEX idx_to (to_email)
) ENGINE=InnoDB;


-- ── mail_outbox.cc ───────────────────────────────────────────────────────
-- Added after the table shipped, so it goes through information_schema
-- rather than a plain ALTER: MySQL 8 has no ADD COLUMN IF NOT EXISTS, and
-- this file has to stay safe to re-run.
--
-- Comma-separated list. Used by the enquiry alert so more than one person at
-- Dolluz sees an enquiry arrive — an alert that reaches one inbox nobody is
-- watching is the same failure as no alert at all.
SET @cc_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'mail_outbox'
    AND COLUMN_NAME  = 'cc'
);
SET @cc_ddl := IF(@cc_col = 0,
  'ALTER TABLE mail_outbox ADD COLUMN cc VARCHAR(500) NULL AFTER to_email',
  'DO 0');
PREPARE cc_stmt FROM @cc_ddl;
EXECUTE cc_stmt;
DEALLOCATE PREPARE cc_stmt;

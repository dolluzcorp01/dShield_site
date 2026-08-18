-- ─────────────────────────────────────────────────────────────────────────
--  dShield Global Site — schema
--
--  Run once:
--     mysql -u root -p < db/schema.sql
--
--  Four tables. The site does not have customers or logins yet: a visitor
--  runs a scan, uses a tool, or leaves an address. That is all this stores.
-- ─────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS dshield
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE dshield;


-- ── scans ────────────────────────────────────────────────────────────────
-- One row per free scan. result_json holds exactly what was returned to the
-- browser, so re-opening a shared link shows the same document — a result
-- that changes when you reload it is not a result anyone can act on.
CREATE TABLE IF NOT EXISTS scans (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scan_id           CHAR(36)     NOT NULL,
  domain            VARCHAR(253) NOT NULL,
  tier              VARCHAR(30)  NOT NULL DEFAULT 'snapshot',

  -- 'inconclusive' is a real state, not an error. Below the coverage floor
  -- no grade is published at all, because a scan that could not run must
  -- never be presentable as a clean result.
  status            ENUM('complete','inconclusive','failed') NOT NULL DEFAULT 'complete',

  grade             CHAR(1)      NULL,
  score             TINYINT UNSIGNED NULL,
  critical_count    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  high_count        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  medium_count      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  low_count         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  checks_run        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  checks_completed  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  coverage_ratio    DECIMAL(4,2) NULL,

  result_json       LONGTEXT     NOT NULL,

  visitor_ip        VARCHAR(60)  NULL,
  visitor_email     VARCHAR(190) NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_scan_id (scan_id),
  INDEX idx_domain (domain),
  INDEX idx_created (created_at),
  INDEX idx_email (visitor_email)
) ENGINE=InnoDB;


-- ── leads ────────────────────────────────────────────────────────────────
-- Anyone who left an address, from a scan or from the notify-me form.
-- Unique on email so a returning visitor updates their row rather than
-- creating a second one.
CREATE TABLE IF NOT EXISTS leads (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL,
  name           VARCHAR(120) NULL,
  company        VARCHAR(160) NULL,
  domain         VARCHAR(253) NULL,
  source         VARCHAR(40)  NOT NULL DEFAULT 'free_scan',
  tier_interest  VARCHAR(40)  NULL,
  scan_id        CHAR(36)     NULL,
  contacted      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_email (email),
  INDEX idx_created (created_at),
  INDEX idx_contacted (contacted)
) ENGINE=InnoDB;


-- ── enquiries ────────────────────────────────────────────────────────────
-- Somebody asking to speak to a person. Not unique on email: the same
-- person may write twice about different things, and collapsing those
-- loses the second message.
CREATE TABLE IF NOT EXISTS enquiries (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL,
  name           VARCHAR(120) NULL,
  company        VARCHAR(160) NULL,
  phone          VARCHAR(40)  NULL,
  domain         VARCHAR(253) NULL,
  tier_interest  VARCHAR(40)  NULL,
  message        TEXT         NULL,
  source         VARCHAR(40)  NOT NULL DEFAULT 'enquiry',
  handled        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_email (email),
  INDEX idx_handled (handled),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;


-- ── tool_usage ───────────────────────────────────────────────────────────
-- Which free tools people actually use, so the ones earning traffic can be
-- told apart from the ones that merely seemed like a good idea.
--
-- `target` is a domain or NULL. The password tool always writes NULL: it
-- never receives a password or a full hash, only a five-character prefix,
-- and storing even that would weaken a promise printed on the page.
CREATE TABLE IF NOT EXISTS tool_usage (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tool        VARCHAR(40)  NOT NULL,
  target      VARCHAR(253) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_tool (tool),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

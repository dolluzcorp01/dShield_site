-- ─────────────────────────────────────────────────────────────────────────
--  dShield Global Site — legal & compliance schema
--
--  RUN THIS AFTER db/schema.sql. It extends the `leads` table created there
--  and will fail on its own against an empty database.
--
--     mysql -u root -p < db/schema.sql
--     mysql -u root -p < db/schema-legal.sql
--
--  Safe to re-run. Every statement here is idempotent — see the note above
--  the ALTER at the bottom, which needs more than IF NOT EXISTS to be so.
-- ─────────────────────────────────────────────────────────────────────────

USE dshield;


-- ── legal_documents ──────────────────────────────────────────────────────
-- Versioned, never updated in place. When counsel replaces a placeholder
-- that is version 2, and version 1 still exists.
--
-- The reason is not tidiness. Once anyone has agreed to a version, editing
-- that row destroys the record of what they actually agreed to, and the
-- agreement is the only thing the document was for.
CREATE TABLE IF NOT EXISTS legal_documents (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_key         VARCHAR(40)  NOT NULL,          -- terms · privacy · refunds · cookies
  version         SMALLINT UNSIGNED NOT NULL,     -- starts at 1
  title           VARCHAR(160) NOT NULL,
  content         MEDIUMTEXT   NOT NULL,          -- markdown
  is_placeholder  BOOLEAN      NOT NULL DEFAULT TRUE,
  effective_from  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_doc_version (doc_key, version),
  INDEX idx_current (doc_key, effective_from)
) ENGINE=InnoDB;


-- ── email_suppression ────────────────────────────────────────────────────
-- SHA-256 of the lowercased, trimmed address. Nothing else.
--
-- THERE IS DELIBERATELY NO email COLUMN. Do not add one. This table answers
-- exactly one question, asked immediately before every send: is this address
-- suppressed? Storing the address itself would turn a suppression list into
-- a directory of everyone who has ever asked us to stop writing to them —
-- which is a worse thing to hold than the mailing list it protects.
--
-- THERE IS DELIBERATELY NO FOREIGN KEY to `leads`. A suppression must
-- outlive the lead row it came from. If the lead is erased under a DPDP
-- request and the suppression goes with it, the next form submission
-- re-subscribes somebody who asked to be left alone.
CREATE TABLE IF NOT EXISTS email_suppression (
  email_hash     CHAR(64) NOT NULL PRIMARY KEY,
  reason         ENUM('unsubscribed','complained','bounced','manual','erasure') NOT NULL,
  suppressed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- ── data_requests ────────────────────────────────────────────────────────
-- DPDP Act access, erasure and correction requests.
--
-- Indexed on status and created_at because the Act sets a response deadline:
-- these have to be findable by AGE, not only by address. An open request
-- nobody noticed is the failure mode this index exists to prevent.
CREATE TABLE IF NOT EXISTS data_requests (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL,
  request_type  ENUM('access','erasure','correction') NOT NULL,
  details       TEXT         NULL,
  status        ENUM('open','actioned','rejected') NOT NULL DEFAULT 'open',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actioned_at   TIMESTAMP    NULL,

  INDEX idx_status (status),
  INDEX idx_created (created_at),
  INDEX idx_email (email)
) ENGINE=InnoDB;


-- ── leads.unsubscribe_token ──────────────────────────────────────────────
-- MySQL 8 has no ADD COLUMN IF NOT EXISTS (that is MariaDB), so a plain
-- ALTER here would apply once and then fail with errno 1060 on every later
-- run. This file has to be safe to re-run, so the column is added through
-- information_schema instead.
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'leads'
    AND COLUMN_NAME  = 'unsubscribe_token'
);

SET @ddl := IF(@col = 0,
  'ALTER TABLE leads
     ADD COLUMN unsubscribe_token CHAR(36) NULL AFTER scan_id,
     ADD UNIQUE KEY uq_unsub_token (unsubscribe_token)',
  'DO 0');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ── Seed: the four placeholder documents ─────────────────────────────────
--
-- INSERT IGNORE against uq_doc_version, so re-running changes nothing and
-- will never overwrite a real document counsel has since supplied.
--
-- The body text is deliberately NOT legalese. It says what each document
-- will cover and states that it is not yet binding. Plausible-looking
-- invented terms would be worse than these blanks, because a visitor would
-- rely on them — and we would be publishing a promise nobody has approved.
--
-- The double-bracket markers below are literal and greppable. Do not invent
-- values for them: a wrong registered address in a published privacy notice
-- is worse than an obvious blank.

INSERT IGNORE INTO legal_documents (doc_key, version, title, content, is_placeholder) VALUES
('terms', 1, 'Terms of Service',
'## Not yet binding

This document is awaiting legal review. It describes what the finished Terms
of Service will cover. It does not yet create obligations for you or for us.

## Who we are

dShield is operated by [[LEGAL_ENTITY_NAME]], registered at
[[REGISTERED_ADDRESS]]. Company identification number: [[CIN]].

## What the finished document will cover

The terms on which the free scan and the five free tools may be used, and
what they are and are not. The scan reads information your servers already
publish to any visitor. It does not defend, block or remediate anything, and
no assessment can guarantee that a system is secure.

It will set out acceptable use — in particular that you may scan only domains
you are responsible for — and the limits of our liability for a service given
away without charge.

It will describe what happens when paid reports go on sale. Nothing is on
sale today.

## Governing law

Disputes will be subject to [[JURISDICTION]].

## Contact

[[SUPPORT_EMAIL]]', TRUE),

('privacy', 1, 'Privacy Notice',
'## Not yet binding

This document is awaiting legal review. It describes what the finished
Privacy Notice will cover, and states honestly what we already collect today.

## What we already collect

We collect this now, which is why this notice cannot wait for the rest of the
site to be finished.

When you run a free scan we store the domain you entered, the result, and
your IP address. The IP is stored to rate limit the scanner — a scan is a
request we make to somebody elses server, and an unlimited endpoint would
make this site a free attack tool pointed at a third party.

If you give us an email address, on a scan or through a form, we store it
together with any name, company, phone number or message you provided.

## What we do not do

We set no analytics cookies, no advertising cookies, and no tracking of any
kind. We do not sell personal data. We do not share it with third parties for
their own marketing.

## Your rights under the DPDP Act 2023

You may ask what we hold about you, ask for it to be corrected, or ask for it
to be erased. Use the data request form on this site, or write to the
grievance officer below.

## Grievance officer

[[GRIEVANCE_OFFICER_NAME]], [[GRIEVANCE_OFFICER_EMAIL]].

## Who we are

[[LEGAL_ENTITY_NAME]], [[REGISTERED_ADDRESS]]. General contact:
[[SUPPORT_EMAIL]].', TRUE),

('refunds', 1, 'Refund & Cancellation Policy',
'## Not yet binding

This document is awaiting legal review. It describes what the finished Refund
and Cancellation Policy will cover.

## Nothing is currently on sale

The free scan and the five free tools are free, permanently, and require no
card. Paid reports are not yet available for purchase, so there is at present
nothing that could need refunding.

This policy is published in advance rather than afterwards, because it has to
exist before anything goes on sale, not once the first person asks for their
money back.

## What the finished document will cover

The circumstances in which a one-time report may be refunded and the period
in which a refund may be requested. How a recurring subscription is
cancelled, and what happens to reports already delivered. How long a refund
takes to reach the original payment method.

## Contact

Refund requests will be handled by [[LEGAL_ENTITY_NAME]] at
[[SUPPORT_EMAIL]]. Disputes will be subject to [[JURISDICTION]].', TRUE),

('cookies', 1, 'Cookie Notice',
'## Not yet binding

This document is awaiting legal review. It describes the cookies this site
sets, which today is very nearly none.

## What we set

This site sets no analytics cookies, no advertising cookies, and no
cross-site tracking of any kind. There is no Google Analytics on this site,
no advertising pixel, and no third-party script that observes your visit.

Only strictly necessary cookies are used, to keep the site working while you
move between pages.

## Why there is no consent banner

Under both the DPDP Act and the GDPR, consent is required for non-essential
cookies. We do not set any. A banner asking your permission for cookies that
do not exist would be theatre, and asking for consent that is not needed
trains people to click through the consent that is.

If that changes — if analytics is ever added to this site — a consent banner
becomes required, and this notice must be rewritten before it ships.

## Contact

[[LEGAL_ENTITY_NAME]], [[SUPPORT_EMAIL]].', TRUE);

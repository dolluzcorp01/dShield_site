// ─────────────────────────────────────────────────────────────────────────
//  Lead_server — enquiries, notify-me signups, and the pricing content.
//
//  POST /api/leads/enquiry     someone wants to talk to a person
//  POST /api/leads/notify      "tell me when paid tiers open"
//  GET  /api/leads/pricing     tier content for the pricing page
//
//  Payments are not live yet: Razorpay onboarding and the legal documents
//  are outstanding. Until they land, the pricing page states the prices and
//  collects interest rather than pretending to take money. A checkout that
//  takes a card and delivers nothing is the fastest way to lose a payment
//  gateway, and it is the one thing we cannot afford in week one.
// ─────────────────────────────────────────────────────────────────────────

const express = require("express");
const crypto = require("crypto");
const getDBConnection = require("../../config/db");
const { isSuppressed } = require("../utils/suppression");
const { queueMail } = require("../utils/mail");
const { getPlans, paymentsConfigured } = require("../data/plans");

/* Service slugs, mirrored from SERVICE_LABELS in src/Pages.js. Kept here so
   an enquiry alert reads "Penetration Testing" rather than
   "penetration-testing" — whoever picks it up should not have to decode a
   URL slug. */
const TOPIC_LABELS = {
    "technical-assurance": "Technical Assurance",
    "third-party-risk-management": "Third-Party Risk Management",
    "soc-setup-monitoring": "SOC Setup & Monitoring",
    "incident-response-forensics": "Incident Response & Forensics",
    "penetration-testing": "Penetration Testing",
    "continuous-grc": "Continuous GRC",
    "standards-compliance-audits": "Standards & Compliance Audits",
};
const labelForTopic = (slug) => (slug ? (TOPIC_LABELS[slug] || slug) : null);

const router = express.Router();
const db = getDBConnection(process.env.DB_NAME || "dshield");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => (v === undefined || v === null) ? null : String(v).trim().slice(0, max) || null;

// ── POST /api/leads/enquiry ──────────────────────────────────────────────
router.post("/enquiry", (req, res) => {
    const email = clean(req.body?.email, 190);
    if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid email address so we can reply." });
    }

    const row = {
        email: email.toLowerCase(),
        name: clean(req.body?.name, 120),
        company: clean(req.body?.company, 160),
        phone: clean(req.body?.phone, 40),
        domain: clean(req.body?.domain, 253),
        /* An enquiry can now arrive from a service card with a slug in
           `topic`, or from the tier selector with `tier`. Both are the same
           kind of thing — a free-text marker for what the person is after —
           so both land in tier_interest rather than earning a column. A
           migration for one string is not worth the schema drift.

           `topic` wins when both are present: it comes from the card they
           actually clicked, while `tier` may just be the selector's default.

           Clamped to 40, not 60. enquiries.tier_interest is VARCHAR(40) and
           this server runs under STRICT_TRANS_TABLES, so a 60-character topic
           would not truncate — it would raise "Data too long for column" and
           lose the whole enquiry to a 500. Every slug we emit is well under
           40; the cap is here for anything hand-crafted in a URL. */
        tier_interest: clean(req.body?.topic, 40) || clean(req.body?.tier, 40),
        message: clean(req.body?.message, 2000),
        source: "enquiry",
    };

    db.query("INSERT INTO enquiries SET ?", row, (err) => {
        if (err) {
            console.error("❌ Enquiry could not be stored:", err.sqlMessage || err.message);
            return res.status(500).json({ success: false, message: "We could not record that. Please try again." });
        }

        /* Two messages: an acknowledgement to them, and an alert to us.
           Both go through the outbox rather than to SendGrid directly, so a
           provider outage cannot lose them.

           Neither is allowed to affect the response. The enquiry is stored,
           which is the part that matters to the visitor — if queueing fails
           we log it and still say thank you. */
        const payload = {
            name: row.name, email: row.email, company: row.company, phone: row.phone,
            domain: row.domain, tier: clean(req.body?.tier, 40),
            topicLabel: labelForTopic(clean(req.body?.topic, 40)),
            message: row.message,
            receivedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
        };

        queueMail(db, {
            to: row.email, template: "enquiry_ack", category: "transactional",
            subject: "We have your message — Dolluz Corp", payload,
        }, (qErr) => { if (qErr) console.error("⚠️  Could not queue enquiry acknowledgement:", qErr.message); });

        const alertTo = String(process.env.ENQUIRY_ALERT_TO || "").trim();
        if (alertTo) {
            /* Copy the rest of the team. An alert that reaches one inbox
               nobody happens to be watching is the same failure as no alert
               at all. Addresses live in ENQUIRY_ALERT_CC rather than in this
               file — who should see an enquiry is configuration, and changing
               it should not need a deploy. */
            queueMail(db, {
                to: alertTo, cc: process.env.ENQUIRY_ALERT_CC || "",
                template: "enquiry_alert", category: "internal",
                subject: `Enquiry from ${payload.name || payload.email} — ${payload.topicLabel || payload.tier || "general"}`,
                payload,
            }, (qErr) => { if (qErr) console.error("⚠️  Could not queue enquiry alert:", qErr.message); });
        } else {
            // Louder than a shrug: with no address set, nobody is told an
            // enquiry arrived, which is the exact failure this task exists
            // to fix.
            console.error("⚠️  ENQUIRY_ALERT_TO is not set — nobody will be notified of this enquiry.");
        }

        res.json({
            success: true,
            message: "Thank you. We have your enquiry and someone will be in touch.",
        });
    });
});

/* Where a lead came from.

   ALLOW-LISTED, NOT TAKEN FROM THE BODY AS-IS. `source` is how we tell a
   "tell me when reports open" signup from somebody who asked for a copy of
   their free scan, and those two get different follow-up. Letting a caller
   write an arbitrary string into it would turn a reporting column into a
   free-text field nobody can group by, and the value reaches the database,
   so it is validated rather than cleaned.

   Anything unrecognised falls back to notify_me, which is what this endpoint
   did before it took the parameter at all. */
const LEAD_SOURCES = ["notify_me", "free_scan"];

// ── POST /api/leads/notify ───────────────────────────────────────────────
router.post("/notify", (req, res) => {
    const email = clean(req.body?.email, 190);
    if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    const address = email.toLowerCase();

    const source = LEAD_SOURCES.includes(req.body?.source) ? req.body.source : "notify_me";

    /* THE MARKETING TICK, AND WHAT IT ACTUALLY CONTROLS.
       A scan-result request is transactional: they typed an address into a box
       offering to send them their own result. The marketing confirmation is a
       separate thing, and it is sent only when the box was ticked.

       A tick-box that changes nothing is worse than no tick-box: it collects a
       decision, ignores it, and leaves the person believing they opted out.

       "notify_me" has no box — that form IS the marketing signup — so it stays
       opted in by default, exactly as before. */
    const marketingOptIn = source === "free_scan"
        ? req.body?.marketingOptIn === true
        : true;

    /* What we say back. Somebody who asked for a copy of their scan is not
       joining a waiting list, and telling them "we will write when reports
       open" reads as though we ignored what they clicked. */
    const done = source === "free_scan"
        ? "Thank you. We have your address and your result is on its way."
        : "You are on the list. We will write when reports open.";

    /* The scan this address was offered for, when there is one. Validated as
       a UUID rather than cleaned: it is a foreign key, and a malformed one
       stored is a row that joins to nothing. */
    const rawScan = clean(req.body?.scanId, 36);
    const scanId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawScan)
        ? rawScan : null;

    /* Check the suppression list BEFORE writing anything.
       Somebody who has unsubscribed and later fills in a form must not be
       quietly re-subscribed by it. They are also not told they are on a
       suppression list — that would let anyone test whether a given address
       had ever unsubscribed, which is nobody's business but theirs. The
       response is the ordinary one, and no row is written. */
    isSuppressed(db, address, (supErr, suppressed) => {
        if (supErr) {
            console.error("❌ Suppression check failed:", supErr.sqlMessage || supErr.message);
            return res.status(500).json({ success: false, message: "We could not record that. Please try again." });
        }
        if (suppressed) {
            /* Suppressed: the same answer as the ordinary path, and no row.
               Saying anything different would let anyone test whether a given
               address had ever unsubscribed. */
            return res.json({ success: true, message: done });
        }

        db.query(
            `INSERT INTO leads (email, name, company, domain, source, tier_interest, scan_id, unsubscribe_token)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               tier_interest = VALUES(tier_interest),
               -- Fill these in only when this request carried them, so a
               -- scan signup does not blank the domain a previous one
               -- recorded, and a later notify_me does not erase the scan a
               -- free_scan lead was captured against.
               domain  = COALESCE(VALUES(domain), domain),
               scan_id = COALESCE(VALUES(scan_id), scan_id),
               -- Keep the token already printed in an email they may still
               -- have. Reissuing it would break every unsubscribe link we
               -- have ever sent this person.
               unsubscribe_token = COALESCE(unsubscribe_token, VALUES(unsubscribe_token)),
               updated_at = CURRENT_TIMESTAMP`,
            [address, clean(req.body?.name, 120), clean(req.body?.company, 160),
             clean(req.body?.domain, 253) || null, source, clean(req.body?.tier, 40),
             scanId, crypto.randomUUID()],
            (err) => {
                if (err) {
                    console.error("❌ Notify signup failed:", err.sqlMessage || err.message);
                    return res.status(500).json({ success: false, message: "We could not record that. Please try again." });
                }

                /* Answer the visitor first. Everything below is bookkeeping
                   and must not delay or endanger the response. */
                res.json({ success: true, message: done });

                /* No tick, no marketing mail. The lead row above still exists
                   — they asked for their result and we have to be able to send
                   it — but nothing in the marketing category goes out.

                   ⚠️  THE TICK ITSELF IS NOT YET STORED. `leads` has no consent
                   column, so what is recorded is the CONSEQUENCE of the answer
                   (a confirmation sent, or not) rather than the answer and the
                   wording they agreed to. That is enough to behave correctly
                   and not enough to prove consent to an auditor. Adding
                   consent_text and consent_at to db/schema.sql closes it. */
                if (!marketingOptIn) return;

                /* Read the token BACK rather than using the one generated
                   above. On the duplicate-key path COALESCE keeps whatever
                   token the row already had, so the value we just generated
                   may not be the one stored — and an unsubscribe link built
                   from a token that is not in the database is a link that
                   cannot work. */
                db.query(
                    "SELECT unsubscribe_token FROM leads WHERE email = ? LIMIT 1",
                    [address],
                    (tErr, rows) => {
                        if (tErr || !rows || !rows.length) {
                            return console.error("⚠️  Could not read unsubscribe token, confirmation not queued:",
                                tErr ? (tErr.sqlMessage || tErr.message) : "no row");
                        }
                        queueMail(db, {
                            to: address,
                            template: "notify_confirm",
                            category: "marketing",
                            subject: "You are on the list — dShield",
                            payload: { unsubscribeToken: rows[0].unsubscribe_token },
                        }, (qErr) => { if (qErr) console.error("⚠️  Could not queue notify confirmation:", qErr.message); });
                    }
                );
            }
        );
    });
});

// ── GET /api/leads/pricing ───────────────────────────────────────────────
//
// Served from the API rather than hardcoded in the React bundle so a price
// change is a data change, not a rebuild and redeploy.
//
// The list itself now lives in src/data/plans.js, shared with checkout —
// the pricing page and the till disagreeing about what something costs is
// the kind of problem you hear about from a customer.
router.get("/pricing", (req, res) => {
    res.json({
        success: true,
        plans: getPlans(),
        paymentsLive: paymentsConfigured(),
        note: paymentsConfigured()
            ? "Prices are charged in Indian rupees."
            : "Reports are not yet on sale. Leave your address and we will write the moment they are.",
    });
});

module.exports = router;

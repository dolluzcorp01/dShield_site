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

// ── POST /api/leads/notify ───────────────────────────────────────────────
router.post("/notify", (req, res) => {
    const email = clean(req.body?.email, 190);
    if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    const address = email.toLowerCase();

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
            return res.json({ success: true, message: "You are on the list. We will write when reports open." });
        }

        db.query(
            `INSERT INTO leads (email, name, company, domain, source, tier_interest, unsubscribe_token)
             VALUES (?, ?, ?, ?, 'notify_me', ?, ?)
             ON DUPLICATE KEY UPDATE
               tier_interest = VALUES(tier_interest),
               -- Keep the token already printed in an email they may still
               -- have. Reissuing it would break every unsubscribe link we
               -- have ever sent this person.
               unsubscribe_token = COALESCE(unsubscribe_token, VALUES(unsubscribe_token)),
               updated_at = CURRENT_TIMESTAMP`,
            [address, clean(req.body?.name, 120), clean(req.body?.company, 160),
             clean(req.body?.domain, 253), clean(req.body?.tier, 40), crypto.randomUUID()],
            (err) => {
                if (err) {
                    console.error("❌ Notify signup failed:", err.sqlMessage || err.message);
                    return res.status(500).json({ success: false, message: "We could not record that. Please try again." });
                }

                /* Answer the visitor first. Everything below is bookkeeping
                   and must not delay or endanger the response. */
                res.json({ success: true, message: "You are on the list. We will write when reports open." });

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
// change is a data change, not a rebuild and redeploy. When the console
// exists this reads from pricing_plans instead.
const PLANS = [
    {
        key: "snapshot", name: "Free scan", price: 0, display: "Free",
        billing: "No card, no sign-up",
        tagline: "Where you stand, from outside",
        features: [
            "Grade across the five domains a scan can measure",
            "How many issues, and how serious",
            "The full 23-domain coverage map",
            "Unlimited, forever",
        ],
        notIncluded: ["What the issues actually are"],
        available: true,
        cta: "Run a free scan",
    },
    {
        key: "basic", name: "Basic", price: 49, display: "$49",
        billing: "one-time",
        tagline: "Knowing what is wrong",
        features: [
            "Every finding named, with the evidence",
            "Severity and priority for each",
            "A timeline per finding",
            "PDF and machine-readable export",
        ],
        notIncluded: ["How to fix any of it"],
        available: false,
        cta: "Notify me",
    },
    {
        key: "advanced", name: "Advanced", price: 199, display: "$199",
        billing: "one-time or monthly",
        tagline: "Measuring, not just asking",
        highlight: true,
        features: [
            "Everything in Basic",
            "Step-by-step remediation for every finding",
            "Effort estimate and verification step",
            "A prioritised 90-day roadmap",
            "Connect 3 of your own systems, read-only",
            "We measure your posture directly",
        ],
        available: false,
        cta: "Notify me",
    },
    {
        key: "full_protection", name: "Full Protection", price: 499, display: "$499",
        billing: "one-time or monthly",
        tagline: "Seeing all 23 domains",
        features: [
            "Everything in Advanced",
            "Connect 15 systems",
            "222-question guided assessment",
            "Covers the 18 domains no scan can reach",
            "Two consultation sessions with a specialist",
            "Log and document analysis",
        ],
        available: false,
        cta: "Talk to us",
    },
    {
        // Named for what it is: Extended Support is not an alternative to Full
        // Protection, it is Full Protection with the remediation carried out.
        // The key stays `extended_support` — it is written into leads and
        // enquiries rows already, and renaming it would orphan them.
        key: "extended_support", name: "Full Protection + Extended Support", price: 999, display: "$999+",
        billing: "per month",
        tagline: "Having it fixed, not documented",
        features: [
            "Everything in Full Protection",
            "Connect 25 systems",
            "Remediation carried out by our engineers",
            "Four consultation hours every month",
            "A named lead who knows your estate",
            "Three months post-resolution support",
        ],
        available: false,
        cta: "Talk to us",
    },
];

router.get("/pricing", (req, res) => {
    res.json({
        success: true,
        plans: PLANS,
        paymentsLive: false,
        note: "Reports are not yet on sale. Leave your address and we will write the moment they are.",
    });
});

module.exports = router;

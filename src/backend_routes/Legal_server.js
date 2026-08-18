// ─────────────────────────────────────────────────────────────────────────
//  Legal_server — legal documents, email preferences, and DPDP data requests.
//
//  Exports THREE routers rather than one, because they mount at three
//  different paths and a single router would have to carry the mount point
//  inside its own route strings. Mounted explicitly in server.js:
//
//    legalRouter        → /api/legal
//    preferencesRouter  → /api/preferences
//    dataRequestRouter  → /api/data-request
//
//  GET  /api/legal                       list current documents
//  GET  /api/legal/:key                  one document, latest version
//  GET  /api/preferences/:token          masked address for an unsubscribe link
//  POST /api/preferences/:token/unsubscribe
//  POST /api/data-request                access · erasure · correction
// ─────────────────────────────────────────────────────────────────────────

const express = require("express");
const crypto = require("crypto");
const getDBConnection = require("../../config/db");

const db = getDBConnection(process.env.DB_NAME || "dshield");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => (v === undefined || v === null) ? null : String(v).trim().slice(0, max) || null;

// The only four keys that exist. `:key` is checked against this list and the
// matched constant is what reaches SQL — the value from the URL is passed as
// a bound parameter and never interpolated.
const DOC_KEYS = ["terms", "privacy", "refunds", "cookies"];

/** SHA-256 of the lowercased, trimmed address. The only form we ever store. */
function emailHash(email) {
    return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
}

/**
 * Mask an address for display: sh•••@dolluzcorp.com
 *
 * The person recognises their own address; nobody learns a new one. Without
 * this, anyone who guesses a token is handed a working email address.
 */
function maskEmail(email) {
    const s = String(email || "");
    const at = s.lastIndexOf("@");
    if (at < 1) return "•••";
    const local = s.slice(0, at);
    const domain = s.slice(at);
    const keep = local.slice(0, Math.min(2, local.length));
    return `${keep}•••${domain}`;
}

// ── rate limiting ────────────────────────────────────────────────────────
// Same in-memory pattern as Tools_server. Ten data requests an hour per IP
// is ample for a genuine request and stops the table being filled by a
// script. Resets on restart; see the note in Scan_server about Redis if this
// is ever run as more than one process.
const WINDOW = 3600000, PER_HOUR = 10;
const hits = new Map();

function limited(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
    if (list.length >= PER_HOUR) { hits.set(ip, list); return true; }
    list.push(now); hits.set(ip, list);
    return false;
}
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) {
        const live = v.filter((t) => now - t < WINDOW);
        if (live.length) hits.set(k, live); else hits.delete(k);
    }
}, 600000).unref();

function ipOf(req) {
    return String(req.ip || req.connection?.remoteAddress || "").replace(/^::ffff:/, "");
}


/* ── legalRouter · /api/legal ─────────────────────────────────────────── */

const legalRouter = express.Router();

// List the current version of every document.
legalRouter.get("/", (req, res) => {
    db.query(
        `SELECT d.doc_key, d.title, d.is_placeholder, d.effective_from, d.version
           FROM legal_documents d
           JOIN (SELECT doc_key, MAX(version) AS v
                   FROM legal_documents GROUP BY doc_key) latest
             ON latest.doc_key = d.doc_key AND latest.v = d.version
          ORDER BY FIELD(d.doc_key, 'terms', 'privacy', 'refunds', 'cookies')`,
        (err, rows) => {
            if (err) {
                console.error("❌ Legal document list failed:", err.sqlMessage || err.message);
                return res.status(500).json({ success: false, message: "Those documents could not be loaded." });
            }
            res.json({
                success: true,
                documents: (rows || []).map((r) => ({
                    key: r.doc_key,
                    title: r.title,
                    isPlaceholder: !!r.is_placeholder,
                    effectiveFrom: r.effective_from,
                    version: r.version,
                })),
            });
        }
    );
});

// One document, latest version.
legalRouter.get("/:key", (req, res) => {
    const key = DOC_KEYS.find((k) => k === String(req.params.key || "").toLowerCase());
    if (!key) {
        return res.status(404).json({ success: false, message: "There is no such document." });
    }
    db.query(
        `SELECT doc_key, version, title, content, is_placeholder, effective_from
           FROM legal_documents
          WHERE doc_key = ?
          ORDER BY version DESC
          LIMIT 1`,
        [key],
        (err, rows) => {
            if (err) {
                console.error("❌ Legal document read failed:", err.sqlMessage || err.message);
                return res.status(500).json({ success: false, message: "That document could not be loaded." });
            }
            if (!rows.length) {
                return res.status(404).json({ success: false, message: "That document has not been published yet." });
            }
            const d = rows[0];
            res.json({
                success: true,
                document: {
                    key: d.doc_key,
                    version: d.version,
                    title: d.title,
                    content: d.content,
                    isPlaceholder: !!d.is_placeholder,
                    effectiveFrom: d.effective_from,
                },
            });
        }
    );
});


/* ── preferencesRouter · /api/preferences ─────────────────────────────── */

const preferencesRouter = express.Router();

// Deliberately the same message for an unknown token and an expired one.
// Distinguishing them turns this endpoint into an oracle for testing whether
// a guessed token was ever real.
const TOKEN_GONE = "That preferences link is no longer valid. It may have expired, or already been used.";

const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ""));

preferencesRouter.get("/:token", (req, res) => {
    const token = String(req.params.token || "");
    if (!isUuid(token)) {
        return res.status(404).json({ success: false, message: TOKEN_GONE });
    }
    db.query(
        "SELECT email, name FROM leads WHERE unsubscribe_token = ? LIMIT 1",
        [token],
        (err, rows) => {
            if (err) {
                console.error("❌ Preferences lookup failed:", err.sqlMessage || err.message);
                return res.status(500).json({ success: false, message: "We could not open that page. Please try again." });
            }
            if (!rows.length) {
                return res.status(404).json({ success: false, message: TOKEN_GONE });
            }
            // Masked. The full address is never returned by this endpoint.
            db.query(
                "SELECT 1 FROM email_suppression WHERE email_hash = ? LIMIT 1",
                [emailHash(rows[0].email)],
                (err2, sup) => {
                    if (err2) console.error("⚠️  Suppression check failed:", err2.sqlMessage || err2.message);
                    res.json({
                        success: true,
                        maskedEmail: maskEmail(rows[0].email),
                        name: rows[0].name || null,
                        alreadyUnsubscribed: !!(sup && sup.length),
                    });
                }
            );
        }
    );
});

// Idempotent by construction: the hash is the primary key, so unsubscribing
// twice updates the same row rather than failing. Somebody clicking the link
// a second time is confirming an intention, not making a mistake.
preferencesRouter.post("/:token/unsubscribe", (req, res) => {
    const token = String(req.params.token || "");
    if (!isUuid(token)) {
        return res.status(404).json({ success: false, message: TOKEN_GONE });
    }
    db.query(
        "SELECT email FROM leads WHERE unsubscribe_token = ? LIMIT 1",
        [token],
        (err, rows) => {
            if (err) {
                console.error("❌ Unsubscribe lookup failed:", err.sqlMessage || err.message);
                return res.status(500).json({ success: false, message: "We could not record that. Please try again." });
            }
            if (!rows.length) {
                return res.status(404).json({ success: false, message: TOKEN_GONE });
            }
            db.query(
                `INSERT INTO email_suppression (email_hash, reason)
                 VALUES (?, 'unsubscribed')
                 ON DUPLICATE KEY UPDATE reason = 'unsubscribed'`,
                [emailHash(rows[0].email)],
                (err2) => {
                    if (err2) {
                        console.error("❌ Suppression write failed:", err2.sqlMessage || err2.message);
                        return res.status(500).json({ success: false, message: "We could not record that. Please try again." });
                    }
                    res.json({
                        success: true,
                        message: "You are unsubscribed. We will not send you email again.",
                    });
                }
            );
        }
    );
});


/* ── dataRequestRouter · /api/data-request ────────────────────────────── */

const dataRequestRouter = express.Router();

const REQUEST_TYPES = ["access", "erasure", "correction"];

dataRequestRouter.post("/", (req, res) => {
    if (limited(ipOf(req))) {
        return res.status(429).json({
            success: false,
            message: "That is a lot of requests at once. Try again a little later.",
        });
    }

    const email = clean(req.body?.email, 190);
    if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid email address so we can find your records and reply." });
    }

    const type = REQUEST_TYPES.find((t) => t === String(req.body?.request_type || "").toLowerCase());
    if (!type) {
        return res.status(400).json({ success: false, message: "Choose whether you want access, correction or erasure." });
    }

    db.query(
        "INSERT INTO data_requests SET ?",
        { email: email.toLowerCase(), request_type: type, details: clean(req.body?.details, 2000) },
        (err) => {
            if (err) {
                console.error("❌ Data request could not be stored:", err.sqlMessage || err.message);
                return res.status(500).json({ success: false, message: "We could not record that. Please try again." });
            }
            /* No email is sent — SendGrid is not wired on this app. The row is
               the record, and somebody has to watch `data_requests`. The DPDP
               Act sets a response deadline, so a request nobody reads is not a
               missed message, it is a missed statutory deadline. */
            res.json({
                success: true,
                message: "We have your request. We will reply to the address you gave within the statutory period.",
            });
        }
    );
});


module.exports = { legalRouter, preferencesRouter, dataRequestRouter };

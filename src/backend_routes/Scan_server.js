// ─────────────────────────────────────────────────────────────────────────
//  Scan_server — the free scan.
//
//  POST /api/scan          run a snapshot scan, store it, return the result
//  GET  /api/scan/:id      re-open a result by its id (shareable link)
//
//  The free scan costs nothing to run: eight checks over DNS, TLS and HTTP,
//  no third-party service and no API key. That is why it can be unlimited
//  and why it is the top of the funnel.
//
//  The paywall lives here and in scan_engine, on the server. Withheld
//  findings are never sent to the browser, so they cannot be read out of the
//  page source by a curious visitor.
// ─────────────────────────────────────────────────────────────────────────

const express = require("express");
const crypto = require("crypto");
const getDBConnection = require("../../config/db");
const { runScan } = require("../utils/scan_engine");
const { isSuppressed } = require("../utils/suppression");

const router = express.Router();
const db = getDBConnection(process.env.DB_NAME || "dshield");

// ── rate limiting ────────────────────────────────────────────────────────
//
// In-memory, per IP and per target domain. Two reasons, and the second
// matters more: a scan is a request WE make to somebody else's server, so
// an unlimited endpoint turns dShield into a free attack tool pointed at a
// third party. Our IP gets blocked and our reputation goes with it.
//
// Note this resets on restart and does not survive multiple processes. That
// is acceptable while the site runs as a single instance. If it is ever
// scaled behind a load balancer, move this to Redis — a per-process limit
// across four processes is four times the limit.

const RATE = { perIpPerHour: 12, perDomainPerHour: 4, windowMs: 3600000 };
const hits = new Map();

function tooMany(key, limit) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < RATE.windowMs);
    if (list.length >= limit) {
        hits.set(key, list);
        return Math.ceil((RATE.windowMs - (now - list[0])) / 60000);   // minutes until free
    }
    list.push(now);
    hits.set(key, list);
    return 0;
}

// Keep the map from growing without bound on a long-running process.
setInterval(() => {
    const now = Date.now();
    for (const [k, list] of hits) {
        const live = list.filter((t) => now - t < RATE.windowMs);
        if (live.length) hits.set(k, live); else hits.delete(k);
    }
}, 600000).unref();

/**
 * Reduce an IP to the unit we limit on.
 *
 * IPv6 is truncated to its /64 prefix. A single user is routinely allocated
 * a whole /64, so limiting on the full address lets one person rotate
 * through billions of them and never hit a limit.
 */
function ipKey(req) {
    const raw = String(req.ip || req.connection?.remoteAddress || "")
        .replace(/^::ffff:/, "");
    if (!raw.includes(":")) return raw;
    return raw.split(":").slice(0, 4).join(":") + "::/64";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── POST /api/scan ───────────────────────────────────────────────────────
router.post("/", async (req, res) => {
    const { domain, email, name, company } = req.body || {};

    if (!domain || typeof domain !== "string") {
        return res.status(400).json({ success: false, message: "Enter a domain to scan." });
    }

    const ip = ipKey(req);
    let wait = tooMany(`ip:${ip}`, RATE.perIpPerHour);
    if (wait) {
        return res.status(429).json({
            success: false,
            message: `That is a lot of scans from one place. Try again in about ${wait} minute(s).`,
        });
    }

    const cleanDomain = String(domain).trim().toLowerCase()
        .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    wait = tooMany(`domain:${cleanDomain}`, RATE.perDomainPerHour);
    if (wait) {
        return res.status(429).json({
            success: false,
            message: `${cleanDomain} was scanned recently. Try again in about ${wait} minute(s).`,
        });
    }

    let result;
    try {
        result = await runScan(cleanDomain);
    } catch (err) {
        // A refused or unresolvable domain is the visitor's problem to fix, not
        // an error to apologise for. Give them the reason in plain words.
        const known = ["INVALID_DOMAIN", "UNRESOLVABLE", "PRIVATE_ADDRESS"].includes(err.code);
        if (!known) console.error("❌ Scan failed:", cleanDomain, err.message);
        return res.status(known ? 400 : 500).json({
            success: false,
            message: known ? err.message : "The scan could not be completed. Please try again.",
        });
    }

    const scanId = crypto.randomUUID();

    // Persist, but never at the cost of the result. The visitor came for the
    // scan; a database problem is ours to notice, not theirs to suffer.
    const row = {
        scan_id: scanId,
        domain: result.domain,
        tier: "snapshot",
        status: result.status,
        grade: result.grade,
        score: result.score,
        critical_count: result.counts.critical,
        high_count: result.counts.high,
        medium_count: result.counts.medium,
        low_count: result.counts.low,
        checks_run: result.checksRun,
        checks_completed: result.checksCompleted,
        coverage_ratio: result.coverageRatio,
        result_json: JSON.stringify(result),
        visitor_ip: ip,
        visitor_email: EMAIL_RE.test(String(email || "")) ? String(email).trim().toLowerCase() : null,
    };

    db.query("INSERT INTO scans SET ?", row, (err) => {
        if (err) console.error("⚠️  Scan ran but could not be stored:", err.sqlMessage || err.message);
    });

    /* Lead capture, if they offered an address. Same rule: a failure here
       must never cost them the check they came for.

       Note what is NOT gated on suppression: `scans.visitor_email` above.
       They typed that address into a box offering to send them this result.
       It is the record of what happened and a transactional address, not a
       marketing subscription, and erasing it would leave a scan nobody can
       be told about. Suppression governs the mailing list, not the receipt.

       The `leads` row is a different thing, and it is gated. Someone who has
       unsubscribed and later runs a scan must not be quietly re-subscribed
       by it — an unsubscribe that only holds until the next form is not an
       unsubscribe. */
    if (row.visitor_email) {
        isSuppressed(db, row.visitor_email, (supErr, suppressed) => {
            /* Fail closed. If we could not confirm they are NOT suppressed,
               do not write the lead. A lead we failed to capture is
               recoverable — they are in `scans` either way. Email sent to
               someone who asked us to stop is not. */
            if (supErr) {
                console.error("⚠️  Suppression check failed, lead not captured:", supErr.sqlMessage || supErr.message);
                return;
            }
            if (suppressed) return;

            db.query(
                `INSERT INTO leads (email, name, company, domain, source, scan_id)
                 VALUES (?, ?, ?, ?, 'free_scan', ?)
                 ON DUPLICATE KEY UPDATE
                   name = COALESCE(VALUES(name), name),
                   company = COALESCE(VALUES(company), company),
                   domain = VALUES(domain),
                   scan_id = VALUES(scan_id),
                   updated_at = CURRENT_TIMESTAMP`,
                [row.visitor_email, name || null, company || null, result.domain, scanId],
                (err) => { if (err) console.error("⚠️  Lead capture failed:", err.sqlMessage || err.message); }
            );
        });
    }

    res.json({ success: true, scanId, result });
});

// ── GET /api/scan/:id ────────────────────────────────────────────────────
// A shareable link to a result. Free-tier content only — the stored JSON is
// exactly what was returned, which never contained withheld detail.
router.get("/:id", (req, res) => {
    const id = String(req.params.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return res.status(400).json({ success: false, message: "Invalid scan reference." });
    }
    db.query("SELECT result_json, created_at FROM scans WHERE scan_id = ? LIMIT 1", [id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });
        if (!rows.length) return res.status(404).json({ success: false, message: "That scan was not found. It may have expired." });
        let result;
        try { result = JSON.parse(rows[0].result_json); }
        catch (e) { return res.status(500).json({ success: false, message: "That result could not be read." }); }
        res.json({ success: true, scanId: id, result, createdAt: rows[0].created_at });
    });
});

module.exports = router;

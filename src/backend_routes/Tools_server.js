// ─────────────────────────────────────────────────────────────────────────
//  Tools_server — the five free tools.
//
//  GET  /api/tools/password/:prefix    5-char hash prefix ONLY, never a password
//  POST /api/tools/email-spoofing      { domain }
//  POST /api/tools/ssl                 { domain }
//  POST /api/tools/headers             { domain }
//  POST /api/tools/lookalike           { domain }
//
//  Free forever, no login, no email, no card. Each ends with an offer to run
//  the full scan, which is the only thing they are selling.
// ─────────────────────────────────────────────────────────────────────────

const express = require("express");
const getDBConnection = require("../../config/db");
const T = require("../utils/tools_engine");

const router = express.Router();
const db = getDBConnection(process.env.DB_NAME || "dshield");

// Shared limiter. Looser than the scan: these are cheap, and a visitor
// testing four of their domains in a row is normal behaviour, not abuse.
const WINDOW = 3600000, PER_HOUR = 60;
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

/** Record which tools get used. Domain only — never a password or a hash. */
function logUse(tool, domain) {
    db.query("INSERT INTO tool_usage (tool, target) VALUES (?, ?)", [tool, domain || null],
        (err) => { if (err) console.error("⚠️  tool_usage insert failed:", err.sqlMessage || err.message); });
}

function guard(req, res) {
    if (limited(ipOf(req))) {
        res.status(429).json({ success: false, message: "That is a lot of checks at once. Try again a little later." });
        return false;
    }
    return true;
}

function run(toolName, fn) {
    return async (req, res) => {
        if (!guard(req, res)) return;
        const domain = (req.body && req.body.domain) || "";
        if (!domain) return res.status(400).json({ success: false, message: "Enter a domain." });
        try {
            const result = await fn(domain);
            logUse(toolName, result.domain);
            res.json({ success: true, result });
        } catch (err) {
            const known = ["INVALID_DOMAIN", "NO_TLS", "UNREACHABLE"].includes(err.code);
            if (!known) console.error(`❌ ${toolName} failed:`, domain, err.message);
            res.status(known ? 400 : 500).json({
                success: false,
                message: known ? err.message : "That check could not be completed. Please try again.",
            });
        }
    };
}

// ── Password Exposure Check ──────────────────────────────────────────────
//
// The route accepts a FIVE CHARACTER HASH PREFIX and nothing else. The
// password is hashed in the browser and never leaves it. If this endpoint is
// ever changed to accept a password, the promise printed on the page becomes
// untrue — so it validates the shape strictly and refuses anything longer.
router.get("/password/:prefix", async (req, res) => {
    if (!guard(req, res)) return;
    const prefix = String(req.params.prefix || "");
    if (!/^[0-9A-Fa-f]{5}$/.test(prefix)) {
        return res.status(400).json({
            success: false,
            message: "This endpoint takes a five-character hash prefix, never a password.",
        });
    }
    try {
        const out = await T.passwordPrefix(prefix);
        logUse("password_exposure", null);
        res.json({ success: true, result: out });
    } catch (err) {
        res.status(err.code === "UPSTREAM" ? 503 : 400).json({ success: false, message: err.message });
    }
});

router.post("/email-spoofing", run("email_spoofing", T.emailSpoofing));
router.post("/ssl", run("ssl_test", T.sslTest));
router.post("/headers", run("security_headers", T.securityHeaders));
router.post("/lookalike", run("lookalike_domain", T.lookalikeDomains));

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────
//  Payment_server — checkout, payment verification, fulfilment, delivery.
//
//  ⚠️  THE ONE RULE: THERE IS NO POINT HERE WHERE MONEY CAN BE TAKEN AND
//  NOTHING DELIVERED.
//
//  dShield v6.3 shipped this exact chain broken. The webhook marked an order
//  paid, wrote an audit row, and ended at a TODO. enqueueScan() existed with
//  no callers. The report queue had a producer and no consumer. 823 tests
//  passed, because every unit worked perfectly alone and nothing tested the
//  sequence. A customer could pay $499 and receive nothing, and it went
//  unnoticed for months.
//
//  So fulfilOrder() below is the whole chain in one function — scan, report,
//  token, email — and anything that throws inside it lands the order as
//  `failed` with a reason and an internal alert. An order is never left at
//  `running`, and silence is never an outcome.
//
//    POST /api/payments/checkout      create the order, before any money
//    POST /api/payments/verify        browser callback, fast feedback only
//    POST /api/payments/webhook       Razorpay's webhook — THE AUTHORITY
//    GET  /api/payments/order/:ref    status for the success page to poll
//    GET  /api/reports/:token         the paid report itself
// ─────────────────────────────────────────────────────────────────────────

const express = require("express");
const crypto = require("crypto");
const https = require("https");
const getDBConnection = require("../../config/db");
const { runScan, normaliseDomain } = require("../utils/scan_engine");
const { buildReport } = require("../utils/report_builder");
const { getPlan, ASSESSMENT_TIERS, paymentsConfigured } = require("../data/plans");
const { queueMail } = require("../utils/mail");

const db = getDBConnection(process.env.DB_NAME || "dshield");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => (v === undefined || v === null) ? null : String(v).trim().slice(0, max) || null;

const KEY_ID = () => String(process.env.RAZORPAY_KEY_ID || "").trim();
const KEY_SECRET = () => String(process.env.RAZORPAY_KEY_SECRET || "").trim();
const WEBHOOK_SECRET = () => String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
const TTL_DAYS = () => Number(process.env.REPORT_LINK_TTL_DAYS || 30);

/* The Terms version a customer accepted. Stored on the order so that if the
   Terms change, we still know which text they agreed to. */
const TERMS_VERSION = 1;

/** Razorpay's REST API over plain https — no SDK, no new dependency. */
function razorpay(path, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const auth = Buffer.from(`${KEY_ID()}:${KEY_SECRET()}`).toString("base64");
        const req = https.request({
            hostname: "api.razorpay.com",
            path,
            method: body ? "POST" : "GET",
            timeout: 15000,
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json",
                ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            },
        }, (res) => {
            let out = "";
            res.on("data", (c) => { out += c; });
            res.on("end", () => {
                let parsed;
                try { parsed = JSON.parse(out); } catch (e) { return reject(new Error(`Razorpay returned unreadable JSON (HTTP ${res.statusCode})`)); }
                if (res.statusCode >= 400) {
                    return reject(new Error(parsed?.error?.description || `Razorpay HTTP ${res.statusCode}`));
                }
                resolve(parsed);
            });
        });
        req.on("timeout", () => { req.destroy(); reject(new Error("Razorpay request timed out")); });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

/** Constant-time comparison — a signature check that leaks timing is not one. */
function safeEqual(a, b) {
    const x = Buffer.from(String(a) || "", "utf8");
    const y = Buffer.from(String(b) || "", "utf8");
    if (x.length !== y.length) return false;
    return crypto.timingSafeEqual(x, y);
}

const query = (sql, params = []) => new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

/** Tell a human. A paid order that could not be fulfilled must not be quiet. */
function alertInternal(subject, payload) {
    const to = String(process.env.ENQUIRY_ALERT_TO || "").trim();
    if (!to) return console.error("⚠️  ENQUIRY_ALERT_TO is not set — nobody will be told:", subject);
    queueMail(db, {
        to, cc: process.env.ENQUIRY_ALERT_CC || "",
        template: "fulfilment_failed", category: "internal",
        subject, payload,
    }, (err) => { if (err) console.error("⚠️  Could not queue the internal alert:", err.message); });
}

/* ═════════════════════════════════════════════════════════════════════════
   fulfilOrder — the chain.

   IDEMPOTENT BY DATABASE GUARANTEE, not by a flag in memory. Step 1 claims
   the order with a conditional UPDATE and returns immediately if it affected
   no rows, so a webhook arriving twice, or a webhook racing the browser
   callback, produces one scan, one report and one email.
   ═════════════════════════════════════════════════════════════════════════ */
async function fulfilOrder(orderRef) {
    // 1 · Claim it. Whoever gets the row does the work; everyone else leaves.
    const claim = await query(
        "UPDATE orders SET fulfilment_status='running' WHERE order_ref=? AND status='paid' AND fulfilment_status='none'",
        [orderRef]);
    if (!claim.affectedRows) return { claimed: false };

    const rows = await query("SELECT * FROM orders WHERE order_ref=? LIMIT 1", [orderRef]);
    const order = rows[0];

    const failOrder = async (reason, alertSubject) => {
        await query("UPDATE orders SET fulfilment_status='failed', fulfilment_error=? WHERE order_ref=?",
            [String(reason).slice(0, 500), orderRef]);
        console.error(`❌ Fulfilment failed for ${orderRef}: ${reason}`);
        alertInternal(alertSubject || `Fulfilment failed — ${orderRef}`, {
            orderRef, tier: order.tier, domain: order.domain, email: order.email,
            amountInr: order.amount_paise / 100, error: String(reason).slice(0, 300),
        });
        return { claimed: true, ok: false, reason };
    };

    try {
        /* 2 · What arrived must match what we asked for. A mismatch is either
           a bug or tampering, and both need a person rather than a report. */
        if (Number(order.amount_paid_paise) !== Number(order.amount_paise)) {
            return await failOrder(
                `Amount mismatch: asked ${order.amount_paise} paise, received ${order.amount_paid_paise}`,
                `⚠️ Amount mismatch on a paid order — ${orderRef}`);
        }

        // 3 · The scan they paid for, at the tier they paid for.
        const scan = await runScan(order.domain, { tier: order.tier });

        /* 4 · An inconclusive scan does NOT fail the order silently. They have
           paid. We tell them plainly that we could not complete it and that a
           person will be in touch — a refund is a human decision, not an
           automatic one, and silence is the single unacceptable outcome. */
        if (scan.status === "inconclusive") {
            await query("UPDATE orders SET fulfilment_status='failed', fulfilment_error=?, scan_id=? WHERE order_ref=?",
                ["Scan was inconclusive — too few checks completed to publish a report", null, orderRef]);
            alertInternal(`⚠️ Paid scan inconclusive — ${orderRef}`, {
                orderRef, tier: order.tier, domain: order.domain, email: order.email,
                amountInr: order.amount_paise / 100,
                error: `Only ${scan.checksCompleted} of ${scan.checksRun} checks completed. The customer has paid and needs a person.`,
            });
            queueMail(db, {
                to: order.email, template: "fulfilment_delayed", category: "transactional",
                subject: `We could not complete your dShield report for ${order.domain}`,
                payload: { orderRef, domain: order.domain, tier: order.tier },
            }, (e) => { if (e) console.error("⚠️  Could not queue the delay notice:", e.message); });
            return { claimed: true, ok: false, reason: "inconclusive" };
        }

        // 5 · Build the report and store it as built.
        const report = buildReport(scan, order.tier);

        // 6 · The signed link.
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + TTL_DAYS() * 86400000);

        await query(
            `UPDATE orders SET scan_id=?, report_token=?, report_json=?, report_expires_at=? WHERE order_ref=?`,
            [scan.scanId || null, token, JSON.stringify(report), expires, orderRef]);

        // 7 · The email. Transactional: they asked for this by paying for it.
        await new Promise((resolve) => queueMail(db, {
            to: order.email, template: "paid_report", category: "transactional",
            subject: `Your dShield ${order.tier} report for ${order.domain}`,
            payload: {
                orderRef, domain: order.domain, tier: order.tier,
                grade: report.grade, score: report.score, counts: report.counts,
                totalIssues: report.totalIssues, passedCount: report.passedCount,
                reportToken: token,
                expiresOn: expires.toISOString().slice(0, 10),
            },
        }, (err) => { if (err) console.error("⚠️  Could not queue the report email:", err.message); resolve(); }));

        // 8 · Delivered.
        await query("UPDATE orders SET fulfilment_status='delivered', delivered_at=NOW() WHERE order_ref=?", [orderRef]);
        console.log(`✅ Delivered ${order.tier} report for ${order.domain} (${orderRef})`);
        return { claimed: true, ok: true, token };
    } catch (err) {
        // Never leave an order stuck at `running`.
        return await failOrder(err.message);
    }
}

/* ═════════════════════════════════════════════════════════════════════════
   Routes
   ═════════════════════════════════════════════════════════════════════════ */

const router = express.Router();

// ── POST /api/payments/checkout ──────────────────────────────────────────
router.post("/checkout", async (req, res) => {
    if (!paymentsConfigured()) {
        return res.status(503).json({ success: false, message: "Payments are not available yet." });
    }

    const tier = clean(req.body?.tier, 30);
    const plan = getPlan(tier);
    if (!plan || !plan.available) {
        return res.status(400).json({ success: false, message: "That is not something you can buy." });
    }

    // Explicit acceptance, recorded, BEFORE money moves.
    if (req.body?.termsAccepted !== true) {
        return res.status(400).json({ success: false, message: "Please accept the Terms of Service and Privacy Notice to continue." });
    }

    const email = clean(req.body?.email, 190);
    if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid email address — this is where the report is sent." });
    }

    /* An assessment tier with no domain is refused HERE, before any money
       moves. v6.3 discovered this after payment, which left a paid order
       with nothing to scan. */
    let domain = null;
    if (ASSESSMENT_TIERS.has(tier)) {
        const parsed = normaliseDomain(req.body?.domain);
        if (!parsed.ok) {
            return res.status(400).json({ success: false, message: parsed.message });
        }
        domain = parsed.domain;
    }

    const orderRef = crypto.randomUUID();

    try {
        // Our record first, so a Razorpay order can never exist without one.
        await query(
            `INSERT INTO orders (order_ref, email, name, company, domain, tier, amount_paise, currency, terms_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?)`,
            [orderRef, email.toLowerCase(), clean(req.body?.name, 120), clean(req.body?.company, 160),
             domain, tier, plan.amountPaise, TERMS_VERSION]);

        const rzp = await razorpay("/v1/orders", {
            amount: plan.amountPaise,
            currency: "INR",
            receipt: orderRef,
            notes: { order_ref: orderRef, tier, domain: domain || "" },
        });

        await query("UPDATE orders SET razorpay_order_id=? WHERE order_ref=?", [rzp.id, orderRef]);

        // The key ID is public and belongs in the browser. THE SECRET NEVER
        // LEAVES THIS PROCESS.
        res.json({
            success: true,
            order_ref: orderRef,
            razorpay_order_id: rzp.id,
            amount: plan.amountPaise,
            currency: "INR",
            key_id: KEY_ID(),
            tier, domain,
            planName: plan.name,
        });
    } catch (err) {
        console.error("❌ Checkout failed:", err.message);
        await query("UPDATE orders SET status='failed', fulfilment_error=? WHERE order_ref=?",
            [String(err.message).slice(0, 500), orderRef]).catch(() => {});
        res.status(502).json({ success: false, message: "We could not start the payment. Nothing has been charged. Please try again." });
    }
});

// ── POST /api/payments/verify ────────────────────────────────────────────
//
// The browser callback. Used ONLY to show the customer a result quickly —
// the webhook is the authority. Anyone can post to this endpoint, so the
// signature is checked before anything happens.
router.post("/verify", async (req, res) => {
    const orderId = clean(req.body?.razorpay_order_id, 60);
    const paymentId = clean(req.body?.razorpay_payment_id, 60);
    const signature = clean(req.body?.razorpay_signature, 200);

    if (!orderId || !paymentId || !signature) {
        return res.status(400).json({ success: false, message: "Incomplete payment confirmation." });
    }

    const expected = crypto.createHmac("sha256", KEY_SECRET()).update(`${orderId}|${paymentId}`).digest("hex");
    if (!safeEqual(expected, signature)) {
        console.error("❌ Browser callback signature did not verify for", orderId);
        return res.status(400).json({ success: false, message: "That payment could not be verified." });
    }

    try {
        const paid = await markPaid(orderId, paymentId, null);
        if (paid.orderRef) await fulfilOrder(paid.orderRef);
        const rows = await query("SELECT order_ref, status, fulfilment_status FROM orders WHERE razorpay_order_id=? LIMIT 1", [orderId]);
        const o = rows[0] || {};
        res.json({ success: true, order_ref: o.order_ref, status: o.status, fulfilment: o.fulfilment_status });
    } catch (err) {
        console.error("❌ Verify failed:", err.message);
        res.status(500).json({ success: false, message: "We could not confirm that payment. Our team has been alerted." });
    }
});

/**
 * Record a payment against an order.
 *
 * `payment_id` is UNIQUE, so a second call for the same payment updates
 * nothing and the caller sees affectedRows 0 — the point at which duplicate
 * fulfilment becomes impossible rather than merely unlikely.
 */
async function markPaid(razorpayOrderId, paymentId, amountPaidPaise) {
    const rows = await query("SELECT order_ref, amount_paise, status FROM orders WHERE razorpay_order_id=? LIMIT 1", [razorpayOrderId]);
    if (!rows.length) return { orderRef: null };
    const order = rows[0];

    // Fall back to what we asked for only when the caller could not tell us.
    const amount = amountPaidPaise === null || amountPaidPaise === undefined
        ? order.amount_paise : amountPaidPaise;

    try {
        await query(
            `UPDATE orders SET status='paid', payment_id=?, amount_paid_paise=?, paid_at=COALESCE(paid_at, NOW())
             WHERE razorpay_order_id=? AND status='pending'`,
            [paymentId, amount, razorpayOrderId]);
    } catch (err) {
        // Duplicate payment_id — this payment is already recorded. Not an error.
        if (err.code !== "ER_DUP_ENTRY") throw err;
    }
    return { orderRef: order.order_ref };
}

// ── POST /api/payments/webhook ───────────────────────────────────────────
//
// THE AUTHORITY. Mounted with express.raw in server.js — see the note there.
router.post("/webhook", async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.get("x-razorpay-signature") || "";
    const secret = WEBHOOK_SECRET();

    let valid = false;
    if (secret) {
        const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
        valid = safeEqual(expected, signature);
    } else {
        console.error("⚠️  RAZORPAY_WEBHOOK_SECRET is not set — webhook signatures cannot be verified.");
    }

    let body = {};
    try { body = JSON.parse(raw.toString("utf8")); } catch (e) { /* logged below as unparseable */ }

    const payment = body?.payload?.payment?.entity || {};

    /* Log FIRST, valid or not. When a customer says they paid and got
       nothing, this table is the only thing that can settle it — and an
       invalid signature is exactly the row worth keeping. */
    await query(
        "INSERT INTO payment_events (event_type, razorpay_order_id, payment_id, signature_valid, raw_body) VALUES (?, ?, ?, ?, ?)",
        [clean(body.event, 60), clean(payment.order_id, 60), clean(payment.id, 60), valid ? 1 : 0,
         raw.toString("utf8").slice(0, 65000)]
    ).catch((e) => console.error("⚠️  Could not record the payment event:", e.sqlMessage || e.message));

    if (!valid) {
        // 200 anyway: the event is recorded and can be replayed by hand. A
        // non-200 makes Razorpay retry, and retrying is not what fixes a bad
        // signature.
        return res.status(200).json({ received: true, verified: false });
    }

    try {
        if (body.event === "payment.captured" && payment.order_id) {
            const paid = await markPaid(payment.order_id, payment.id, Number(payment.amount));
            if (paid.orderRef) await fulfilOrder(paid.orderRef);
        }
    } catch (err) {
        console.error("❌ Webhook processing failed:", err.message);
        alertInternal("⚠️ Webhook processing failed", { orderRef: "(unknown)", error: err.message });
    }

    /* ALWAYS 200 once logged. A non-200 makes Razorpay retry, and retrying a
       payment that already succeeded is worse than a missed event we can
       replay from payment_events. */
    res.status(200).json({ received: true, verified: true });
});

// ── GET /api/payments/order/:ref ─────────────────────────────────────────
// What the success page polls. No payment details.
router.get("/order/:ref", async (req, res) => {
    const ref = String(req.params.ref || "");
    if (!/^[0-9a-f-]{36}$/i.test(ref)) {
        return res.status(400).json({ success: false, message: "Invalid order reference." });
    }
    try {
        const rows = await query(
            "SELECT order_ref, tier, domain, status, fulfilment_status, fulfilment_error, report_token, report_expires_at, delivered_at FROM orders WHERE order_ref=? LIMIT 1",
            [ref]);
        if (!rows.length) return res.status(404).json({ success: false, message: "We could not find that order." });
        const o = rows[0];
        res.json({
            success: true,
            orderRef: o.order_ref,
            tier: o.tier,
            domain: o.domain,
            status: o.status,
            fulfilment: o.fulfilment_status,
            // The customer is told THAT it failed, never the internal detail.
            failed: o.fulfilment_status === "failed",
            reportUrl: o.report_token ? `/report/${o.report_token}` : null,
            expiresAt: o.report_expires_at,
            deliveredAt: o.delivered_at,
        });
    } catch (err) {
        console.error("❌ Order lookup failed:", err.message);
        res.status(500).json({ success: false, message: "We could not read that order." });
    }
});

/* ── GET /api/reports/:token ──────────────────────────────────────────────
   Mounted separately at /api/reports in server.js. */
const reportsRouter = express.Router();

reportsRouter.get("/:token", async (req, res) => {
    const token = String(req.params.token || "");
    if (!/^[0-9a-f]{64}$/i.test(token)) {
        return res.status(404).json({ success: false, message: "That report link is not valid." });
    }
    try {
        const rows = await query(
            "SELECT order_ref, tier, domain, report_json, report_expires_at, delivered_at FROM orders WHERE report_token=? LIMIT 1",
            [token]);
        if (!rows.length || !rows[0].report_json) {
            return res.status(404).json({ success: false, message: "That report link is not valid." });
        }
        const o = rows[0];

        /* An expired link is a PAYING CUSTOMER, not an intruder. Say what
           happened and how to get a new one, rather than a bare 404. */
        if (o.report_expires_at && new Date(o.report_expires_at) < new Date()) {
            return res.status(410).json({
                success: false, expired: true,
                message: "This report link has expired. Your report still exists — write to us and we will send you a fresh link.",
                domain: o.domain, expiredOn: o.report_expires_at,
            });
        }

        let report;
        try { report = JSON.parse(o.report_json); }
        catch (e) { return res.status(500).json({ success: false, message: "That report could not be read." }); }

        res.json({ success: true, report, deliveredAt: o.delivered_at, expiresAt: o.report_expires_at });
    } catch (err) {
        console.error("❌ Report lookup failed:", err.message);
        res.status(500).json({ success: false, message: "We could not open that report." });
    }
});

module.exports = { router, reportsRouter, fulfilOrder, markPaid, TERMS_VERSION };

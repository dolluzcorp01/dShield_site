// ─────────────────────────────────────────────────────────────────────────
//  mail — queueing and the single point that talks to SendGrid.
//
//  Nothing outside the worker calls sendNow(). Request handlers call
//  queueMail() and return; the worker sends afterwards. See the header of
//  db/schema-mail.sql for why.
// ─────────────────────────────────────────────────────────────────────────

const sgMail = require("@sendgrid/mail");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const FROM = process.env.SENDGRID_FROM || "noreply@dolluzcorp.com";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "dShield";

/**
 * Is a usable API key configured?
 *
 * A blank value, or a leftover placeholder from .env.example, both count as
 * "not configured" — a key of "CHANGE_ME" would otherwise produce a 401 on
 * every row and burn all five attempts before anybody noticed.
 */
function isConfigured() {
    const k = String(process.env.SENDGRID_API_KEY || "").trim();
    if (!k) return false;
    if (/^(change_me|your_key|placeholder|xxx+)$/i.test(k)) return false;
    return k.startsWith("SG.");
}

let keySet = false;
function ensureKey() {
    if (!keySet && isConfigured()) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY.trim());
        keySet = true;
    }
}

/**
 * Write one message to the outbox.
 *
 * Returns an error through the callback rather than throwing: every caller is
 * inside a request handler that must still answer the visitor even if this
 * fails. Nothing here talks to SendGrid.
 *
 * callback(err, insertId)
 */
function queueMail(db, { to, cc, template, category, subject, payload }, callback = () => {}) {
    const address = String(to || "").trim().toLowerCase();

    if (!EMAIL_RE.test(address)) return callback(new Error(`Invalid recipient: ${to}`));

    /* CC accepts an array or a comma-separated string. Invalid entries are
       dropped rather than failing the whole message: a typo in one CC address
       must not cost us the alert itself, which is the part somebody is
       waiting on. Anything dropped is logged so it can be fixed. */
    const ccList = (Array.isArray(cc) ? cc : String(cc || "").split(","))
        .map((a) => String(a).trim().toLowerCase())
        .filter(Boolean);
    const ccValid = ccList.filter((a) => EMAIL_RE.test(a) && a !== address);
    const ccBad = ccList.filter((a) => !EMAIL_RE.test(a));
    if (ccBad.length) console.error("⚠️  Ignoring invalid CC address(es):", ccBad.join(", "));
    const ccStored = ccValid.join(",").slice(0, 500) || null;
    if (!template) return callback(new Error("queueMail needs a template"));
    if (!["transactional", "marketing", "internal"].includes(category)) {
        return callback(new Error(`Invalid category: ${category}`));
    }
    if (!subject) return callback(new Error("queueMail needs a subject"));

    /* Strip CR/LF from the subject. The enquiry alert builds its subject
       from a name a stranger typed, and a newline in a mail header is the
       classic header-injection vector. The SendGrid API is JSON rather than
       raw SMTP so this is not exploitable today, but the cost of being
       careful here is one regex. */
    const cleanSubject = String(subject).replace(/[\r\n]+/g, " ").trim().slice(0, 255);

    db.query(
        "INSERT INTO mail_outbox (to_email, cc, template, category, subject, payload) VALUES (?, ?, ?, ?, ?, ?)",
        [address, ccStored, template, category, cleanSubject, JSON.stringify(payload || {})],
        (err, result) => {
            if (err) return callback(err);
            callback(null, result && result.insertId);
        }
    );
}

/**
 * Hand one rendered message to SendGrid.
 *
 * Both parts are always sent. Some clients show the text version, and a
 * text part that reads as gibberish looks broken to the person reading it.
 */
async function sendNow({ to, cc, subject, html, text }) {
    if (!isConfigured()) throw Object.assign(new Error("SendGrid is not configured"), { code: "NO_KEY" });
    ensureKey();

    const ccList = (Array.isArray(cc) ? cc : String(cc || "").split(","))
        .map((a) => String(a).trim())
        .filter((a) => a && a.toLowerCase() !== String(to).toLowerCase());

    const msg = {
        to,
        from: { email: FROM, name: FROM_NAME },
        subject,
        text,
        html,
    };
    // Only set cc when there is one — SendGrid rejects an empty array.
    if (ccList.length) msg.cc = ccList;

    const [res] = await sgMail.send(msg);
    return { statusCode: res && res.statusCode };
}

module.exports = { queueMail, sendNow, isConfigured, FROM, FROM_NAME };

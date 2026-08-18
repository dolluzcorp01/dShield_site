// ─────────────────────────────────────────────────────────────────────────
//  mail-templates — the four emails this site sends.
//
//  No template engine. Four emails in template literals do not justify a
//  dependency to audit and keep current.
//
//  Tables and inline styles only. Email clients are not browsers: they strip
//  <style> blocks, ignore flexbox and grid, and the design tokens this site
//  uses do not exist there.
//
//  Every template returns { subject, html, text }. The text part is written
//  to read properly on its own — some clients show it in preference to the
//  HTML, and a text version that reads as stripped markup looks broken.
//
//  Voice: plain and direct, matching /trust and /how-it-works. No greetings
//  like "Hi there", no exclamation marks, no promises about timing we have
//  not actually agreed.
// ─────────────────────────────────────────────────────────────────────────

const SITE_URL =
    (process.env.REACT_APP_SITE_URL || "https://dshield.dolluzcorp.com").replace(/\/+$/, "");

/** Escape anything that reaches HTML. The enquiry alert carries a message a
 *  stranger typed, and an unescaped angle bracket there breaks the layout at
 *  best and injects markup into our own inbox at worst. */
const esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const INK = "#08090C";
const GOLD = "#F5A524";
const TEXT = "#1a1a1a";
const MUTED = "#5b5f66";
const LINE = "#e3e1dd";

/* ── shared chrome ───────────────────────────────────────────────────── */

function shell(innerHtml, footerHtml) {
    return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f3f1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">
    <tr><td style="background:${INK};padding:18px 26px;">
      <span style="color:${GOLD};font-size:19px;font-weight:bold;letter-spacing:.2px;">dShield</span>
      <span style="color:#8a8d94;font-size:11px;letter-spacing:1px;"> &nbsp;BY DOLLUZ CORP</span>
    </td></tr>
    <tr><td style="padding:28px 26px;color:${TEXT};font-size:15px;line-height:1.62;">
${innerHtml}
    </td></tr>
    <tr><td style="border-top:1px solid ${LINE};padding:18px 26px;color:${MUTED};font-size:12px;line-height:1.6;">
${footerHtml}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/**
 * The footer, which is where the category actually matters.
 *
 * Marketing MUST carry a working unsubscribe link. Transactional and
 * internal instead explain why the person is holding this email, which is
 * the honest answer to "why am I getting this" when there is nothing to
 * unsubscribe from.
 */
function footer(category, payload = {}) {
    const who = `Dolluz Corp, Chennai, India &middot; <a href="${SITE_URL}" style="color:${MUTED};">dshield.dolluzcorp.com</a>`;

    if (category === "marketing") {
        const token = payload.unsubscribeToken;
        const link = token ? `${SITE_URL}/preferences/${token}` : `${SITE_URL}/contact`;
        return `You are receiving this because you asked us to tell you when paid reports open.<br />
<a href="${esc(link)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe from all email</a><br /><br />${who}`;
    }
    if (category === "internal") {
        return `Internal notification from the dShield site.<br /><br />${who}`;
    }
    return `You are receiving this because you asked for it on dshield.dolluzcorp.com. It is not marketing, and we have not added you to any list.<br /><br />${who}`;
}

function footerText(category, payload = {}) {
    const who = "Dolluz Corp, Chennai, India · dshield.dolluzcorp.com";
    if (category === "marketing") {
        const token = payload.unsubscribeToken;
        const link = token ? `${SITE_URL}/preferences/${token}` : `${SITE_URL}/contact`;
        return `You are receiving this because you asked us to tell you when paid reports open.\nUnsubscribe from all email: ${link}\n\n${who}`;
    }
    if (category === "internal") return `Internal notification from the dShield site.\n\n${who}`;
    return `You are receiving this because you asked for it on dshield.dolluzcorp.com. It is not marketing, and we have not added you to any list.\n\n${who}`;
}

const btn = (href, label) =>
    `<a href="${esc(href)}" style="display:inline-block;background:${GOLD};color:${INK};font-weight:bold;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:6px;">${esc(label)}</a>`;

/* ── 1 · notify_confirm — MARKETING ──────────────────────────────────── */

const notify_confirm = {
    subject: () => "You are on the list — dShield",
    html: (p = {}) => shell(`
<p style="margin:0 0 16px;">You asked us to write when dShield paid reports open. We will, once they do.</p>
<p style="margin:0 0 16px;">We will not write to you about anything else. No newsletter, no product updates, and we do not pass your address to anyone.</p>
<p style="margin:0 0 20px;">In the meantime the free scan and the five free tools are available now, with no account and no card.</p>
<p style="margin:0 0 8px;">${btn(SITE_URL, "Run a free scan")}</p>
<p style="margin:16px 0 0;font-size:14px;color:${MUTED};">Or go straight to the tools: <a href="${SITE_URL}/tools" style="color:${MUTED};">email spoofing, SSL, security headers, lookalike domains and password exposure</a>.</p>`,
        footer("marketing", p)),
    text: (p = {}) => `You are on the list — dShield

You asked us to write when dShield paid reports open. We will, once they do.

We will not write to you about anything else. No newsletter, no product
updates, and we do not pass your address to anyone.

In the meantime the free scan and the five free tools are available now,
with no account and no card.

Run a free scan: ${SITE_URL}
The five free tools: ${SITE_URL}/tools

--
${footerText("marketing", p)}`,
};

/* ── 2 · scan_result — TRANSACTIONAL ─────────────────────────────────── */
//
// The paywall applies here exactly as it does on the page: the grade, the
// score and the counts, and NOTHING about what the individual findings are.
// An email is more likely to be forwarded than a page is, so if anything the
// rule matters more here.

const scan_result = {
    subject: (p = {}) => `Your dShield scan of ${p.domain || "your domain"}`,
    html: (p = {}) => {
        const c = p.counts || {};
        const row = (label, value, colour) =>
            `<tr><td style="padding:5px 0;color:${MUTED};font-size:14px;">${esc(label)}</td>
             <td style="padding:5px 0;text-align:right;font-weight:bold;color:${colour || TEXT};">${esc(value)}</td></tr>`;
        return shell(`
<p style="margin:0 0 18px;">Here is the result of your free scan of <strong>${esc(p.domain)}</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;">
  <tr><td style="padding:18px 20px;">
    <div style="font-size:44px;line-height:1;font-weight:bold;color:${GOLD};">${esc(p.grade || "—")}</div>
    <div style="color:${MUTED};font-size:13px;margin-top:4px;">${esc(p.score)} out of 100</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid ${LINE};">
      ${row("Critical", c.critical ?? 0, "#c0392b")}
      ${row("High", c.high ?? 0, "#d35400")}
      ${row("Medium", c.medium ?? 0, "#b7950b")}
      ${row("Low", c.low ?? 0, TEXT)}
      ${row("Checks passed", p.passedCount ?? 0, "#1e8449")}
    </table>
  </td></tr>
</table>
<p style="margin:20px 0 8px;">${btn(`${SITE_URL}/result/${p.scanId}`, "Open the full result")}</p>
<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${LINE};font-size:14px;color:${MUTED};">
A scan like this measures five of the twenty-three risk domains we assess. The other eighteen — whether your backups actually restore, whether a junior would challenge a payment request from the CEO — cannot be seen from outside by anyone, including us.
<br /><br /><a href="${SITE_URL}/coverage" style="color:${MUTED};text-decoration:underline;">See what the other eighteen cover</a>
</p>`, footer("transactional", p));
    },
    text: (p = {}) => {
        const c = p.counts || {};
        return `Your dShield scan of ${p.domain}

Grade ${p.grade}  —  ${p.score} out of 100

  Critical        ${c.critical ?? 0}
  High            ${c.high ?? 0}
  Medium          ${c.medium ?? 0}
  Low             ${c.low ?? 0}
  Checks passed   ${p.passedCount ?? 0}

Open the full result: ${SITE_URL}/result/${p.scanId}

A scan like this measures five of the twenty-three risk domains we assess.
The other eighteen — whether your backups actually restore, whether a junior
would challenge a payment request from the CEO — cannot be seen from outside
by anyone, including us.

See what the other eighteen cover: ${SITE_URL}/coverage

--
${footerText("transactional", p)}`;
    },
};

/* ── 3 · enquiry_ack — TRANSACTIONAL ─────────────────────────────────── */

const enquiry_ack = {
    subject: () => "We have your message — Dolluz Corp",
    html: (p = {}) => shell(`
<p style="margin:0 0 16px;">Thank you for writing to us. Your message has reached us and a person will reply to it.</p>
${p.topicLabel ? `<p style="margin:0 0 16px;">You asked about <strong>${esc(p.topicLabel)}</strong>.</p>` : ""}
<p style="margin:0 0 16px;">We have not set an automatic reply time, because we would rather answer properly than quickly.</p>
<p style="margin:0;color:${MUTED};font-size:14px;">While you wait, the free scan and the five free tools are available without an account.</p>`,
        footer("transactional", p)),
    text: (p = {}) => `We have your message — Dolluz Corp

Thank you for writing to us. Your message has reached us and a person will
reply to it.
${p.topicLabel ? `\nYou asked about ${p.topicLabel}.\n` : ""}
We have not set an automatic reply time, because we would rather answer
properly than quickly.

While you wait, the free scan and the five free tools are available without
an account: ${SITE_URL}

--
${footerText("transactional", p)}`,
};

/* ── 4 · enquiry_alert — INTERNAL ────────────────────────────────────── */
//
// A working document for whoever picks this up, not a customer-facing email.
// Every submitted field, laid out plainly, so nobody has to open the database
// to know what was asked.

const FIELDS = [
    ["name", "Name"], ["email", "Email"], ["company", "Company"],
    ["phone", "Phone"], ["domain", "Domain"], ["topicLabel", "Topic"],
    ["tier", "Tier interest"], ["message", "Message"],
];

const enquiry_alert = {
    subject: (p = {}) => `Enquiry from ${p.name || p.email || "unknown"} — ${p.topicLabel || p.tier || "general"}`,
    html: (p = {}) => shell(`
<p style="margin:0 0 16px;font-size:16px;"><strong>New enquiry from the dShield site</strong></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
${FIELDS.map(([k, label]) => `  <tr>
    <td style="padding:7px 12px 7px 0;color:${MUTED};vertical-align:top;white-space:nowrap;">${label}</td>
    <td style="padding:7px 0;vertical-align:top;">${p[k] ? esc(p[k]).replace(/\n/g, "<br />") : `<span style="color:#a9adb4;">—</span>`}</td>
  </tr>`).join("\n")}
  <tr><td style="padding:7px 12px 7px 0;color:${MUTED};vertical-align:top;">Received</td>
      <td style="padding:7px 0;">${esc(p.receivedAt)}</td></tr>
</table>`, footer("internal", p)),
    text: (p = {}) => `New enquiry from the dShield site

${FIELDS.map(([k, label]) => `${(label + ":").padEnd(16)}${p[k] || "—"}`).join("\n")}
${"Received:".padEnd(16)}${p.receivedAt}

--
${footerText("internal", p)}`,
};

const TEMPLATES = { notify_confirm, scan_result, enquiry_ack, enquiry_alert };

/** Render one outbox row. Throws on an unknown template so the worker can
 *  record it as a failure rather than sending a blank email. */
function render(template, payload) {
    const t = TEMPLATES[template];
    if (!t) throw new Error(`Unknown template: ${template}`);
    return { subject: t.subject(payload), html: t.html(payload), text: t.text(payload) };
}

module.exports = { TEMPLATES, render, SITE_URL };

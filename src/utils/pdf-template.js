// ─────────────────────────────────────────────────────────────────────────
//  pdf-template — a complete, standalone HTML document for one report.
//
//  ⚠️  NO EXTERNAL REQUESTS. No web fonts, no CDN, no images fetched over
//  the network. A render that reaches the internet is a render that fails on
//  a locked-down server, and it fails intermittently, which is worse. System
//  font stacks only.
//
//  ⚠️  EVERY INTERPOLATED VALUE GOES THROUGH esc(). The report carries
//  domains, hostnames and evidence strings — all of them influenced by
//  whoever owns the scanned estate. Chrome renders this with --no-sandbox,
//  so a <script> tag reaching the template is not a cosmetic problem.
//
//  TIER GATING IS NOT DECIDED HERE. buildReport() has already removed what
//  the tier did not pay for, and this file renders whatever it was handed.
//  Two places deciding a paywall is how paywalls leak.
// ─────────────────────────────────────────────────────────────────────────

const esc = (v) => String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// THE PDF STAYS ON A LIGHT THEME. It is a fifteen-page document people
// print and put in a board pack; the arcade palette belongs on a screen and
// a near-black page is unprintable. Only the accent HUES follow the new
// brand — darkened until each one passes AA on white, because the arcade
// colours themselves do not: lime #C6FF3D is 1.3:1 on white and magenta
// #FF2E9A is 3.4:1. Measured ratios are in the comments.
const INK = "#0b0c10";
const GOLD = "#657300";     // dark lime, 5.24:1 on white — the brand accent,
const TEXT = "#15171a";     // darkened until print and photocopiers hold it
const MUTED = "#4a4f57";
const FAINT = "#7b8189";
const LINE = "#d8d5d0";

// Same hue family as the site, dark enough to read on paper.
const SEV_COLOUR = {
    critical: "#b3005e",    // 6.82:1  magenta
    high: "#8a5a00",        // 5.93:1  amber
    medium: "#0a6b7a",      // 6.18:1  cyan
    low: "#5a5170",         // 7.38:1  faint
};

const GRADE_WORD = { A: "Strong", B: "Good", C: "Mixed", D: "Weak", E: "Poor" };

/** A readable timestamp WITH its timezone — see the note on the cover. */
function stamp(iso) {
    const d = iso ? new Date(iso) : new Date();
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return `${date} at ${time} (${tz})`;
}

function coverageTable(map = []) {
    if (!map.length) return "";
    const rows = map.map((d) => `
      <tr>
        <td class="num">${esc(String(d.no).padStart(2, "0"))}</td>
        <td>${esc(d.name)}</td>
        <td class="${d.scanned ? "yes" : "no"}">${d.scanned ? "Measured" : "Not measured"}</td>
      </tr>`).join("");
    return `<table class="cov"><thead><tr><th>#</th><th>Risk domain</th><th>This report</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function findingBlock(f) {
    const sev = String(f.severity || "").toLowerCase();
    const steps = f.remediation && Array.isArray(f.remediation.steps)
        ? `<ol class="steps">${f.remediation.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : "";

    return `
<section class="finding">
  <div class="finding-head">
    <span class="sev" style="color:${SEV_COLOUR[sev] || TEXT};border-color:${SEV_COLOUR[sev] || TEXT}">${esc(f.severity)}</span>
    <h3>${esc(f.title)}</h3>
  </div>
  <div class="finding-id">${esc(f.checkId)}${f.weight ? ` &middot; weight ${esc(f.weight)}` : ""}</div>

  ${f.evidence ? `<div class="ev"><div class="lbl">What we saw</div><div class="ev-body">${esc(f.evidence)}</div></div>` : ""}
  ${f.finding ? `<p class="body">${esc(f.finding)}</p>` : ""}
  ${f.impact ? `<div class="blk"><div class="lbl">Why it matters</div><p>${esc(f.impact)}</p></div>` : ""}

  ${f.remediation ? `
  <div class="blk fix">
    <div class="lbl">How to fix it</div>
    <p class="sum">${esc(f.remediation.summary)}</p>
    ${steps}
    <p class="verify"><strong>How to confirm it is fixed:</strong> ${esc(f.remediation.verification)}</p>
    <p class="effort">About ${esc(f.effortHours)} hours &middot; ${esc(f.skill)}${f.effortNote ? ` — ${esc(f.effortNote)}` : ""}</p>
  </div>` : ""}
</section>`;
}

function roadmapBlock(roadmap = [], totalHours) {
    if (!roadmap.length) return "";
    const bands = roadmap.map((b) => `
  <div class="band">
    <div class="band-head"><h3>${esc(b.label)}</h3><span>${esc(b.count)} finding${b.count > 1 ? "s" : ""} &middot; ${esc(b.totalHours)}h</span></div>
    <p class="band-blurb">${esc(b.blurb)}</p>
    <ol class="band-list">
      ${(b.items || []).map((i) => `<li><span class="sev-dot" style="background:${SEV_COLOUR[String(i.severity).toLowerCase()] || TEXT}"></span>${esc(i.title)} <span class="faint">— ${esc(i.effortHours)}h &middot; ${esc(i.skill)}</span></li>`).join("")}
    </ol>
    ${(b.notes || []).length ? `<ul class="band-notes">${b.notes.map((n) => `<li>${esc(n.note)}</li>`).join("")}</ul>` : ""}
  </div>`).join("");

    return `
<section class="sheet">
  <h2>What to do, in order</h2>
  <p class="lead">${esc(totalHours)} hours of hands-on work in total. Within each band the heaviest findings come first, and the cheapest of those first again.</p>
  ${bands}
</section>`;
}

/**
 * @param report  the object from buildReport() — already tier-filtered
 * @param opts    { orderRef, shaShort }
 */
function renderReportHtml(report = {}, opts = {}) {
    const r = report;
    const findings = r.findings || [];
    const inconclusive = r.inconclusive || [];
    const measured = (r.coverageMap || []).filter((d) => d.scanned).length;
    const total = (r.coverageMap || []).length;
    const tierName = { basic: "Basic", advanced: "Advanced", full_protection: "Full Protection" }[r.tier] || esc(r.tier);

    const domainScores = Object.entries(r.domainScores || {});

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>dShield — ${esc(r.domain)}</title>
<style>
  /* System stacks only. Nothing here is fetched. */
  * { box-sizing: border-box; }
  body {
    margin: 0; color: ${TEXT}; background: #fff;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.55;
  }
  h1, h2, h3 { color: ${INK}; margin: 0 0 8px; line-height: 1.25; }
  h2 { font-size: 15pt; margin-top: 0; padding-bottom: 6px; border-bottom: 2px solid ${GOLD}; }
  h3 { font-size: 11.5pt; }
  p { margin: 0 0 10px; }
  .faint { color: ${FAINT}; }
  .lead { color: ${MUTED}; margin-bottom: 14px; }

  /* Each major section starts a page. */
  .sheet { page-break-before: always; padding-top: 4mm; }

  /* ── cover ── */
  .cover { height: 247mm; display: flex; flex-direction: column; justify-content: space-between; }
  .cover-top { padding-top: 22mm; }
  .brand { font-size: 22pt; font-weight: 700; color: ${GOLD}; letter-spacing: -.3px; }
  .brand small { display: block; font-size: 8pt; letter-spacing: 2.4px; color: ${FAINT}; font-weight: 600; margin-top: 4px; }
  .doctype { margin-top: 26mm; font-size: 11pt; letter-spacing: 3px; text-transform: uppercase; color: ${MUTED}; }
  .subject { font-size: 27pt; font-weight: 700; margin: 6px 0 0; word-break: break-all; }
  .gradebox { display: flex; align-items: baseline; gap: 14px; margin-top: 16mm; }
  .gradebox .g { font-size: 62pt; font-weight: 700; color: ${GOLD}; line-height: 1; }
  .gradebox .w { font-size: 13pt; color: ${MUTED}; }
  .meta { border-top: 1px solid ${LINE}; padding-top: 10px; font-size: 9pt; color: ${MUTED}; }
  .meta div { margin-bottom: 3px; }

  /* ── tables ── */
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9.5pt; }
  th { text-align: left; border-bottom: 1.5px solid ${LINE}; padding: 6px 8px 6px 0; color: ${MUTED}; font-weight: 600; }
  td { padding: 5px 8px 5px 0; border-bottom: 1px solid #eeeae4; vertical-align: top; }
  .cov td { padding: 3.5px 8px 3.5px 0; }
  .cov .num { width: 26px; color: ${FAINT}; font-variant-numeric: tabular-nums; }
  .cov .yes { color: #2c6e49; white-space: nowrap; }
  .cov .no { color: ${FAINT}; white-space: nowrap; }
  .counts td:last-child, .counts th:last-child { text-align: right; }

  /* ── findings ── */
  .finding { page-break-inside: avoid; border: 1px solid ${LINE}; border-radius: 4px; padding: 12px 14px; margin-bottom: 12px; }
  .finding-head { display: flex; gap: 10px; align-items: baseline; }
  .finding-head h3 { margin: 0; }
  .sev { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .8px; border: 1px solid; border-radius: 20px; padding: 2px 8px; white-space: nowrap; }
  .finding-id { font-family: "Cascadia Mono", Consolas, monospace; font-size: 8pt; color: ${FAINT}; margin: 4px 0 10px; }
  .lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: ${FAINT}; margin-bottom: 4px; }
  .ev { background: #f7f5f2; border-left: 2px solid ${GOLD}; padding: 8px 10px; margin-bottom: 10px; }
  .ev-body { font-family: "Cascadia Mono", Consolas, monospace; font-size: 8.5pt; word-break: break-word; }
  .body { color: ${MUTED}; }
  .blk { margin-top: 10px; }
  .blk p { color: ${MUTED}; margin: 0; }
  .fix { border-top: 1px solid ${LINE}; padding-top: 10px; }
  .sum { color: ${TEXT} !important; font-weight: 600; margin-bottom: 8px !important; }
  .steps { margin: 0 0 10px; padding-left: 18px; }
  .steps li { color: ${MUTED}; margin-bottom: 5px; }
  .verify { margin: 0 0 6px !important; }
  .effort { font-size: 9pt; color: ${FAINT}; margin: 0 !important; }

  /* ── roadmap ── */
  .band { page-break-inside: avoid; border: 1px solid ${LINE}; border-radius: 4px; padding: 12px 14px; margin-bottom: 12px; }
  .band-head { display: flex; justify-content: space-between; align-items: baseline; }
  .band-head span { font-size: 9pt; color: ${FAINT}; }
  .band-blurb { color: ${MUTED}; font-size: 9.5pt; margin: 4px 0 8px; }
  .band-list { margin: 0; padding-left: 18px; }
  .band-list li { margin-bottom: 5px; }
  .sev-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; }
  .band-notes { margin: 8px 0 0; padding-left: 18px; color: ${FAINT}; font-size: 9pt; }

  .callout { border: 1.5px solid ${GOLD}; border-radius: 4px; padding: 12px 14px; margin: 0 0 16px; page-break-inside: avoid; }
  .callout h3 { margin-bottom: 6px; }
  .incon li { margin-bottom: 7px; color: ${MUTED}; }
</style></head>
<body>

<!-- ── COVER ─────────────────────────────────────────────────────────── -->
<div class="cover">
  <div class="cover-top">
    <div class="brand">dShield<small>BY DOLLUZ CORP</small></div>
    <div class="doctype">Security Assessment</div>
    <div class="subject">${esc(r.domain)}</div>
    <div class="gradebox">
      <span class="g">${esc(r.grade || "—")}</span>
      <span class="w">${esc(GRADE_WORD[r.grade] || "")}${r.score !== null && r.score !== undefined ? ` &middot; ${esc(r.score)} / 100` : ""}</span>
    </div>
    ${r.capped ? `<p class="faint" style="margin-top:10px">Grade capped at ${esc(r.grade)} because of ${esc(r.capReason)}.</p>` : ""}
  </div>
  <div class="meta">
    <div><strong>Report tier:</strong> ${esc(tierName)}</div>
    <div><strong>Assessed:</strong> ${esc(stamp(r.scannedAt))}</div>
    <div><strong>Order reference:</strong> ${esc(opts.orderRef || "—")}</div>
    <div><strong>Document fingerprint:</strong> ${esc(opts.shaShort || "computed on delivery")}</div>
  </div>
</div>

<!-- ── PAGE 1 · LIMITS, FIRST ────────────────────────────────────────── -->
<section class="sheet">
  <h2>What this report does and does not cover</h2>

  <div class="callout">
    <h3>This is a point-in-time view from outside your estate</h3>
    <p>Everything here was observable from the public internet on
    ${esc(stamp(r.scannedAt))}. It is not a guarantee that your systems are secure, and it
    does not describe anything behind a login, inside your network, or introduced after that
    moment. A report read months later describes the day it was made, not the day you are
    reading it.</p>
  </div>

  <h3>We measured ${esc(measured)} of ${esc(total)} risk domains</h3>
  <p class="lead">A scan of this kind reaches what your servers publish to anyone who asks.
  The remaining ${esc(total - measured)} domains — whether your backups actually restore, whether a
  junior would challenge a payment request from the CEO, whether staff feel able to admit a
  mistake — cannot be seen from outside by anyone, including us. They need an assessment with
  your participation.</p>

  <h3>${esc(r.checksCompleted)} of ${esc(r.checksRun)} checks completed</h3>
  ${inconclusive.length ? `
  <p class="lead">The following checks could not complete. They are excluded from the score
  <strong>on both sides</strong> rather than counted as passes — a number built on checks that never
  ran would tell you that you are safe when what actually happened is that we could not look.</p>
  <ul class="incon">
    ${inconclusive.map((i) => `<li><strong>${esc(i.title)}</strong> — ${esc(i.reason)}</li>`).join("")}
  </ul>` : `<p class="lead">Every check completed.</p>`}
</section>

<!-- ── SUMMARY ───────────────────────────────────────────────────────── -->
<section class="sheet">
  <h2>Summary</h2>

  <table class="counts">
    <thead><tr><th>Severity</th><th>Findings</th></tr></thead>
    <tbody>
      ${["critical", "high", "medium", "low"].map((s) => `<tr><td style="color:${SEV_COLOUR[s]}">${s[0].toUpperCase() + s.slice(1)}</td><td>${esc((r.counts || {})[s] ?? 0)}</td></tr>`).join("")}
      <tr><td>Checks passed</td><td>${esc(r.passedCount ?? 0)}</td></tr>
    </tbody>
  </table>

  ${domainScores.length ? `
  <h3>Score by risk domain</h3>
  <table>
    <thead><tr><th>Domain</th><th>Score</th><th>Findings</th></tr></thead>
    <tbody>${domainScores.map(([no, d]) => `<tr><td>${esc(d.name || no)}</td><td>${esc(d.score)}</td><td>${esc(d.findings)}</td></tr>`).join("")}</tbody>
  </table>` : ""}

</section>

<!-- Coverage gets its own sheet: 23 rows spilling onto a second page left
     most of it blank once Findings forced its own page break. -->
<section class="sheet">
  <h2>Coverage across all ${esc(total)} risk domains</h2>
  <p class="lead">A scan reaches the ${esc(measured)} marked measured. The rest need an assessment
  carried out with your people, and are listed here so the shape of what is missing is visible
  rather than implied.</p>
  ${coverageTable(r.coverageMap)}
</section>

${findings.length ? `
<section class="sheet">
  <h2>Findings</h2>
  <p class="lead">${esc(findings.length)} finding${findings.length > 1 ? "s" : ""}, heaviest first.</p>
  ${findings.map(findingBlock).join("")}
</section>` : ""}

${roadmapBlock(r.roadmap, r.effortTotalHours)}

</body></html>`;
}

module.exports = { renderReportHtml, esc };

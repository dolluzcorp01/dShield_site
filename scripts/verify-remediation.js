#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
//  verify-remediation — the library and the paywall.
//
//      node scripts/verify-remediation.js
//
//  No database, no network. The last three assertions are the paywall tests
//  and they are the point of this file: a paywall that is not tested is a
//  paywall that leaks, and it leaks quietly.
// ─────────────────────────────────────────────────────────────────────────

const { LIBRARY, getRemediation } = require("../src/utils/remediation");
const { buildReport } = require("../src/utils/report_builder");
const { ALL_CHECKS } = require("../src/utils/checks");

let failures = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); failures += 1; };
const pass = (m) => console.log(`  ✓ ${m}`);

const entries = LIBRARY.checks;
const implemented = entries.filter((e) => e.implemented);
const notBuilt = entries.filter((e) => !e.implemented);

console.log("\nRemediation library\n" + "─".repeat(62));

entries.length === 65 ? pass("65 entries load") : fail(`expected 65 entries, found ${entries.length}`);

const ids = entries.map((e) => e.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
dupes.length ? fail(`duplicate ids: ${[...new Set(dupes)].join(", ")}`) : pass("no duplicate ids");

const missing = ALL_CHECKS.filter((c) => !implemented.some((e) => e.id === c.id)).map((c) => c.id);
missing.length
    ? fail(`checks with no implemented entry: ${missing.join(", ")}`)
    : pass(`all ${ALL_CHECKS.length} check ids have an implemented entry`);

notBuilt.length === 7 ? pass("7 entries are marked not built") : fail(`expected 7 not-built entries, found ${notBuilt.length}`);
const noReason = notBuilt.filter((e) => !e.notBuiltReason).map((e) => e.id);
noReason.length
    ? fail(`not-built entries without a reason: ${noReason.join(", ")}`)
    : pass("every not-built entry carries a notBuiltReason");

/* These fields must not ship. `tier` used an abandoned pricing vocabulary;
   `detect` and `evidenceTemplate` describe HOW a check works and would hand
   an attacker the method behind every finding. */
const BANNED = ["tier", "detect", "evidenceTemplate", "severity", "weight", "domain", "domainName"];
const withBanned = entries.filter((e) => BANNED.some((k) => k in e));
withBanned.length
    ? withBanned.forEach((e) => fail(`${e.id} still carries ${BANNED.filter((k) => k in e).join(", ")}`))
    : pass(`no entry carries ${BANNED.join(", ")}`);

const badEffort = entries.filter((e) => typeof e.effortHours !== "number" || !(e.effortHours > 0));
badEffort.length
    ? badEffort.forEach((e) => fail(`${e.id} has effortHours = ${JSON.stringify(e.effortHours)}`))
    : pass("every effortHours is a positive number");

const incomplete = entries.filter((e) =>
    !e.finding || !e.impact || !e.remediation || !e.remediation.summary ||
    !Array.isArray(e.remediation.steps) || e.remediation.steps.length < 2 ||
    !e.remediation.verification);
incomplete.length
    ? incomplete.forEach((e) => fail(`${e.id} is missing finding/impact/summary/steps(2+)/verification`))
    : pass("every entry has finding, impact, summary, 2+ steps and a verification");

const admin = getRemediation("SURF-ADMIN-02");
const adminCheck = ALL_CHECKS.find((c) => c.id === "SURF-ADMIN-02");
adminCheck.severity === "high" && !("severity" in admin)
    ? pass("SURF-ADMIN-02 severity comes only from the check, and is high")
    : fail("SURF-ADMIN-02 severity is not solely the scanner's");

/* ── the paywall ─────────────────────────────────────────────────────── */

console.log("\nPaywall\n" + "─".repeat(62));

const TITLES = ALL_CHECKS.map((c) => c.title).filter(Boolean);

// A scan fixture: no network, and deterministic.
const failing = ALL_CHECKS.slice(0, 6).map((c) => ({
    checkId: c.id, domain: c.domain, severity: c.severity, title: c.title, why: c.why,
    passed: false, evidence: `evidence for ${c.id}`, detail: null,
}));
const passing = ALL_CHECKS.slice(6, 9).map((c) => ({
    checkId: c.id, domain: c.domain, severity: c.severity, title: c.title, why: c.why,
    passed: true, evidence: `evidence for ${c.id}`, detail: null,
}));

const baseScan = {
    domain: "example-fixture.com", scannedAt: new Date(0).toISOString(), status: "complete",
    grade: "B", score: 82, capped: false, capReason: null,
    counts: { critical: 1, high: 2, medium: 2, low: 1 },
    totalIssues: failing.length, passedCount: passing.length,
    checksRun: 58, checksCompleted: 55, coverageRatio: 0.95,
    domainScores: {}, coverageMap: [],
    inconclusive: [{ checkId: "BREACH-CREDS-52", title: "Employee credentials present in breach corpora", reason: "HIBP_API_KEY is not configured" }],
    issueSummary: failing.map((f) => ({ domain: f.domain, domainName: "x", severity: f.severity })),
};
const paidScan = { ...baseScan, findings: [...failing, ...passing] };

/* snapshot — no title of anything we FOUND.
   The titles of INCONCLUSIVE checks are deliberately exempt, and this is not
   a loophole. A free scan already names the checks that could not run, and
   /result already renders them, because "we could not look" stated plainly
   is the product's central promise rather than something to withhold. It
   discloses no finding: an inconclusive check has no result to sell.
   What must never appear is the title of something that FAILED. */
const snapReport = buildReport(baseScan, "snapshot");
const snap = JSON.stringify(snapReport);
const inconclusiveTitles = new Set((snapReport.inconclusive || []).map((i) => i.title));
const failedTitles = TITLES.filter((t) => !inconclusiveTitles.has(t));

const leakedTitles = failedTitles.filter((t) => snap.includes(t));
leakedTitles.length
    ? fail(`snapshot leaks ${leakedTitles.length} finding title(s), e.g. "${leakedTitles[0]}"`)
    : pass("snapshot contains no title of a finding (inconclusive titles exempt, by design)");

// And specifically: not one of the titles this scan actually failed on.
const failedHere = failing.map((f) => f.title).filter((t) => snap.includes(t));
failedHere.length
    ? fail(`snapshot leaks the title of a FAILED check: "${failedHere[0]}"`)
    : pass("snapshot leaks no failed-check title");
/remediation/i.test(snap) ? fail("snapshot contains remediation") : pass("snapshot contains no remediation");
/evidence/i.test(snap) ? fail("snapshot contains evidence") : pass("snapshot contains no evidence");

// basic — titles yes, remediation no.
const basic = JSON.stringify(buildReport(paidScan, "basic"));
TITLES.some((t) => basic.includes(t)) ? pass("basic contains finding titles") : fail("basic contains no titles");
/"remediation"/.test(basic) ? fail("basic leaks remediation") : pass("basic contains no remediation key");
/"impact"/.test(basic) ? fail("basic leaks impact") : pass("basic contains no impact");

// advanced — the lot.
const adv = JSON.stringify(buildReport(paidScan, "advanced"));
/"remediation"/.test(adv) ? pass("advanced contains remediation") : fail("advanced has no remediation");
/"impact"/.test(adv) ? pass("advanced contains impact") : fail("advanced has no impact");
/"roadmap"/.test(adv) ? pass("advanced contains a roadmap") : fail("advanced has no roadmap");

// A snapshot scan must not be able to produce a paid report.
try {
    buildReport(baseScan, "advanced");
    fail("a snapshot scan produced an advanced report — findings were not required");
} catch (e) {
    pass("a snapshot scan cannot produce a paid report");
}

console.log("\n" + "─".repeat(62));
if (failures) { console.log(`❌ ${failures} problem(s)\n`); process.exit(1); }
console.log(`✅ library sound — ${entries.length} entries, ${implemented.length} implemented, paywall holds\n`);

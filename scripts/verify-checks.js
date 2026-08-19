#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
//  verify-checks — assert the shape of the check catalogue.
//
//      node scripts/verify-checks.js
//
//  No database and no network. This is the test that runs before anything
//  else, because a catalogue that is wrong produces scans that are wrong in
//  ways nobody notices: a duplicate id silently drops a finding, and a tier
//  that is not a superset of the one below is a customer paying more for
//  less.
// ─────────────────────────────────────────────────────────────────────────

const { ALL_CHECKS, checksForTier } = require("../src/utils/checks");

const SEVERITIES = ["critical", "high", "medium", "low"];
const TIERS = ["snapshot", "basic", "advanced", "full_protection"];
const EXPECTED_TOTAL = 58;
const EXPECTED_TIER_COUNTS = { snapshot: 8, basic: 19, advanced: 58 };

let failures = 0;
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures += 1; };
const pass = (msg) => console.log(`  ✓ ${msg}`);

console.log("\ndShield check catalogue\n" + "─".repeat(60));

// ── 1 · count ────────────────────────────────────────────────────────────
ALL_CHECKS.length === EXPECTED_TOTAL
    ? pass(`${EXPECTED_TOTAL} checks load`)
    : fail(`expected ${EXPECTED_TOTAL} checks, found ${ALL_CHECKS.length}`);

// ── 2 · no duplicate ids ─────────────────────────────────────────────────
const ids = ALL_CHECKS.map((c) => c.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
dupes.length ? fail(`duplicate ids: ${[...new Set(dupes)].join(", ")}`) : pass("no duplicate ids");

// ── 3 · every field present ──────────────────────────────────────────────
const REQUIRED = ["id", "domain", "severity", "minTier", "title", "why", "run"];
const incomplete = ALL_CHECKS.filter((c) => REQUIRED.some((f) => c[f] === undefined || c[f] === null || c[f] === ""));
incomplete.length
    ? incomplete.forEach((c) => fail(`${c.id} is missing: ${REQUIRED.filter((f) => !c[f]).join(", ")}`))
    : pass("every check has id, domain, severity, minTier, title, why and run");

const notFn = ALL_CHECKS.filter((c) => typeof c.run !== "function");
notFn.length ? notFn.forEach((c) => fail(`${c.id}.run is not a function`)) : pass("every run is a function");

// ── 4 · severities ───────────────────────────────────────────────────────
const badSev = ALL_CHECKS.filter((c) => !SEVERITIES.includes(c.severity));
badSev.length
    ? badSev.forEach((c) => fail(`${c.id} has severity "${c.severity}"`))
    : pass(`every severity is one of ${SEVERITIES.join("/")}`);

const badTier = ALL_CHECKS.filter((c) => !TIERS.includes(c.minTier));
badTier.length
    ? badTier.forEach((c) => fail(`${c.id} has minTier "${c.minTier}"`))
    : pass("every minTier is a known tier");

// ── 5 · tier counts ──────────────────────────────────────────────────────
Object.entries(EXPECTED_TIER_COUNTS).forEach(([tier, expected]) => {
    const actual = checksForTier(tier).length;
    actual === expected
        ? pass(`${tier} runs ${expected} checks`)
        : fail(`${tier} should run ${expected} checks, runs ${actual}`);
});

// ── 6 · each tier is a strict superset of the one below ──────────────────
// A tier that drops a check the tier below runs is a customer paying more
// and receiving less. This is the assertion that catches it.
let supersetOk = true;
for (let i = 1; i < TIERS.length; i += 1) {
    const lower = new Set(checksForTier(TIERS[i - 1]).map((c) => c.id));
    const higher = new Set(checksForTier(TIERS[i]).map((c) => c.id));
    const missing = [...lower].filter((id) => !higher.has(id));
    if (missing.length) {
        fail(`${TIERS[i]} is missing checks that ${TIERS[i - 1]} runs: ${missing.join(", ")}`);
        supersetOk = false;
    }
}
if (supersetOk) pass("each tier is a superset of the one below");

// ── 7 · the check that must not drift ────────────────────────────────────
const admin = ALL_CHECKS.find((c) => c.id === "SURF-ADMIN-02");
if (!admin) fail("SURF-ADMIN-02 is missing");
else admin.severity === "high"
    ? pass("SURF-ADMIN-02 is high, not critical")
    : fail(`SURF-ADMIN-02 is "${admin.severity}" — it must be high, or well-run sites cap at D`);

// ── 8 · id format ────────────────────────────────────────────────────────
const ID_RE = /^[A-Z]+-[A-Z0-9-]+$/;
const badIds = ALL_CHECKS.filter((c) => !ID_RE.test(c.id));
badIds.length
    ? badIds.forEach((c) => fail(`id "${c.id}" does not match ${ID_RE}`))
    : pass(`every id matches ${ID_RE}`);

// ── the table ────────────────────────────────────────────────────────────
const tally = (list, key) => list.reduce((a, c) => (a[c[key]] = (a[c[key]] || 0) + 1, a), {});

console.log("\nBy tier\n" + "─".repeat(60));
console.log("  tier              runs   own   domains");
TIERS.forEach((t) => {
    const runs = checksForTier(t);
    const own = ALL_CHECKS.filter((c) => c.minTier === t);
    const domains = Object.keys(tally(runs, "domain")).sort((a, b) => a - b).join(", ");
    console.log(`  ${t.padEnd(17)} ${String(runs.length).padStart(4)}  ${String(own.length).padStart(4)}   ${domains}`);
});

console.log("\nBy domain and severity\n" + "─".repeat(60));
const byDomain = tally(ALL_CHECKS, "domain");
Object.keys(byDomain).sort((a, b) => a - b).forEach((d) => {
    const inD = ALL_CHECKS.filter((c) => String(c.domain) === String(d));
    const sev = SEVERITIES.map((s) => `${s} ${inD.filter((c) => c.severity === s).length}`).join("  ");
    console.log(`  domain ${String(d).padEnd(3)} ${String(inD.length).padStart(3)} checks   ${sev}`);
});

console.log("\n" + "─".repeat(60));
if (failures) {
    console.log(`❌ ${failures} problem(s) with the catalogue\n`);
    process.exit(1);
}
console.log(`✅ catalogue is sound — ${ALL_CHECKS.length} checks, ${Object.keys(byDomain).length} domains\n`);

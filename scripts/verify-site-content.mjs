#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
//  verify-site-content - assert the words agree with the engine.
//
//      node scripts/verify-site-content.mjs
//
//  No database and no network.
//
//  WHY THIS EXISTS.
//  v6.3 of the main product was cut because of one defect found by journey
//  testing: the site lit five tiles on a free scan and the engine covered
//  two. Three tiles stayed dark with nothing explaining why, under a hero
//  headline reading "Five ways in from the street".
//
//  Every prior harness passed, because each artefact was correct on its own
//  terms. The site listed five, the engine ran its checks, and nothing
//  compared the two lists.
//
//  This script is that comparison. It enumerates BOTH directions - every
//  area the site promises must be an area the engine reaches, and every
//  domain the engine scans must be an area the site names. Sampling finds
//  the instance; enumeration finds the class.
//
//  .mjs because src/data/site-content.js is an ES module the frontend
//  imports, while the check catalogue and routes are CommonJS that server.js
//  requires at boot. This file bridges the two.
// ─────────────────────────────────────────────────────────────────────────

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ALL_CHECKS, checksForTier } = require("../src/utils/checks");
const { ALL_DOMAINS } = require("../src/utils/scan_engine");
const { TOOL_SLUGS } = require("../src/utils/routes");

const C = await import("../src/data/site-content.js");

let failures = 0;
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures += 1; };
const pass = (msg) => console.log(`  ✓ ${msg}`);

console.log("\ndShield site content vs the engine\n" + "─".repeat(64));

// ── 1 · the 23 areas exist on both sides ─────────────────────────────────
C.DOMAINS.length === ALL_DOMAINS.length
    ? pass(`${C.DOMAINS.length} areas named on the site, ${ALL_DOMAINS.length} in the engine`)
    : fail(`site names ${C.DOMAINS.length} areas, engine has ${ALL_DOMAINS.length}`);

const siteNumbers = C.DOMAINS.map((d) => d.n).sort((a, b) => a - b);
const engineNumbers = ALL_DOMAINS.map((d) => d.no).sort((a, b) => a - b);
String(siteNumbers) === String(engineNumbers)
    ? pass("area numbers line up exactly")
    : fail(`area numbers differ - site ${siteNumbers} vs engine ${engineNumbers}`);

// ── 2 · the promise, in both directions ──────────────────────────────────
//  This is the v6.3 defect. Do not relax either half.
const promised = C.SEEN_DOMAINS.map((d) => d.n).sort((a, b) => a - b);
const scanned = ALL_DOMAINS.filter((d) => d.scanned).map((d) => d.no).sort((a, b) => a - b);
const reached = [...new Set(checksForTier("snapshot").map((c) => c.domain))].sort((a, b) => a - b);

String(promised) === String(scanned)
    ? pass(`site promises areas ${promised.join(", ")} - engine marks the same five scanned`)
    : fail(`site promises ${promised.join(", ")}, engine marks ${scanned.join(", ")} as scanned`);

String(promised) === String(reached)
    ? pass(`free scan actually reaches all ${reached.length} promised areas`)
    : fail(`PROMISE BROKEN - site lights ${promised.join(", ")}, snapshot checks only reach ${reached.join(", ")}`);

const unreached = promised.filter((n) => !reached.includes(n));
unreached.length
    ? fail(`areas promised with no snapshot check behind them: ${unreached.join(", ")}`)
    : pass("no area is promised without a check behind it");

const unpromised = reached.filter((n) => !promised.includes(n));
unpromised.length
    ? fail(`snapshot checks run against areas the site never names: ${unpromised.join(", ")}`)
    : pass("no check runs against an area the site never names");

// ── 3 · no fabricated numbers survived the port ──────────────────────────
//  The prototype hardcodes score:62 / 78 / 41 / 94 / 10 and "found" strings
//  such as "your certificate expires in 19 days", then never reads the scan
//  response. Copied across, every visitor sees the same invented grades for
//  their own domain.
const fabricated = C.DOMAINS.filter((d) => d.score !== undefined || d.found !== undefined);
fabricated.length
    ? fail(`fabricated scan data in DOMAINS: ${fabricated.map((d) => d.n).join(", ")} - real numbers come from the scan response`)
    : pass("no hardcoded scores or findings in the area table");

// ── 4 · the unscanned eighteen each explain themselves ───────────────────
const unexplained = C.DOMAINS.filter((d) => !d.seen && (!d.hides || !d.by));
unexplained.length
    ? fail(`areas with no explanation of what they hide or how to reach them: ${unexplained.map((d) => d.n).join(", ")}`)
    : pass("all eighteen unscanned areas say what they hide and how to reach them");

const badBy = C.DOMAINS.filter((d) => d.by && !["connect", "questions"].includes(d.by));
badBy.length ? fail(`unknown "by" value on areas ${badBy.map((d) => d.n).join(", ")}`) : pass('every "by" is connect or questions');

// ── 5 · the proof block is not decorative ────────────────────────────────
const proofChecks = C.PROOF.find((p) => p.label.includes("checks"));
Number(proofChecks?.big) === ALL_CHECKS.length
    ? pass(`"${proofChecks.big} checks" matches the catalogue`)
    : fail(`site claims ${proofChecks?.big} checks, catalogue has ${ALL_CHECKS.length}`);

const proofAreas = C.PROOF.find((p) => p.label.includes("risk areas"));
Number(proofAreas?.big) === C.DOMAINS.length
    ? pass(`"${proofAreas.big} risk areas" matches the area table`)
    : fail(`site claims ${proofAreas?.big} areas, table has ${C.DOMAINS.length}`);

// ── 6 · the free tier covers what the free tier covers ───────────────────
const freeTier = C.TIERS.find((t) => t.key === "free");
freeTier?.covers === promised.length
    ? pass(`free tier advertises ${freeTier.covers} areas, and reaches ${promised.length}`)
    : fail(`free tier advertises ${freeTier?.covers} areas but reaches ${promised.length}`);

// ── 7 · every advertised tool is a tool that exists ──────────────────────
//  Fifty connectors, one collector. The catalogue and the implementation
//  were two lists nobody compared.
const builtSlugs = C.SMART_BUILT.map((t) => t.slug).sort();
const routeSlugs = [...TOOL_SLUGS].sort();
String(builtSlugs) === String(routeSlugs)
    ? pass(`all ${builtSlugs.length} built tools have routes: ${builtSlugs.join(", ")}`)
    : fail(`tools marked built ${builtSlugs.join(", ")} but routes are ${routeSlugs.join(", ")}`);

const unbuiltShown = C.SMART_BUILT.filter((t) => !t.built);
unbuiltShown.length
    ? fail("SMART_BUILT contains a tool that is not built")
    : pass("nothing unbuilt can reach the site through SMART_BUILT");

const unbuilt = C.SMART.filter((t) => !t.built);
console.log(`  · ${unbuilt.length} tool(s) advertised in the prototype and not yet built: ${unbuilt.map((t) => t.slug).join(", ") || "none"}`);

// ── 8 · no placeholder contact details ───────────────────────────────────
//  The prototype ships "+91 00000 00000" for phone and WhatsApp, under an
//  FAQ answer promising "a phone number that a person answers".
const placeholder = Object.entries(C.OFFICE).filter(([, v]) => /0{4,}|\[\[|XXXX/i.test(String(v)));
placeholder.length
    ? fail(`placeholder contact details: ${placeholder.map(([k]) => k).join(", ")}`)
    : pass("no placeholder contact details");

// ── summary ──────────────────────────────────────────────────────────────
console.log("\nThe five the site promises\n" + "─".repeat(64));
C.SEEN_DOMAINS.forEach((d) => {
    const ids = checksForTier("snapshot").filter((c) => c.domain === d.n).map((c) => c.id);
    console.log(`  ${String(d.n).padStart(2)}  ${d.name.padEnd(30)} ${ids.length} check(s)  ${ids.join(" ")}`);
});

console.log("\n" + "─".repeat(64));
if (failures) {
    console.log(`❌ ${failures} disagreement(s) between the site and the engine\n`);
    process.exit(1);
}
console.log(`✅ site and engine agree - ${C.DOMAINS.length} areas named, ${promised.length} promised, ${promised.length} reached\n`);

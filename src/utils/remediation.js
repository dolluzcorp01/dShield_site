// ─────────────────────────────────────────────────────────────────────────
//  remediation — the library that turns a finding into something a customer
//  can act on.
//
//  The pricing page sells "step-by-step remediation for every finding", an
//  effort estimate and a verification step. This is that content.
//
//  SEVERITY, WEIGHT AND DOMAIN ARE NOT IN THE LIBRARY. They are read from
//  the check. In v6.3 both carried them and they disagreed — SURF-ADMIN-02
//  was critical in the library and high in the code, and a single critical
//  caps a grade at D. One source cannot disagree with itself.
// ─────────────────────────────────────────────────────────────────────────

const library = require("../data/remediation-library.json");
const { ALL_CHECKS } = require("./checks");

/* Fail at load, not at render.
   Fifteen library ids had drifted from the scanner's. Because a report looks
   findings up by id, each mismatch rendered a title and nothing else —
   silently, with no error, for months. A startup crash naming the offending
   ids is a far better outcome than a customer paying for half a report. */
const checkIds = new Set(ALL_CHECKS.map((c) => c.id));
const implemented = library.checks.filter((e) => e.implemented);

const orphans = implemented.filter((e) => !checkIds.has(e.id)).map((e) => e.id);
if (orphans.length) {
    throw new Error(
        `Remediation library references ${orphans.length} check id(s) that do not exist in the scanner: ${orphans.join(", ")}. ` +
        "The scanner is authoritative — correct the library.");
}

const uncovered = [...checkIds].filter((id) => !implemented.some((e) => e.id === id));
if (uncovered.length) {
    throw new Error(
        `${uncovered.length} check(s) have no remediation entry: ${uncovered.join(", ")}. ` +
        "A finding with no guidance is a paid report with a blank page in it.");
}

const BY_ID = new Map(library.checks.map((e) => [e.id, Object.freeze(e)]));
Object.freeze(library);

/** The library entry for a check, or null. */
function getRemediation(checkId) {
    return BY_ID.get(checkId) || null;
}

function hasRemediation(checkId) {
    const e = BY_ID.get(checkId);
    return !!(e && e.implemented);
}

/**
 * Total the hands-on effort for a set of findings.
 *
 * Notes are collected separately and deliberately: they carry the part the
 * number cannot, such as DMARC needing 60–90 days of monitoring before it
 * can safely be enforced. A total that silently swallowed that would be the
 * same defect this library was ported to fix.
 */
function summariseEffort(checkIds = []) {
    let totalHours = 0;
    const notes = [];
    for (const id of checkIds) {
        const e = BY_ID.get(id);
        if (!e || !e.implemented) continue;
        totalHours += Number(e.effortHours) || 0;
        if (e.effortNote) notes.push({ checkId: id, note: e.effortNote });
    }
    return { totalHours, notes };
}

module.exports = {
    getRemediation,
    hasRemediation,
    summariseEffort,
    LIBRARY: library,
    meta: library.meta,
};

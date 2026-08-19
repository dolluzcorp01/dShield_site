// ─────────────────────────────────────────────────────────────────────────
//  report_builder — turns a scan into the report a given tier has paid for.
//
//  ⚠️  THIS IS WHERE THE PAYWALL IS DECIDED, AND IT IS DECIDED HERE ON THE
//  SERVER. Content a tier has not paid for is never placed in the object at
//  all — not hidden, not flagged, not sent and ignored by the frontend.
//  Something absent from the response cannot leak from it, and /result tells
//  customers exactly that: "not hidden in the source, not greyed out —
//  never sent".
//
//  Every widening of a tier's content must be matched by a test in
//  scripts/verify-remediation.js. A paywall that is not tested is a paywall
//  that leaks.
// ─────────────────────────────────────────────────────────────────────────

const { getRemediation, summariseEffort } = require("./remediation");
const { ALL_CHECKS } = require("./checks");
const { SEVERITY_WEIGHT } = require("./scan_engine");

const TIER_RANK = { snapshot: 0, basic: 1, advanced: 2, full_protection: 3 };
const CHECK_BY_ID = new Map(ALL_CHECKS.map((c) => [c.id, c]));

/* Severity, weight and domain come from the CHECK, never from the library —
   see the note in remediation.js. */
const weightOf = (severity) => SEVERITY_WEIGHT[severity] || 0;

const BANDS = [
    { key: "week", label: "This week", blurb: "Critical findings. These are worth interrupting other work for.", severities: ["critical"] },
    { key: "month", label: "This month", blurb: "High findings. Schedule these deliberately rather than fitting them in.", severities: ["high"] },
    { key: "quarter", label: "This quarter", blurb: "Medium and low findings. Worth doing, not worth an emergency.", severities: ["medium", "low"] },
];

/**
 * Build the roadmap.
 *
 * Within a band, heaviest first and then cheapest first, so the most
 * valuable work that can be done quickly rises to the top. An ordered list
 * that ignores effort is merely sorted; this is what makes it a plan.
 */
function buildRoadmap(failed) {
    return BANDS.map((band) => {
        const items = failed
            .filter((f) => band.severities.includes(f.severity))
            .sort((a, b) =>
                (weightOf(b.severity) - weightOf(a.severity)) ||
                ((getRemediation(a.checkId)?.effortHours ?? 0) - (getRemediation(b.checkId)?.effortHours ?? 0)))
            .map((f) => {
                const r = getRemediation(f.checkId);
                return {
                    checkId: f.checkId,
                    title: f.title,
                    severity: f.severity,
                    effortHours: r ? r.effortHours : null,
                    skill: r ? r.skill : null,
                };
            });

        const { totalHours, notes } = summariseEffort(items.map((i) => i.checkId));
        return { ...band, severities: undefined, items, totalHours, notes, count: items.length };
    }).filter((b) => b.count > 0);
}

/**
 * @param scan  a runScan() result
 * @param tier  snapshot · basic · advanced · full_protection
 */
function buildReport(scan, tier = "snapshot") {
    const rank = TIER_RANK[tier] ?? 0;

    /* Everyone gets this much. It is what the free scan already shows, and
       it carries no finding titles at all. */
    const report = {
        tier,
        domain: scan.domain,
        scannedAt: scan.scannedAt,
        status: scan.status,
        grade: scan.grade,
        score: scan.score,
        capped: scan.capped,
        capReason: scan.capReason,
        counts: scan.counts,
        totalIssues: scan.totalIssues,
        passedCount: scan.passedCount,
        checksRun: scan.checksRun,
        checksCompleted: scan.checksCompleted,
        coverageRatio: scan.coverageRatio,
        domainScores: scan.domainScores,
        coverageMap: scan.coverageMap,

        /* What could not be measured, stated plainly and never counted as a
           pass. A customer paying for a report is owed this more than a free
           visitor is, not less. */
        inconclusive: (scan.inconclusive || []).map((i) => ({
            checkId: i.checkId, title: i.title, reason: i.reason,
        })),
    };

    if (rank === 0) {
        // Free: where and how serious, never what. Same shape the site
        // already returns.
        report.issueSummary = scan.issueSummary || [];
        return report;
    }

    /* Above free we need the findings themselves. runScan only attaches them
       above the snapshot tier — see the note there. If a caller passes a
       snapshot scan and asks for a paid report, say so rather than quietly
       returning an empty one. */
    if (!Array.isArray(scan.findings)) {
        throw new Error(
            `buildReport("${tier}") needs the scan's findings. Run the scan at a paid tier — ` +
            "runScan() withholds findings on snapshot scans so the free response cannot leak them.");
    }

    const failed = scan.findings.filter((f) => !f.passed);

    // BASIC — what is wrong and where, with the evidence. Not what to do
    // about it: that is the difference a customer is paying for at advanced.
    report.findings = failed.map((f) => {
        const check = CHECK_BY_ID.get(f.checkId);
        const lib = getRemediation(f.checkId);
        const out = {
            checkId: f.checkId,
            title: f.title,
            severity: f.severity,
            weight: weightOf(f.severity),
            domain: f.domain,
            evidence: f.evidence,
            detail: f.detail ?? null,
            why: f.why || (check ? check.why : null),
            finding: lib ? lib.finding : null,
        };

        if (rank >= 2) {
            // ADVANCED — impact, the steps, how to verify, and what it costs.
            out.impact = lib ? lib.impact : null;
            out.remediation = lib ? lib.remediation : null;
            out.effortHours = lib ? lib.effortHours : null;
            out.effortNote = lib ? lib.effortNote : null;
            out.skill = lib ? lib.skill : null;
        }
        return out;
    });

    report.passed = scan.findings.filter((f) => f.passed).map((f) => ({
        checkId: f.checkId, title: f.title, evidence: f.evidence,
    }));

    if (rank >= 2) {
        report.roadmap = buildRoadmap(failed);
        const all = summariseEffort(failed.map((f) => f.checkId));
        report.effortTotalHours = all.totalHours;
        report.effortNotes = all.notes;
    }

    return report;
}

module.exports = { buildReport, buildRoadmap, TIER_RANK };

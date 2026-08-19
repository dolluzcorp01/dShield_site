// ─────────────────────────────────────────────────────────────────────────
//  scan_engine — the free (snapshot) tier of the dShield scanner.
//
//  Eight checks across the five domains the public site advertises. Ported
//  from the dShield v6.3 engine, keeping the same check IDs, severities,
//  weights and scoring formula so a free scan here and a paid scan there
//  produce comparable numbers.
//
//  Everything runs on Node built-ins — dns, tls, https. No third-party
//  service, no API key, no per-scan cost. That is why the free tier can be
//  unlimited.
//
//  THE RULE, inherited from the main engine and not to be relaxed:
//    A check we could not run is INCONCLUSIVE, never a pass.
//  "We looked and found nothing wrong" and "we could not look" are different
//  sentences. A customer told the first when the second is true has been
//  misled about their own safety by a product they came to for the opposite.
// ─────────────────────────────────────────────────────────────────────────

const dns = require("dns").promises;

// The network helpers moved to ./net so the check files can use them
// without requiring this module back and creating a cycle. They are
// re-exported below, unchanged, because tools_engine.js imports them
// from here.
const {
    withTimeout, fetchUrl, getCertificate, txtRecords, typoVariants,
    resetHostState, isHostBlocked, BLOCKED_MESSAGE,
} = require("./net");
const { ALL_CHECKS, checksForTier, orderedForTier, scanRank } = require("./checks");

// Severity weights. Identical to the paid engine — the published formula
// depends on these, and a customer is invited to recompute a grade by hand.
const SEVERITY_WEIGHT = { critical: 10, high: 6, medium: 3, low: 1 };

const DOMAIN_NAMES = {
    1: "External Attack Surface",
    4: "Encryption & Certificates",
    6: "Email & Domain Security",
    10: "Breach & Exposure Intelligence",
    20: "Brand & Digital Risk",
};

// Every domain the full product covers. The free scan scores five of these;
// the other eighteen are shown greyed out, because a customer seeing their
// grade beside the size of what was NOT measured is the entire commercial
// argument.
const ALL_DOMAINS = [
    { no: 1, name: "External Attack Surface", scanned: true },
    { no: 2, name: "Identity & Access Management", scanned: false },
    { no: 3, name: "Network Security", scanned: false },
    { no: 4, name: "Encryption & Certificates", scanned: true },
    { no: 5, name: "Identity Governance", scanned: false },
    { no: 6, name: "Email & Domain Security", scanned: true },
    { no: 7, name: "Endpoint & Device Security", scanned: false },
    { no: 8, name: "Cloud Security", scanned: false },
    { no: 9, name: "Application Security", scanned: false },
    { no: 10, name: "Breach & Exposure Intelligence", scanned: true },
    { no: 11, name: "Ransomware & Malware Resilience", scanned: false },
    { no: 12, name: "Detection & Response", scanned: false },
    { no: 13, name: "Business Continuity", scanned: false },
    { no: 14, name: "Governance, Risk & Compliance", scanned: false },
    { no: 15, name: "Third Party & Supply Chain", scanned: false },
    { no: 16, name: "Physical & Environmental", scanned: false },
    { no: 17, name: "Secure Development", scanned: false },
    { no: 18, name: "Human Factor & Security Culture", scanned: false },
    { no: 19, name: "Operational Technology & ICS", scanned: false },
    { no: 20, name: "Brand & Digital Risk", scanned: true },
    { no: 21, name: "Adversary & Threat Landscape", scanned: false },
    { no: 22, name: "Fraud & Financial Crime", scanned: false },
    { no: 23, name: "Cyber Due Diligence in Transactions", scanned: false },
];

// A grade may not be published below this ratio of checks completing.
// Live testing of the main engine caught the worst possible failure: an
// aborted scan of an unreachable host reported grade A, score 100, zero
// findings — because with every check errored there was nothing left to
// fail. A firewalled customer would have been told they were secure.
const MIN_COVERAGE_RATIO = 0.6;

// An absolute floor alongside the ratio. Across eight checks a percentage is
// a hair trigger: two slow lookups and the customer's first impression of us
// is "we could not grade you".
const MIN_COVERAGE_CHECKS = 5;

const PER_CHECK_TIMEOUT_MS = 12000;

/* How many checks run at once, and the wall clock for the whole scan.
   See the note in runScan for why both exist.

   Path-probing checks run TWO at a time against the target. The governor in
   net.js already spaces requests to one host by 700ms, but a small batch
   also keeps a slow host from holding eight check slots open at once.

   The budget is 180s rather than 150s because pacing makes scans slower by
   design — that is the trade this task exists to make. Free scans run 8
   checks and are nowhere near it. */
const BATCH_QUIET = 8;
const BATCH_NOISY = 2;
const BUDGET_MS = 180000;

// ── scoring ──────────────────────────────────────────────────────────────
//
// Published formula — a customer can recompute any grade by hand, which is
// the point. Do not change it without changing the Trust page with it.
//
//   domainScore = 100 − (failedWeight / applicableWeight × 100)
//
// Inconclusive checks are excluded from BOTH sides. A check that could not
// run must never quietly count as a pass.

function rawGrade(score) {
    if (score >= 90) return "A";
    if (score >= 75) return "B";
    if (score >= 60) return "C";
    if (score >= 40) return "D";
    return "E";
}

function computeScores(findings, checksRun, inconclusiveIds) {
    const skipped = new Set(inconclusiveIds);
    const applicable = checksRun.filter((c) => !skipped.has(c.id));

    const domains = {};
    applicable.forEach((c) => {
        const d = (domains[c.domain] = domains[c.domain] || { possible: 0, failed: 0, findings: 0 });
        d.possible += SEVERITY_WEIGHT[c.severity];
    });
    findings.filter((f) => !f.passed).forEach((f) => {
        const d = domains[f.domain];
        if (!d) return;
        d.failed += SEVERITY_WEIGHT[f.severity];
        d.findings += 1;
    });

    const domainScores = {};
    Object.entries(domains).forEach(([no, d]) => {
        domainScores[no] = {
            name: DOMAIN_NAMES[no],
            score: d.possible === 0 ? null : Math.round(100 - (d.failed / d.possible) * 100),
            findings: d.findings,
        };
    });

    const totalPossible = applicable.reduce((a, c) => a + SEVERITY_WEIGHT[c.severity], 0);
    const totalFailed = findings.filter((f) => !f.passed)
        .reduce((a, f) => a + SEVERITY_WEIGHT[f.severity], 0);

    const attemptedWeight = checksRun.reduce((a, c) => a + SEVERITY_WEIGHT[c.severity], 0);
    const coverageRatio = attemptedWeight === 0 ? 0 : totalPossible / attemptedWeight;
    const executed = applicable.length;
    const requiredChecks = Math.min(MIN_COVERAGE_CHECKS, checksRun.length);

    const insufficientCoverage = coverageRatio < MIN_COVERAGE_RATIO || executed < requiredChecks;

    if (insufficientCoverage) {
        return {
            insufficientCoverage: true, coverageRatio, executed,
            score: null, grade: null, domainScores, capped: false, capReason: null,
        };
    }

    const score = totalPossible === 0 ? 100 : Math.round(100 - (totalFailed / totalPossible) * 100);
    let grade = rawGrade(score);

    // Any critical finding caps the grade. Non-negotiable: a company with one
    // critical hole and otherwise good hygiene is not a B.
    const criticals = findings.filter((f) => !f.passed && f.severity === "critical").length;
    let capped = false, capReason = null;
    if (criticals >= 3 && grade < "E") { grade = "E"; capped = true; capReason = `${criticals} critical findings`; }
    else if (criticals >= 1 && ["A", "B", "C"].includes(grade)) {
        grade = "D"; capped = true;
        capReason = `${criticals} critical finding${criticals > 1 ? "s" : ""}`;
    }

    return { insufficientCoverage: false, coverageRatio, executed, score, grade, domainScores, capped, capReason };
}

// ── the scan ─────────────────────────────────────────────────────────────

/**
 * Reject anything that is not a public internet name.
 *
 * Without this the scanner is an open proxy into our own network: a caller
 * submits 169.254.169.254 and we return the server's own cloud credentials.
 * This is the single most valuable target on any hosted machine.
 */
function normaliseDomain(input) {
    let raw = String(input || "").trim().toLowerCase();
    raw = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^www\./, "");

    if (!raw) return { ok: false, message: "Enter a domain, for example dolluzcorp.com" };
    if (raw.length > 253) return { ok: false, message: "That domain is too long." };
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(raw)) {
        return { ok: false, message: "That does not look like a domain. Try something like dolluzcorp.com" };
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) {
        return { ok: false, message: "Enter a domain name rather than an IP address." };
    }
    const BLOCKED = /(^|\.)(localhost|local|internal|intranet|corp|home|lan|test|example|invalid)$/;
    if (BLOCKED.test(raw)) {
        return { ok: false, message: "That is an internal or reserved name. dShield only scans public internet domains." };
    }
    return { ok: true, domain: raw };
}

/** Reserved ranges. A public name that resolves into one of these is refused. */
function isPrivateAddress(ip) {
    if (/^10\./.test(ip)) return true;
    if (/^127\./.test(ip)) return true;
    if (/^169\.254\./.test(ip)) return true;                 // cloud metadata lives here
    if (/^192\.168\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    if (/^0\./.test(ip)) return true;
    if (/^(::1|fc|fd|fe80)/i.test(ip)) return true;
    return false;
}

/**
 * Run the free scan.
 *
 * onProgress is called after each check so the site can show movement — a
 * blank screen for ninety seconds reads as broken however well it works.
 */
async function runScan(domainInput, opts = {}) {
    const { tier = "snapshot", onProgress } = (typeof opts === "function") ? { onProgress: opts } : opts;
    const parsed = normaliseDomain(domainInput);
    if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: "INVALID_DOMAIN" });

    const domain = parsed.domain;

    // Resolve first, and refuse anything pointing inward.
    let addresses;
    try {
        addresses = await withTimeout(dns.lookup(domain, { all: true }), 8000, "DNS lookup");
    } catch (e) {
        throw Object.assign(new Error(`We could not resolve ${domain}. Check the spelling and try again.`),
            { code: "UNRESOLVABLE" });
    }
    if (addresses.some((a) => isPrivateAddress(a.address))) {
        throw Object.assign(new Error("That domain resolves to a private address and cannot be scanned."),
            { code: "PRIVATE_ADDRESS" });
    }

    /* Clean host state per scan. A target blocked on one visitor's scan must
       not be treated as blocked for the next, and a host that has recovered
       must get a fair hearing. */
    resetHostState();

    // `tier` is on the target so a check can vary HOW MUCH it probes without
    // changing what it reports. See the probe-list note in checks/surface.js.
    const target = { domain, hostname: domain, origin: `https://${domain}`, tier };

    /* Which checks this tier runs. A higher tier runs everything the lower
       tiers run plus its own — never a different set. Default is snapshot, so
       an unchanged caller (the free scan) still runs exactly 8. */
    const checks = orderedForTier(tier);

    const findings = [];
    const inconclusive = [];

    /* THE BUDGET.
       Fifty-eight checks run one after another would exceed any sensible
       request timeout. Two things keep that in hand.

       Concurrency: BATCH at a time, not all of them. One site receiving 58
       simultaneous requests from us looks like an attack, and is the opposite
       of the passive scan printed on the site — it also gets our address
       blocked, after which every scan is inconclusive.

       A wall clock: once the budget is spent, whatever has not run is marked
       inconclusive rather than the scan hanging or failing. A partial scan
       that says so honestly is worth more than one that never returns, and an
       inconclusive check is excluded from scoring on both sides, so the grade
       stays defensible. */
    const deadline = Date.now() + BUDGET_MS;
    let completed = 0;

    let i = 0;
    while (i < checks.length) {
        // Batch size follows the noisiest check in the run — two at a time
        // once we are requesting speculative paths.
        const size = scanRank(checks[i]) >= 4 ? BATCH_NOISY : BATCH_QUIET;
        const batch = checks.slice(i, i + size);
        i += size;

        if (Date.now() > deadline) {
            batch.forEach((c) => inconclusive.push({
                checkId: c.id, domain: c.domain, title: c.title,
                reason: "Not run — the scan reached its time budget",
            }));
            continue;
        }

        /* The target has told us to stop. Everything left that would talk to
           it is inconclusive, and we make no further requests. Pressing on
           lengthens the block and tells their security team we are hostile. */
        if (isHostBlocked(domain)) {
            batch.forEach((c) => inconclusive.push({
                checkId: c.id, domain: c.domain, title: c.title,
                reason: BLOCKED_MESSAGE,
            }));
            continue;
        }

        await Promise.all(batch.map(async (check) => {
            if (typeof onProgress === "function") {
                onProgress({ index: completed, total: checks.length, checkId: check.id, title: check.title });
            }
            try {
                /* A SHORT, GENERIC LABEL — not check.title.
                   withTimeout formats its label as "<label> timed out", and
                   every place that shows a reason already prints the title
                   beside it. Passing the title produced "Administrative
                   interface exposed to the internet — Administrative interface
                   exposed to the internet timed out", which reads as a bug in
                   a document a customer files. */
                const out = await withTimeout(check.run(target), PER_CHECK_TIMEOUT_MS, "The check");
                findings.push({
                    checkId: check.id, domain: check.domain, severity: check.severity,
                    title: check.title, why: check.why,
                    passed: !!out.passed, evidence: out.evidence || null, detail: out.detail || null,
                });
            } catch (err) {
                // INCONCLUSIVE. Never a pass. See the note at the top of this file.
                inconclusive.push({ checkId: check.id, domain: check.domain, title: check.title, reason: err.message });
            } finally {
                completed += 1;
            }
        }));
    }

    const checksRun = checks.map((c) => ({ id: c.id, domain: c.domain, severity: c.severity }));
    const scores = computeScores(findings, checksRun, inconclusive.map((i) => i.checkId));

    const failed = findings.filter((f) => !f.passed);
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    failed.forEach((f) => { counts[f.severity] += 1; });

    return {
        domain,
        scannedAt: new Date().toISOString(),
        tier,
        status: scores.insufficientCoverage ? "inconclusive" : "complete",
        grade: scores.grade,
        score: scores.score,
        capped: scores.capped,
        capReason: scores.capReason,
        coverageRatio: Number(scores.coverageRatio.toFixed(2)),
        checksRun: checks.length,
        checksCompleted: scores.executed,
        counts,
        totalIssues: failed.length,
        passedCount: findings.filter((f) => f.passed).length,
        domainScores: scores.domainScores,
        inconclusive,
        coverageMap: ALL_DOMAINS,
        /* FULL FINDINGS ARE ATTACHED ONLY ABOVE THE FREE TIER.
           The report builder needs each finding's title and evidence, but
           Scan_server.js returns this object to the browser VERBATIM — it
           does not filter it. So attaching findings unconditionally would
           publish every title and evidence string on every free scan and
           destroy the paywall that /result promises is "never sent".

           Gating it on tier keeps the free response byte-identical and puts
           the paywall in the engine as well as in the report builder. A
           caller who wants findings has to ask for a paid tier. */
        ...(tier !== "snapshot" ? { findings } : {}),

        // Titles only, and only for the domain they sit in. No evidence, no
        // remediation, no detail — that is what the paid tiers are. The
        // paywall lives on the server; withheld content never reaches the
        // browser at all, so it cannot be read out of the page source.
        issueSummary: failed.map((f) => ({
            domain: f.domain,
            domainName: DOMAIN_NAMES[f.domain],
            severity: f.severity,
        })),
    };
}

module.exports = {
    runScan,
    normaliseDomain,
    isPrivateAddress,
    computeScores,
    // Re-exported from ./net so this module's public surface is unchanged.
    // tools_engine.js imports these from here and was not touched.
    fetchUrl,
    getCertificate,
    txtRecords,
    typoVariants,
    withTimeout,
    // The catalogue, for callers that want to inspect it.
    CHECKS: ALL_CHECKS,
    ALL_CHECKS,
    checksForTier,
    ALL_DOMAINS,
    DOMAIN_NAMES,
    SEVERITY_WEIGHT,
};

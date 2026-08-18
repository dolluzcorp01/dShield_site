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
const tls = require("tls");
const https = require("https");
const http = require("http");

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

// ── helpers ──────────────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Fetch a URL and return status, headers and a capped body.
 *
 * The cap matters. In the main engine a homepage over 256 KB hung every HTTP
 * check, because destroying the socket meant the 'end' event never fired —
 * one check took ten seconds against a 108ms raw request. Read a bounded
 * number of bytes and resolve rather than waiting for a body we do not want.
 */
function fetchUrl(url, { method = "GET", maxBytes = 262144 } = {}) {
    return new Promise((resolve, reject) => {
        let lib;
        try {
            lib = new URL(url).protocol === "http:" ? http : https;
        } catch (e) {
            return reject(new Error("Invalid URL"));
        }

        const req = lib.request(url, {
            method,
            timeout: 10000,
            rejectUnauthorized: false,   // we report certificate problems, not refuse on them
            headers: { "User-Agent": "dShield-Scanner/1.0 (+https://dshield.dolluzcorp.com)" },
        }, (res) => {
            let body = "";
            let bytes = 0;
            res.on("data", (chunk) => {
                bytes += chunk.length;
                if (bytes <= maxBytes) body += chunk.toString("utf8");
                else { res.destroy(); resolve({ status: res.statusCode, headers: res.headers, body, truncated: true }); }
            });
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body, truncated: false }));
            res.on("error", reject);
        });

        req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
        req.on("error", reject);
        req.end();
    });
}

/** Read a TLS certificate without trusting it — an expired cert is the finding. */
function getCertificate(hostname, port = 443) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({
            host: hostname, port, servername: hostname,
            rejectUnauthorized: false, timeout: 10000,
        }, () => {
            const cert = socket.getPeerCertificate(true);
            const protocol = socket.getProtocol();
            socket.end();
            if (!cert || !Object.keys(cert).length) return reject(new Error("No certificate presented"));
            resolve({ cert, protocol });
        });
        socket.on("timeout", () => { socket.destroy(); reject(new Error("TLS connection timed out")); });
        socket.on("error", reject);
    });
}

async function txtRecords(name) {
    const records = await dns.resolveTxt(name);
    return records.map((parts) => parts.join(""));
}

// ── the eight checks ─────────────────────────────────────────────────────
//
// Each returns { passed, evidence, detail } or throws. A throw becomes
// INCONCLUSIVE — never a pass.

const CHECKS = [

    // ---- Domain 6 · Email & Domain Security -----------------------------
    {
        id: "EMAIL-SPF-38",
        domain: 6,
        severity: "high",
        title: "No SPF record published",
        why: "SPF tells the world which servers may send email using your domain. Without it, anyone can send mail that appears to come from you.",
        async run(target) {
            const records = await txtRecords(target.domain);
            const spf = records.find((r) => r.toLowerCase().startsWith("v=spf1"));
            return spf
                ? { passed: true, evidence: `SPF record published: ${spf.slice(0, 120)}` }
                : { passed: false, evidence: "No TXT record beginning v=spf1 was found." };
        },
    },
    {
        id: "EMAIL-DMARC-44",
        domain: 6,
        severity: "critical",
        title: "No DMARC record published",
        why: "DMARC tells receiving mail servers what to do with mail that fails your SPF and DKIM checks. Without it, those checks carry no instruction and forged mail is usually delivered.",
        async run(target) {
            const records = await txtRecords(`_dmarc.${target.domain}`).catch(() => []);
            const dmarc = records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
            target._dmarc = dmarc || null;
            return dmarc
                ? { passed: true, evidence: `DMARC record published: ${dmarc.slice(0, 120)}` }
                : { passed: false, evidence: "No TXT record at _dmarc beginning v=DMARC1 was found." };
        },
    },
    {
        id: "EMAIL-DMARC-45",
        domain: 6,
        severity: "critical",
        title: "DMARC policy set to monitor only",
        why: "A policy of p=none reports forged mail but asks receivers to deliver it anyway. It is a listening post, not a defence.",
        async run(target) {
            let dmarc = target._dmarc;
            if (dmarc === undefined) {
                const records = await txtRecords(`_dmarc.${target.domain}`).catch(() => []);
                dmarc = records.find((r) => r.toLowerCase().startsWith("v=dmarc1")) || null;
            }
            // No DMARC at all is reported by EMAIL-DMARC-44. Scoring it twice
            // would punish one mistake in two places.
            if (!dmarc) throw new Error("No DMARC record to evaluate");

            const policy = (/p\s*=\s*(none|quarantine|reject)/i.exec(dmarc) || [])[1];
            if (!policy) throw new Error("DMARC record has no p= tag");
            return policy.toLowerCase() === "none"
                ? { passed: false, evidence: `DMARC policy is p=none — forged mail is reported but still delivered.` }
                : { passed: true, evidence: `DMARC policy is p=${policy.toLowerCase()}.` };
        },
    },

    // ---- Domain 4 · Encryption & Certificates ---------------------------
    {
        id: "TLS-CERT-EXPIRED-29",
        domain: 4,
        severity: "critical",
        title: "Certificate has expired",
        why: "An expired certificate makes every visitor's browser show a full-page security warning. Most people leave, and those who continue have been taught to click through exactly the warning that protects them.",
        async run(target) {
            const { cert } = await getCertificate(target.hostname);
            const notAfter = new Date(cert.valid_to);
            target._cert = cert;
            const days = Math.floor((notAfter - Date.now()) / 86400000);
            target._certDays = days;
            return days < 0
                ? { passed: false, evidence: `Certificate expired ${Math.abs(days)} day(s) ago, on ${notAfter.toDateString()}.` }
                : { passed: true, evidence: `Certificate valid until ${notAfter.toDateString()}.` };
        },
    },
    {
        id: "TLS-CERT-EXPIRING-28",
        domain: 4,
        severity: "high",
        title: "Certificate expiring soon",
        why: "Certificate renewal is the single most common cause of unplanned outage, and it always happens on a weekend.",
        async run(target) {
            let days = target._certDays;
            if (days === undefined) {
                const { cert } = await getCertificate(target.hostname);
                days = Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000);
            }
            if (days < 0) throw new Error("Certificate already expired");   // reported by -29

            /* Fourteen days, not thirty.
               Let's Encrypt issues 90-day certificates and renews at 30 days
               remaining, and most other ACME issuers behave similarly. A
               thirty-day threshold therefore fires on a perfectly healthy site
               in the middle of its normal renewal window — tested against
               stripe.com, which sat at 29 days while renewing automatically.
               Fourteen days still leaves ample warning for a genuinely stalled
               renewal without crying wolf at every well-run site. */
            return days <= 14
                ? { passed: false, evidence: `Certificate expires in ${days} day(s).` }
                : { passed: true, evidence: `Certificate has ${days} day(s) remaining.` };
        },
    },

    // ---- Domain 1 · External Attack Surface ------------------------------
    {
        id: "SURF-GIT-04",
        domain: 1,
        severity: "critical",
        title: "Version control directory exposed",
        why: "A published .git directory can often be reconstructed into your complete source code, including any password or key ever committed to it — even one deleted in a later commit.",
        async run(target) {
            const res = await fetchUrl(`${target.origin}/.git/config`, { maxBytes: 4096 });
            const looksLikeGit = res.status === 200 &&
                /\[core\]|repositoryformatversion/i.test(res.body || "");
            return looksLikeGit
                ? { passed: false, evidence: `${target.origin}/.git/config returned 200 and contains a git configuration block.` }
                : { passed: true, evidence: `No readable .git directory (HTTP ${res.status}).` };
        },
    },

    // ---- Domain 10 · Breach & Exposure Intelligence ----------------------
    //
    // Certificate Transparency only. It is the one domain-10 signal that does
    // not call a breach corpus, so the free tier costs nothing per scan and
    // the paid intelligence stays a real reason to upgrade.
    {
        id: "BREACH-METADATA-55",
        domain: 10,
        severity: "medium",
        title: "Internal information disclosed in public sources",
        why: "Every certificate issued for your domain is published in a public log. Names like vpn, jenkins, staging or backup tell an attacker where to aim before they touch you.",
        async run(target) {
            const res = await withTimeout(
                fetchUrl(`https://crt.sh/?q=%25.${encodeURIComponent(target.domain)}&output=json`, { maxBytes: 524288 }),
                11000, "Certificate transparency lookup");

            if (res.status !== 200) throw new Error(`crt.sh returned HTTP ${res.status}`);

            let rows;
            try { rows = JSON.parse(res.body); }
            catch (e) { throw new Error("Certificate transparency response was not readable"); }
            if (!Array.isArray(rows)) throw new Error("Unexpected response shape");

            const names = new Set();
            rows.forEach((r) => String(r.name_value || "")
                .split("\n")
                .forEach((n) => {
                    const clean = n.trim().toLowerCase().replace(/^\*\./, "");
                    if (clean.endsWith(target.domain)) names.add(clean);
                }));

            const SENSITIVE = /(^|[.-])(vpn|jenkins|gitlab|jira|staging|stage|dev|test|uat|admin|internal|intranet|backup|db|database|sql|mail|smtp|ftp|rdp|citrix|sonar|nexus|grafana|kibana)([.-]|$)/;
            const flagged = [...names].filter((n) => SENSITIVE.test(n.replace(`.${target.domain}`, "")));

            target._subdomainCount = names.size;

            return flagged.length
                ? {
                    passed: false,
                    evidence: `${flagged.length} internal-looking hostname(s) are published in certificate transparency logs.`,
                    detail: flagged.slice(0, 8),
                }
                : { passed: true, evidence: `${names.size} hostname(s) found in public certificate logs, none obviously internal.` };
        },
    },

    // ---- Domain 20 · Brand & Digital Risk --------------------------------
    {
        id: "BRAND-TYPO-59",
        domain: 20,
        severity: "high",
        title: "Lookalike domain configured for email",
        why: "A misspelling of your domain that is merely registered is a nuisance. One with mail servers configured is an invoice-fraud campaign waiting to be sent, and your customers will not notice the difference.",
        async run(target) {
            const variants = typoVariants(target.domain).slice(0, 14);

            const results = await Promise.all(variants.map(async (v) => {
                try {
                    const mx = await withTimeout(dns.resolveMx(v), 4000, "MX lookup");
                    return mx && mx.length ? v : null;
                } catch (e) { return null; }
            }));

            const live = results.filter(Boolean);
            return live.length
                ? {
                    passed: false,
                    evidence: `${live.length} lookalike domain(s) have mail servers configured and can send email today.`,
                    detail: live,
                }
                : { passed: true, evidence: `No mail-configured lookalike found among ${variants.length} common variants.` };
        },
    },
];

/**
 * Common typo-squatting patterns: a dropped character, a doubled character,
 * two adjacent characters swapped, and the handful of substitutions that are
 * hardest to see in a mail client.
 */
function typoVariants(domain) {
    const dot = domain.indexOf(".");
    if (dot < 3) return [];
    const name = domain.slice(0, dot);
    const tld = domain.slice(dot);
    const out = new Set();

    for (let i = 0; i < name.length; i++) out.add(name.slice(0, i) + name.slice(i + 1) + tld);          // omission
    for (let i = 0; i < name.length; i++) out.add(name.slice(0, i) + name[i] + name.slice(i) + tld);    // duplication
    for (let i = 0; i < name.length - 1; i++) {                                                          // transposition
        out.add(name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2) + tld);
    }
    const SUB = { o: "0", l: "1", i: "1", e: "3", a: "@", m: "rn", s: "5" };
    Object.entries(SUB).forEach(([from, to]) => {
        if (name.includes(from)) out.add(name.replace(from, to) + tld);
    });

    out.delete(domain);
    return [...out];
}

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
async function runScan(domainInput, onProgress) {
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

    const target = { domain, hostname: domain, origin: `https://${domain}` };

    const findings = [];
    const inconclusive = [];

    for (let i = 0; i < CHECKS.length; i++) {
        const check = CHECKS[i];
        if (typeof onProgress === "function") {
            onProgress({ index: i, total: CHECKS.length, checkId: check.id, title: check.title });
        }
        try {
            const out = await withTimeout(check.run(target), PER_CHECK_TIMEOUT_MS, check.title);
            findings.push({
                checkId: check.id, domain: check.domain, severity: check.severity,
                title: check.title, why: check.why,
                passed: !!out.passed, evidence: out.evidence || null, detail: out.detail || null,
            });
        } catch (err) {
            // INCONCLUSIVE. Never a pass. See the note at the top of this file.
            inconclusive.push({ checkId: check.id, domain: check.domain, title: check.title, reason: err.message });
        }
    }

    const checksRun = CHECKS.map((c) => ({ id: c.id, domain: c.domain, severity: c.severity }));
    const scores = computeScores(findings, checksRun, inconclusive.map((i) => i.checkId));

    const failed = findings.filter((f) => !f.passed);
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    failed.forEach((f) => { counts[f.severity] += 1; });

    return {
        domain,
        scannedAt: new Date().toISOString(),
        tier: "snapshot",
        status: scores.insufficientCoverage ? "inconclusive" : "complete",
        grade: scores.grade,
        score: scores.score,
        capped: scores.capped,
        capReason: scores.capReason,
        coverageRatio: Number(scores.coverageRatio.toFixed(2)),
        checksRun: CHECKS.length,
        checksCompleted: scores.executed,
        counts,
        totalIssues: failed.length,
        passedCount: findings.filter((f) => f.passed).length,
        domainScores: scores.domainScores,
        inconclusive,
        coverageMap: ALL_DOMAINS,
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
    typoVariants,
    computeScores,
    fetchUrl,
    getCertificate,
    txtRecords,
    withTimeout,
    CHECKS,
    ALL_DOMAINS,
    DOMAIN_NAMES,
    SEVERITY_WEIGHT,
};

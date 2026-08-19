// ─────────────────────────────────────────────────────────────────────────
//  The check catalogue — 58 checks across five files.
//
//    surface.js  13   external attack surface, content, DNS
//    http.js     15   headers and cookies, from one shared homepage fetch
//    tls.js       8   certificates and negotiation
//    email.js    13   SPF, DKIM, DMARC, MTA-STS, CAA
//    intel.js     9   breach intelligence and brand
//
//  By tier: 8 snapshot (the free scan), 11 basic, 39 advanced.
//
//  IDs, domains, severities, tiers and titles match dShield v6.3 exactly.
//  The scoring formula is published on /trust and a customer is invited to
//  recompute any grade by hand, so a severity that differs here from the main
//  product would give the same domain two different grades from one company.
//
//  Two deliberate divergences, both documented where they occur:
//    · TLS-CERT-EXPIRING-28 warns at 14 days rather than 30 (tls.js)
//    · DNS-DNSSEC-49 asks over DNS-over-HTTPS, because Node cannot query
//      DNSKEY at all and the source's approach never worked (surface.js)
//
//  The eight free-tier checks keep the bodies this repo already had, so the
//  free scan's output is unchanged by the port. Where a v6.3 body differed —
//  SURF-GIT-04's match pattern, BRAND-TYPO-59's data source — the existing
//  one won.
// ─────────────────────────────────────────────────────────────────────────

const surface = require("./surface");
const http = require("./http");
const tls = require("./tls");
const email = require("./email");
const intel = require("./intel");

const ALL_CHECKS = [...surface, ...http, ...tls, ...email, ...intel];

/* Fail at load, not at scan time.
   A duplicate id silently overwrites a finding in the results map, which
   produces a scan that is quietly missing a check and gives no clue why. It
   is far cheaper to refuse to start. */
const seen = new Set();
const duplicates = [];
for (const c of ALL_CHECKS) {
    if (seen.has(c.id)) duplicates.push(c.id);
    seen.add(c.id);
}
if (duplicates.length) {
    throw new Error(`Duplicate check id(s) in the catalogue: ${[...new Set(duplicates)].join(", ")}`);
}

/* Tier rank. A higher tier runs everything the lower tiers run PLUS its own,
   never a different set — a tier that is not a superset of the one below is a
   customer paying more and receiving less. Enforced by scripts/verify-checks.js. */
const TIER_RANK = { snapshot: 0, basic: 1, advanced: 2, full_protection: 3 };

/** The checks a given tier runs. Unknown tiers fall back to snapshot. */
function checksForTier(tier = "snapshot") {
    const max = TIER_RANK[tier] ?? 0;
    return ALL_CHECKS.filter((c) => (TIER_RANK[c.minTier] ?? 0) <= max);
}

/* ── scan order ───────────────────────────────────────────────────────────
   Cheap and quiet first, speculative path probing last.

   If a target's firewall decides it has seen enough of us, it does so partway
   through — so whatever ran first is what we still have. Ordering by noise
   means a blocked scan still carries its DNS, certificate and header results
   rather than losing everything.

   These are the checks that REQUEST PATHS NOBODY LINKED TO. They are the
   reason a scan looks like directory brute-forcing to a firewall, and the
   reason this scanner was blocked in task 05a. They run last, two at a time,
   after everything cheap has already been banked. */
const PATH_PROBING = new Set([
    "SURF-ADMIN-02", "SURF-STAGING-03", "SURF-GIT-04", "SURF-ENVFILE-05",
    "SURF-BACKUP-06", "SURF-DIRLIST-07", "SURF-BUCKET-12", "SURF-DEBUG-13",
    "SURF-SECURITYTXT-64",
]);

/* Which other hosts a check talks to. Pacing meant for the customer's server
   must not slow down crt.sh or a breach API — they are different hosts and
   the governor already keeps them separate, but these also need not be
   throttled to two at a time. */
const OFF_TARGET = new Set([
    "BREACH-CREDS-52", "BREACH-EXEC-53", "BREACH-SECRET-54", "BREACH-METADATA-55",
    "SURF-INVENTORY-16", "SURF-TAKEOVER-01", "BRAND-TYPO-58", "BRAND-TYPO-59",
    "SURF-BUCKET-12", "DNS-DNSSEC-49",
]);

const DNS_ONLY = new Set(email.map((c) => c.id));

/** 0 quietest … 4 noisiest. Used to sort, and to pick a batch size. */
function scanRank(check) {
    if (PATH_PROBING.has(check.id)) return 4;              // speculative paths
    if (OFF_TARGET.has(check.id)) return 3;                // other people's APIs
    if (tls.some((c) => c.id === check.id)) return 1;      // one handshake
    if (DNS_ONLY.has(check.id)) return 0;                  // DNS only, no HTTP
    return 2;                                              // the shared homepage fetch
}

/** Quietest first. Stable within a rank so the order is reproducible. */
function orderedForTier(tier = "snapshot") {
    return checksForTier(tier)
        .map((c, i) => ({ c, i, r: scanRank(c) }))
        .sort((a, b) => (a.r - b.r) || (a.i - b.i))
        .map((x) => x.c);
}

module.exports = {
    ALL_CHECKS, checksForTier, orderedForTier, scanRank,
    TIER_RANK, PATH_PROBING, OFF_TARGET,
    BY_FILE: { surface, http, tls, email, intel },
};

// ─────────────────────────────────────────────────────────────────────────
//  Domains 10 & 20 — Breach & Exposure Intelligence, Brand & Digital Risk.
//  9 checks, plus SURF-INVENTORY-16 and SURF-TAKEOVER-01 which are domain 1
//  but built from the same certificate transparency data.
//
//  Ported from dShield v6.3 src/checks/intel.js.
//
//  THREE CHECKS NEED KEYS THIS SITE DOES NOT HAVE and return INCONCLUSIVE
//  until they do — never a pass. An inconclusive check is excluded from
//  scoring on both sides, so their presence costs a customer nothing, while
//  their absence would be a silent gap nobody noticed later.
//
//  A DEPENDENCY THE SOURCE HAS THAT THIS DOES NOT: in v6.3, BRAND-TYPO-59
//  reads the lookalike list that BRAND-TYPO-58 leaves in the scan cache. But
//  -59 is a FREE-tier check and -58 is advanced-only, so on a free scan the
//  data would never exist and -59 would always be inconclusive. Here -59
//  discovers its own candidates, exactly as it already did in this repo.
// ─────────────────────────────────────────────────────────────────────────

const { memo, mapLimit, fetchUrl, withTimeout, typoVariants, ctNames, aSafe, mxSafe, caaSafe, cnameSafe } = require("../net");

/** A JSON GET that treats 404 as an answer rather than an error. */
async function getJson(url, headers = {}) {
    const res = await withTimeout(fetchUrl(url, { maxBytes: 524288, headers, timeout: 8000 }), 10000, "API request");
    if (res.status === 404) return { status: 404, data: null };
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    try { return { status: res.status, data: JSON.parse(res.body) }; }
    catch (e) { throw new Error("Invalid JSON response"); }
}

/** The HIBP domain-search result, fetched once and shared by -52 and -53. */
function hibpDomain(target) {
    return memo(target, "hibp:domain", async () => {
        const key = process.env.HIBP_API_KEY;
        if (!key) return { unavailable: "HIBP_API_KEY is not configured" };
        try {
            const res = await getJson(`https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(target.domain)}`,
                { "hibp-api-key": key });
            return { ok: true, data: res.data };
        } catch (err) { return { unavailable: err.message }; }
    });
}

const EXEC_PREFIXES = ["ceo", "cfo", "coo", "cto", "ciso", "director", "president",
    "finance", "accounts", "payroll", "admin", "md"];

const TAKEOVER_FINGERPRINTS = [
    { cname: /\.s3[.-].*amazonaws\.com$/, service: "AWS S3" },
    { cname: /\.cloudfront\.net$/, service: "CloudFront" },
    { cname: /\.github\.io$/, service: "GitHub Pages" },
    { cname: /\.herokuapp\.com$/, service: "Heroku" },
    { cname: /\.azurewebsites\.net$/, service: "Azure" },
    { cname: /\.netlify\.app$/, service: "Netlify" },
    { cname: /\.myshopify\.com$/, service: "Shopify" },
    { cname: /\.zendesk\.com$/, service: "Zendesk" },
    { cname: /\.fastly\.net$/, service: "Fastly" },
];

const TLDS = ["com", "net", "org", "co", "io", "info", "biz", "online", "site", "shop", "in"];
const HOMOGLYPHS = { o: "0", l: "1", i: "1", e: "3", a: "4", s: "5", g: "9", b: "6" };

function permutations(domain) {
    const parts = domain.split(".");
    const tld = parts.pop();
    const base = parts.join(".");
    if (base.length < 3) return [];
    const out = new Set();

    TLDS.filter((t) => t !== tld).forEach((t) => out.add(`${base}.${t}`));
    for (let i = 1; i < base.length; i += 1) out.add(`${base.slice(0, i)}-${base.slice(i)}.${tld}`);
    for (let i = 0; i < base.length; i += 1) {
        if (base.length > 4) out.add(`${base.slice(0, i)}${base.slice(i + 1)}.${tld}`);
        out.add(`${base.slice(0, i)}${base[i]}${base.slice(i)}.${tld}`);
    }
    for (const [f, t] of Object.entries(HOMOGLYPHS)) {
        if (base.includes(f)) out.add(`${base.replace(new RegExp(f, "g"), t)}.${tld}`);
    }
    for (let i = 0; i < base.length - 1; i += 1) {
        const a = base.split("");
        [a[i], a[i + 1]] = [a[i + 1], a[i]];
        out.add(`${a.join("")}.${tld}`);
    }
    out.delete(domain);
    return [...out];
}

/** Lookalikes that actually resolve. Shared by BRAND-TYPO-58. */
const registeredLookalikes = (target) => memo(target, "brand:registered", async () => {
    const perms = permutations(target.domain).slice(0, 70);
    if (!perms.length) return { tooShort: true };
    const found = (await mapLimit(perms, 8, async (d) => {
        const a = await aSafe(d);
        return (a.ok && a.data.length) ? d : null;
    })).filter(Boolean);
    return { checked: perms.length, registered: found };
});

module.exports = [
    {
        id: "BREACH-CREDS-52",
        domain: 10, severity: "high", minTier: "advanced",
        title: "Employee credentials present in breach corpora",
        why: "Staff reuse passwords. An address of yours in a breach corpus means somebody may already hold a working password for one of your systems, without needing to attack you at all.",
        async run(target) {
            const r = await hibpDomain(target);
            if (r.unavailable) throw new Error(`Breach intelligence unavailable — ${r.unavailable}`);
            if (r.status === 404 || !r.data) return { passed: true, evidence: "No breached accounts were found for this domain." };

            const accounts = Object.keys(r.data);
            if (!accounts.length) return { passed: true, evidence: "No breached accounts were found for this domain." };

            const breaches = new Set();
            Object.values(r.data).forEach((list) => (list || []).forEach((b) => breaches.add(b)));
            return {
                passed: false,
                evidence: `${accounts.length} address(es) at this domain appear across ${breaches.size} breach(es).`,
                detail: { accountCount: accounts.length, breachCount: breaches.size, breaches: [...breaches].slice(0, 10) },
            };
        },
    },

    {
        id: "BREACH-EXEC-53",
        domain: 10, severity: "critical", minTier: "advanced",
        title: "Senior personnel credentials exposed",
        why: "An exposed finance or executive address is what invoice fraud is built on. Those accounts can authorise payments, and a criminal who knows one is compromised will start there.",
        async run(target) {
            const r = await hibpDomain(target);
            if (r.unavailable) throw new Error(`Breach intelligence unavailable — ${r.unavailable}`);
            if (r.status === 404 || !r.data) return { passed: true, evidence: "No senior accounts appear in breach data." };

            const exec = Object.keys(r.data).filter((a) => EXEC_PREFIXES.some((p) => a.toLowerCase().startsWith(p)));
            return exec.length
                ? { passed: false, evidence: `${exec.length} address(es) matching senior roles appear in breach data.`, detail: { count: exec.length } }
                : { passed: true, evidence: "No senior accounts appear in breach data." };
        },
    },

    {
        id: "BREACH-SECRET-54",
        domain: 10, severity: "critical", minTier: "advanced",
        title: "Credentials found in public code repository",
        why: "A key committed to a public repository is found within minutes by automated scanners. Deleting the file does not help — it stays in the history unless the history itself is rewritten.",
        async run(target) {
            const token = process.env.GITHUB_TOKEN;
            if (!token) throw new Error("Repository scanning unavailable — GITHUB_TOKEN is not configured");

            const patterns = [
                `"${target.domain}" AKIA`,
                `"${target.domain}" password`,
                `"${target.domain}" api_key`,
                `"${target.domain}" BEGIN RSA PRIVATE KEY`,
            ];

            const hits = [];
            for (const query of patterns) {
                try {
                    const res = await getJson(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=5`,
                        { Authorization: `Bearer ${token}` });
                    if (res.data && res.data.total_count > 0) {
                        hits.push({ count: res.data.total_count, repos: (res.data.items || []).slice(0, 2).map((i) => i.repository.full_name) });
                    }
                } catch (err) {
                    if (/403|429/.test(err.message)) throw new Error(`Repository search rate-limited: ${err.message}`);
                }
                await new Promise((r) => setTimeout(r, 1500));   // GitHub search allows 10 requests a minute
            }

            return hits.length
                // A search hit is not proof of a live secret; it needs a person to confirm.
                ? { passed: false, evidence: `${hits.length} credential pattern(s) matched in public repositories. Each needs confirming by hand.`, detail: { hits } }
                : { passed: true, evidence: "No credentials were found in public repositories." };
        },
    },

    {
        /* One of the eight free-tier checks. Body kept as it already was in
           this repo so the free scan's output does not change. */
        id: "BREACH-METADATA-55",
        domain: 10, severity: "medium", minTier: "snapshot",
        title: "Internal information disclosed in public sources",
        why: "Every certificate issued for your domain is published in a public log. Names like vpn, jenkins, staging or backup tell an attacker where to aim before they touch you.",
        async run(target) {
            const ct = await ctNames(target);
            if (!ct.ok) throw new Error(ct.error);

            const SENSITIVE = /(^|[.-])(vpn|jenkins|gitlab|jira|staging|stage|dev|test|uat|admin|internal|intranet|backup|db|database|sql|mail|smtp|ftp|rdp|citrix|sonar|nexus|grafana|kibana)([.-]|$)/;
            const flagged = [...ct.names].filter((n) => SENSITIVE.test(n.replace(`.${target.domain}`, "")));

            return flagged.length
                ? { passed: false, evidence: `${flagged.length} internal-looking hostname(s) are published in certificate transparency logs.`, detail: flagged.slice(0, 8) }
                : { passed: true, evidence: `${ct.names.size} hostname(s) found in public certificate logs, none obviously internal.` };
        },
    },

    {
        id: "SURF-INVENTORY-16",
        domain: 1, severity: "medium", minTier: "advanced",
        title: "Internet-facing assets exceed documented inventory",
        why: "Most organisations are surprised by this number. You cannot protect, patch or monitor a host you had forgotten you were running.",
        async run(target) {
            const ct = await ctNames(target);
            if (!ct.ok) throw new Error(`Asset discovery requires certificate transparency data: ${ct.error}`);

            const candidates = [...ct.names].filter((n) => n.endsWith(target.domain) && !n.startsWith("*")).slice(0, 80);
            const live = (await mapLimit(candidates, 8, async (host) => {
                const a = await aSafe(host);
                return (a.ok && a.data.length) ? host : null;
            })).filter(Boolean);

            return live.length <= 10
                ? { passed: true, evidence: `${live.length} live host(s) discovered.`, detail: { liveCount: live.length, hosts: live } }
                : { passed: false, evidence: `${live.length} live hosts discovered across ${candidates.length} certificate names.`, detail: { liveCount: live.length, hosts: live.slice(0, 30) } };
        },
    },

    {
        id: "SURF-TAKEOVER-01",
        domain: 1, severity: "critical", minTier: "advanced",
        title: "Subdomain vulnerable to takeover",
        why: "A DNS record still pointing at a service you stopped paying for can be claimed by anyone. They then host whatever they like on a genuine address of yours, with a valid certificate.",
        async run(target) {
            const ct = await ctNames(target);
            if (!ct.ok) throw new Error(`Takeover detection requires certificate transparency data: ${ct.error}`);

            const candidates = [...ct.names]
                .filter((n) => n.endsWith(target.domain) && !n.startsWith("*") && n !== target.domain)
                .slice(0, 60);

            const dangling = (await mapLimit(candidates, 6, async (host) => {
                const cname = await cnameSafe(host);
                if (!cname.ok || !cname.data.length) return null;
                const dest = cname.data[0];
                const fp = TAKEOVER_FINGERPRINTS.find((f) => f.cname.test(dest));
                if (!fp) return null;

                // The CNAME points at a known third-party service. Does that
                // service actually still hold the name?
                const destA = await aSafe(dest);
                if (destA.ok && destA.data.length === 0) return { host, target: dest, service: fp.service };
                if (!destA.ok) return { host, target: dest, service: fp.service, unconfirmed: true };
                return null;
            })).filter(Boolean);

            return dangling.length
                ? { passed: false, evidence: `${dangling[0].host} points at ${dangling[0].target} (${dangling[0].service}), which appears unclaimed.`, detail: { dangling } }
                : { passed: true, evidence: "No dangling third-party CNAMEs were found." };
        },
    },

    {
        id: "BRAND-TYPO-58",
        domain: 20, severity: "medium", minTier: "advanced",
        title: "Lookalike domains registered",
        why: "A registered misspelling of your domain is somebody preparing to be mistaken for you. Most are bought speculatively; some are bought for a reason.",
        async run(target) {
            const r = await registeredLookalikes(target);
            if (r.tooShort) throw new Error("Domain too short for permutation analysis");
            return r.registered.length
                ? { passed: false, evidence: `${r.registered.length} lookalike domain(s) are registered, including ${r.registered.slice(0, 3).join(", ")}.`, detail: { checked: r.checked, registered: r.registered.slice(0, 25) } }
                : { passed: true, evidence: `No lookalike domains registered among ${r.checked} variants checked.` };
        },
    },

    {
        /* One of the eight free-tier checks. Self-contained on purpose — see
           the note at the top of this file. */
        id: "BRAND-TYPO-59",
        domain: 20, severity: "high", minTier: "snapshot",
        title: "Lookalike domain configured for email",
        why: "A misspelling of your domain that is merely registered is a nuisance. One with mail servers configured is an invoice-fraud campaign waiting to be sent, and your customers will not notice the difference.",
        async run(target) {
            const variants = typoVariants(target.domain).slice(0, 14);
            const live = (await mapLimit(variants, 6, async (v) => {
                const mx = await mxSafe(v);
                return (mx.ok && mx.data.length) ? v : null;
            })).filter(Boolean);

            return live.length
                ? { passed: false, evidence: `${live.length} lookalike domain(s) have mail servers configured and can send email today.`, detail: live }
                : { passed: true, evidence: `No mail-configured lookalike found among ${variants.length} common variants.` };
        },
    },

    {
        id: "BRAND-CT-MONITOR-63",
        domain: 20, severity: "low", minTier: "advanced",
        title: "No monitoring of certificate issuance for your brand",
        why: "Certificates are issued for your domain in public logs. If nobody is watching them, a certificate obtained fraudulently in your name goes unnoticed until it is used.",
        async run(target) {
            // A CAA iodef record is the only externally observable sign that an
            // organisation is watching certificate issuance at all.
            const caa = await memo(target, "caa", () => caaSafe(target.domain));
            if (!caa.ok) throw new Error(`CAA lookup failed: ${caa.error}`);
            return caa.data.some((c) => c.iodef)
                ? { passed: true, evidence: "A CAA iodef reporting address is configured." }
                : { passed: false, evidence: "No certificate issuance monitoring was detected for this domain." };
        },
    },
];

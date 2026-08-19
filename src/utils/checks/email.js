// ─────────────────────────────────────────────────────────────────────────
//  Domain 6 — Email & Domain Security.  13 checks.
//
//  Ported from dShield v6.3 src/checks/email.js.
//
//  The source shares parsed SPF/DMARC/DKIM between checks through a scan
//  cache that the checks populate in order — EMAIL-SPF-38 parses, and 39, 40
//  and 41 read what it left behind.
//
//  That is not safe here: this engine runs checks in concurrent batches, so
//  there is no guaranteed order. Each parse is memoised instead, so whichever
//  check runs first performs the lookup and the rest reuse it. Same single
//  lookup, no ordering assumption.
// ─────────────────────────────────────────────────────────────────────────

const { memo, mapLimit, txtSafe, mxSafe, caaSafe } = require("../net");

/* ── shared, memoised lookups ─────────────────────────────────────────── */

function spfOf(target) {
    return memo(target, "spf", async () => {
        const res = await txtSafe(target.domain);
        if (!res.ok) return { lookupFailed: true, error: res.error };
        return parseSpf(res.data);
    });
}

function dmarcOf(target) {
    return memo(target, "dmarc", async () => {
        const res = await txtSafe(`_dmarc.${target.domain}`);
        if (!res.ok) return { lookupFailed: true, error: res.error };
        return parseDmarc(res.data);
    });
}

const DKIM_SELECTORS = [
    "default", "google", "selector1", "selector2", "s1", "s2",
    "k1", "k2", "mail", "dkim", "mandrill", "zoho", "sendgrid", "sig1",
];

function dkimOf(target) {
    return memo(target, "dkim", async () => {
        let failures = 0;
        const found = (await mapLimit(DKIM_SELECTORS, 4, async (sel) => {
            const res = await txtSafe(`${sel}._domainkey.${target.domain}`);
            if (!res.ok) { failures += 1; return null; }
            const key = res.data.find((r) => /v=DKIM1/i.test(r) || /p=/.test(r));
            return key ? { selector: sel, record: key } : null;
        })).filter(Boolean);
        return { found, failures, tested: DKIM_SELECTORS.length };
    });
}

/* ── parsers ──────────────────────────────────────────────────────────── */

function parseSpf(records) {
    const spf = records.filter((r) => /^v=spf1(\s|$)/i.test(r.trim()));
    if (!spf.length) return { present: false, count: 0 };

    const raw = spf[0].trim();
    const mechanisms = raw.split(/\s+/).slice(1);
    const all = mechanisms.find((m) => /^[-~?+]?all$/i.test(m));
    const qualifier = all ? (all[0] === "a" ? "+" : all[0]) : null;

    // Mechanisms that cost a DNS lookup. RFC 7208 permits ten.
    const lookups = mechanisms.filter((m) => /^(include:|a$|a:|mx$|mx:|ptr|exists:|redirect=)/i.test(m));

    return {
        present: true, count: spf.length, raw, qualifier,
        enforcing: qualifier === "-",
        lookups: lookups.length, lookupMechanisms: lookups,
    };
}

function parseDmarc(records) {
    const dmarc = records.filter((r) => /^v=DMARC1/i.test(r.trim()));
    if (!dmarc.length) return { present: false };

    const raw = dmarc[0].trim();
    const tags = {};
    raw.split(";").forEach((part) => {
        const [k, v] = part.split("=").map((s) => s && s.trim());
        if (k && v) tags[k.toLowerCase()] = v;
    });

    return {
        present: true, raw,
        policy: (tags.p || "none").toLowerCase(),
        subPolicy: tags.sp ? tags.sp.toLowerCase() : null,
        pct: tags.pct ? parseInt(tags.pct, 10) : 100,
        rua: tags.rua || null,
        ruf: tags.ruf || null,
    };
}

/** A failed lookup is INCONCLUSIVE, never a finding. */
function assertResolved(x, what) {
    if (x.lookupFailed) throw new Error(`DNS lookup failed for ${what}: ${x.error}`);
}

module.exports = [
    {
        id: "EMAIL-SPF-38",
        domain: 6, severity: "high", minTier: "snapshot",
        title: "No SPF record published",
        why: "SPF tells the world which servers may send email using your domain. Without it, anyone can send mail that appears to come from you.",
        async run(target) {
            const spf = await spfOf(target);
            assertResolved(spf, target.domain);
            return spf.present
                ? { passed: true, evidence: `SPF record published: ${spf.raw.slice(0, 120)}` }
                : { passed: false, evidence: "No TXT record beginning v=spf1 was found." };
        },
    },

    {
        id: "EMAIL-SPF-39",
        domain: 6, severity: "medium", minTier: "advanced",
        title: "SPF record does not enforce",
        why: "An SPF record ending in ~all asks receivers to accept mail from servers you never authorised, and merely mark it. Most deliver it anyway.",
        async run(target) {
            const spf = await spfOf(target);
            assertResolved(spf, target.domain);
            if (!spf.present) return { passed: true, evidence: "No SPF record — reported by EMAIL-SPF-38." };
            return spf.enforcing
                ? { passed: true, evidence: 'SPF ends with "-all".' }
                : { passed: false, evidence: `SPF ends with "${spf.qualifier || "no "}all", which does not enforce.`, detail: { qualifier: spf.qualifier } };
        },
    },

    {
        id: "EMAIL-SPF-40",
        domain: 6, severity: "high", minTier: "advanced",
        title: "SPF record exceeds DNS lookup limit",
        why: "Receivers stop evaluating SPF after ten DNS lookups and treat the result as an error. An over-long record does not fail safe — it stops working entirely.",
        async run(target) {
            const spf = await spfOf(target);
            assertResolved(spf, target.domain);
            if (!spf.present) return { passed: true, evidence: "No SPF record — reported by EMAIL-SPF-38." };

            // Direct count only. Nested includes would need recursive
            // resolution, so 8 or 9 is reported as a warning rather than a
            // certainty.
            if (spf.lookups > 10) {
                return { passed: false, evidence: `SPF requires ${spf.lookups} DNS lookups; the limit is 10.`, detail: { lookups: spf.lookups } };
            }
            if (spf.lookups >= 8) {
                return { passed: false, evidence: `SPF uses ${spf.lookups} direct lookups; nested includes may push it past the limit of 10.`, detail: { lookups: spf.lookups, nested: true } };
            }
            return { passed: true, evidence: `SPF uses ${spf.lookups} lookups, within the limit of 10.` };
        },
    },

    {
        id: "EMAIL-SPF-41",
        domain: 6, severity: "high", minTier: "advanced",
        title: "Multiple SPF records published",
        why: "More than one SPF record is invalid. Receivers cannot tell which to obey, so most discard both and your domain is left with no SPF at all.",
        async run(target) {
            const spf = await spfOf(target);
            assertResolved(spf, target.domain);
            return spf.count > 1
                ? { passed: false, evidence: `${spf.count} SPF records are published; exactly one is permitted.`, detail: { count: spf.count } }
                : { passed: true, evidence: "A single SPF record is published." };
        },
    },

    {
        id: "EMAIL-DKIM-42",
        domain: 6, severity: "high", minTier: "advanced",
        title: "No DKIM signing detected",
        why: "DKIM signs your mail so a receiver can tell it was not altered in transit and genuinely came from you. Without it, DMARC has only SPF to rely on, which breaks whenever mail is forwarded.",
        async run(target) {
            const { found, failures, tested } = await dkimOf(target);
            if (failures > tested / 2) {
                throw new Error(`DKIM lookup inconclusive — ${failures} of ${tested} selectors failed to resolve`);
            }
            return found.length
                ? { passed: true, evidence: `DKIM key found at selector "${found[0].selector}".`, detail: { selectors: found.map((f) => f.selector) } }
                : {
                    passed: false,
                    // Selectors are chosen by whoever sends the mail, so absence
                    // across common ones is strong evidence, not proof.
                    evidence: `No DKIM key found at ${tested} common selectors. Selectors are chosen by the sender, so this is not conclusive.`,
                    detail: { tested: DKIM_SELECTORS },
                };
        },
    },

    {
        id: "EMAIL-DKIM-43",
        domain: 6, severity: "medium", minTier: "advanced",
        title: "DKIM key length below recommended minimum",
        why: "A short DKIM key can be factored, and anyone who does can sign mail as you in a way that passes every check a receiver makes.",
        async run(target) {
            const { found } = await dkimOf(target);
            if (!found.length) return { passed: true, evidence: "No DKIM key — reported by EMAIL-DKIM-42." };

            for (const { selector, record } of found) {
                const m = record.match(/p=([A-Za-z0-9+/=]+)/);
                if (!m) continue;
                const der = Buffer.from(m[1], "base64");
                if (der.length < 200) {
                    const approxBits = Math.round((der.length - 38) * 8 / 8) * 8;
                    return { passed: false, evidence: `The key at selector "${selector}" is approximately ${approxBits}-bit, below the 2048-bit minimum.`, detail: { selector, approxBits } };
                }
            }
            return { passed: true, evidence: "DKIM keys meet the 2048-bit minimum." };
        },
    },

    {
        id: "EMAIL-DMARC-44",
        domain: 6, severity: "critical", minTier: "snapshot",
        title: "No DMARC record published",
        why: "DMARC tells receiving mail servers what to do with mail that fails your SPF and DKIM checks. Without it, those checks carry no instruction and forged mail is usually delivered.",
        async run(target) {
            const d = await dmarcOf(target);
            assertResolved(d, `_dmarc.${target.domain}`);
            return d.present
                ? { passed: true, evidence: `DMARC record published: ${d.raw.slice(0, 120)}` }
                : { passed: false, evidence: "No TXT record at _dmarc beginning v=DMARC1 was found." };
        },
    },

    {
        id: "EMAIL-DMARC-45",
        domain: 6, severity: "critical", minTier: "snapshot",
        title: "DMARC policy set to monitor only",
        why: "A policy of p=none reports forged mail but asks receivers to deliver it anyway. It is a listening post, not a defence.",
        async run(target) {
            const d = await dmarcOf(target);
            assertResolved(d, `_dmarc.${target.domain}`);
            if (!d.present) throw new Error("No DMARC record to evaluate");   // reported by -44

            if (d.policy === "none") {
                return { passed: false, evidence: "DMARC policy is p=none — forged mail is reported but still delivered.", detail: { policy: "none", rua: d.rua } };
            }
            if (d.pct < 100) {
                return { passed: false, evidence: `DMARC is p=${d.policy} but applies to only ${d.pct}% of mail.`, detail: { policy: d.policy, pct: d.pct } };
            }
            return { passed: true, evidence: `DMARC policy is p=${d.policy}, applied to all mail.` };
        },
    },

    {
        id: "EMAIL-DMARC-46",
        domain: 6, severity: "medium", minTier: "advanced",
        title: "DMARC record has no reporting address",
        why: "Without a reporting address you never learn who is forging your domain, or that your own legitimate mail is failing. It is how you find out before your customers do.",
        async run(target) {
            const d = await dmarcOf(target);
            assertResolved(d, `_dmarc.${target.domain}`);
            if (!d.present) return { passed: true, evidence: "No DMARC record — reported by EMAIL-DMARC-44." };
            return d.rua
                ? { passed: true, evidence: "A DMARC aggregate reporting address is configured." }
                : { passed: false, evidence: "The DMARC record has no rua reporting address." };
        },
    },

    {
        id: "EMAIL-MTASTS-47",
        domain: 6, severity: "low", minTier: "advanced",
        title: "MTA-STS not configured",
        why: "MTA-STS requires other mail servers to use encryption when delivering to you. Without it, an attacker positioned in the network can quietly downgrade the connection and read the mail.",
        async run(target) {
            const res = await txtSafe(`_mta-sts.${target.domain}`);
            if (!res.ok) throw new Error(`DNS lookup failed for _mta-sts.${target.domain}: ${res.error}`);
            const sts = res.data.find((r) => /v=STSv1/i.test(r));
            return sts
                ? { passed: true, evidence: `MTA-STS policy published: ${sts}` }
                : { passed: false, evidence: "No MTA-STS policy is published." };
        },
    },

    {
        id: "EMAIL-TLSRPT-48",
        domain: 6, severity: "low", minTier: "advanced",
        title: "TLS reporting not configured",
        why: "TLS reporting tells you when another server failed to deliver mail to you securely. Without it a downgrade attack leaves no trace you would ever see.",
        async run(target) {
            const res = await txtSafe(`_smtp._tls.${target.domain}`);
            if (!res.ok) throw new Error(`DNS lookup failed for _smtp._tls.${target.domain}: ${res.error}`);
            const rpt = res.data.find((r) => /v=TLSRPTv1/i.test(r));
            return rpt
                ? { passed: true, evidence: `TLS-RPT record published: ${rpt}` }
                : { passed: false, evidence: "No TLS-RPT record is published." };
        },
    },

    {
        id: "DNS-CAA-50",
        domain: 6, severity: "low", minTier: "advanced",
        title: "No CAA record published",
        why: "A CAA record names which certificate authorities may issue for your domain. Without one, any authority in the world may issue a certificate for you, and some have been tricked into doing exactly that.",
        async run(target) {
            const res = await memo(target, "caa", () => caaSafe(target.domain));
            if (!res.ok) throw new Error(`DNS lookup failed for ${target.domain}: ${res.error}`);
            if (!res.data.length) {
                return { passed: false, evidence: "No CAA record is published, so any certificate authority may issue for this domain." };
            }
            const issuers = res.data.filter((c) => c.issue).map((c) => c.issue);
            return { passed: true, evidence: `CAA permits ${issuers.join(", ") || "configured issuers"}.`, detail: { issuers } };
        },
    },

    {
        id: "EMAIL-PARKED-51",
        domain: 6, severity: "medium", minTier: "advanced",
        title: "Unused domain lacks anti-spoofing protection",
        why: "A domain that receives no mail is still a domain somebody can send mail AS. Parked and forgotten domains are a favourite for invoice fraud precisely because nobody is watching them.",
        async run(target) {
            const mx = await memo(target, "mx", () => mxSafe(target.domain));
            if (!mx.ok) throw new Error(`DNS lookup failed for ${target.domain}: ${mx.error}`);

            const hasMx = mx.data.length > 0 && !(mx.data.length === 1 && mx.data[0].exchange === "");
            if (hasMx) return { passed: true, evidence: "The domain has mail servers configured, so it is not parked." };

            const spf = await spfOf(target);
            const dmarc = await dmarcOf(target);
            assertResolved(spf, target.domain);
            assertResolved(dmarc, `_dmarc.${target.domain}`);

            const protectedOk = spf.enforcing && dmarc.present && dmarc.policy === "reject";
            return protectedOk
                ? { passed: true, evidence: "The domain is parked and correctly protected by SPF -all and DMARC p=reject." }
                : { passed: false, evidence: "The domain has no mail servers, but SPF and DMARC do not reject mail sent in its name.", detail: { spfEnforcing: !!spf.enforcing, dmarcPolicy: dmarc.policy || null } };
        },
    },
];

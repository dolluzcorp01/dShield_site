// ─────────────────────────────────────────────────────────────────────────
//  Domain 4 — Encryption & Certificates.  8 checks.
//
//  Ported from dShield v6.3 src/checks/tls.js. IDs, domains, severities and
//  tiers match the source exactly: the scoring formula is published on
//  /trust and a customer is invited to recompute a grade by hand, so a
//  severity that differs here from the main product gives the same domain
//  two different grades from the same company.
//
//  ONE DELIBERATE DIVERGENCE — see TLS-CERT-EXPIRING-28 below.
// ─────────────────────────────────────────────────────────────────────────

const { memo, tlsHandshake, withTimeout } = require("../net");

const WEAK_CIPHERS = /(NULL|EXPORT|DES-CBC|RC4|MD5|anon|3DES)/i;
const OBSOLETE_PROTOCOLS = ["TLSv1", "TLSv1.1"];

/** One handshake, shared by every check in this file. */
function handshake(target) {
    return memo(target, `tls:${target.hostname}`, async () => {
        try { return await tlsHandshake(target.hostname); }
        catch (err) { return { error: err.message }; }
    });
}

const daysUntil = (d) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);

function chainDepth(cert) {
    let depth = 0, node = cert;
    const seen = new Set();
    while (node && node.issuerCertificate && !seen.has(node.fingerprint)) {
        seen.add(node.fingerprint);
        if (node.issuerCertificate.fingerprint === node.fingerprint) break;   // self-signed root
        node = node.issuerCertificate;
        depth += 1;
    }
    return depth;
}

module.exports = [
    {
        id: "TLS-CERT-EXPIRED-29",
        domain: 4, severity: "critical", minTier: "snapshot",
        title: "Certificate has expired",
        why: "An expired certificate makes every visitor's browser show a full-page security warning. Most people leave, and those who continue have been taught to click through exactly the warning that protects them.",
        async run(target) {
            const hs = await handshake(target);
            if (hs.error) throw new Error(`TLS handshake failed: ${hs.error}`);
            const days = daysUntil(hs.cert.valid_to);
            return days < 0
                ? { passed: false, evidence: `Certificate expired ${Math.abs(days)} day(s) ago, on ${new Date(hs.cert.valid_to).toDateString()}.`, detail: { validTo: hs.cert.valid_to, daysOverdue: Math.abs(days) } }
                : { passed: true, evidence: `Certificate valid until ${new Date(hs.cert.valid_to).toDateString()}.` };
        },
    },

    {
        id: "TLS-CERT-EXPIRING-28",
        domain: 4, severity: "high", minTier: "snapshot",
        title: "Certificate expiring soon",
        why: "Certificate renewal is the single most common cause of unplanned outage, and it always happens on a weekend.",
        async run(target) {
            const hs = await handshake(target);
            if (hs.error) throw new Error(`TLS handshake failed: ${hs.error}`);
            const days = daysUntil(hs.cert.valid_to);
            if (days < 0) throw new Error("Certificate already expired");   // reported by -29

            /* FOURTEEN DAYS, NOT THIRTY — a deliberate divergence from v6.3.
               Let's Encrypt issues 90-day certificates and renews at 30 days
               remaining, and most other ACME issuers behave similarly. A
               thirty-day threshold therefore fires on a perfectly healthy
               site in the middle of its normal renewal window — tested
               against stripe.com, which sat at 29 days while renewing
               automatically. Do not "restore" this to 30 to match the
               source. */
            return days <= 14
                ? { passed: false, evidence: `Certificate expires in ${days} day(s).`, detail: { validTo: hs.cert.valid_to, daysRemaining: days } }
                : { passed: true, evidence: `Certificate has ${days} day(s) remaining.` };
        },
    },

    {
        id: "TLS-CERT-SELFSIGNED-30",
        domain: 4, severity: "high", minTier: "advanced",
        title: "Self-signed certificate on a public service",
        why: "A certificate nobody recognised issued proves nothing about who you are. Every browser refuses it, and visitors are asked to trust a stranger.",
        async run(target) {
            const hs = await handshake(target);
            if (hs.error) throw new Error(`TLS handshake failed: ${hs.error}`);
            const c = hs.cert;
            const selfSigned = JSON.stringify(c.issuer) === JSON.stringify(c.subject);
            return (selfSigned || hs.authError === "DEPTH_ZERO_SELF_SIGNED_CERT")
                ? { passed: false, evidence: "The certificate is self-signed — its issuer is itself.", detail: { authError: hs.authError } }
                : { passed: true, evidence: `Issued by ${(c.issuer && (c.issuer.O || c.issuer.CN)) || "a recognised authority"}.` };
        },
    },

    {
        id: "TLS-CHAIN-31",
        domain: 4, severity: "medium", minTier: "advanced",
        title: "Incomplete certificate chain",
        why: "Desktop browsers often paper over a missing intermediate certificate by fetching it themselves. Mobile clients and API callers usually do not, so the site works on your laptop and fails on a phone.",
        async run(target) {
            const hs = await handshake(target);
            if (hs.error) throw new Error(`TLS handshake failed: ${hs.error}`);
            if (hs.authError === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || hs.authError === "UNABLE_TO_GET_ISSUER_CERT") {
                return { passed: false, evidence: "An intermediate certificate is missing from the chain.", detail: { authError: hs.authError } };
            }
            const depth = chainDepth(hs.cert);
            if (depth === 0 && !hs.authorized) {
                return { passed: false, evidence: "No intermediate certificates are served.", detail: { chainDepth: depth } };
            }
            return { passed: true, evidence: `Chain depth ${depth}, validates.` };
        },
    },

    {
        id: "TLS-HOSTNAME-32",
        domain: 4, severity: "high", minTier: "advanced",
        title: "Certificate does not match hostname",
        why: "A certificate issued for a different name cannot prove this server is yours, and browsers say so in the strongest language they have.",
        async run(target) {
            const hs = await handshake(target);
            if (hs.error) throw new Error(`TLS handshake failed: ${hs.error}`);
            const names = String(hs.cert.subjectaltname || "").split(",").map((s) => s.trim().replace(/^DNS:/, "")).filter(Boolean);
            const cn = hs.cert.subject && hs.cert.subject.CN;
            if (cn && !names.includes(cn)) names.push(cn);

            const matches = names.some((n) => {
                if (n === target.domain) return true;
                if (n.startsWith("*.")) return target.domain.split(".").slice(1).join(".") === n.slice(2);
                return false;
            });
            return matches
                ? { passed: true, evidence: "The hostname matches the certificate." }
                : { passed: false, evidence: `The certificate is valid for ${names.slice(0, 4).join(", ")}, not ${target.domain}.`, detail: { sans: names.slice(0, 20) } };
        },
    },

    {
        id: "TLS-PROTO-33",
        domain: 4, severity: "high", minTier: "advanced",
        title: "Obsolete TLS protocol versions enabled",
        why: "TLS 1.0 and 1.1 are broken, withdrawn, and fail every current compliance standard. Leaving them enabled helps nobody: no browser still in use needs them.",
        async run(target) {
            const accepted = [];
            for (const proto of OBSOLETE_PROTOCOLS) {
                try {
                    await withTimeout(tlsHandshake(target.hostname, { minVersion: proto, maxVersion: proto }), 9000, `${proto} probe`);
                    accepted.push(proto);
                } catch (e) { /* refused, which is the good outcome */ }
            }
            target._obsoleteProtocols = accepted;
            return accepted.length
                ? { passed: false, evidence: `The server accepts ${accepted.join(" and ")}.`, detail: { protocols: accepted } }
                : { passed: true, evidence: "TLS 1.1 and below are refused." };
        },
    },

    {
        id: "TLS-CIPHER-34",
        domain: 4, severity: "medium", minTier: "advanced",
        title: "Weak cipher suites accepted",
        why: "A cipher suite is only as strong as the weakest one the server will agree to. An attacker chooses which to ask for.",
        async run(target) {
            let weak = null;
            try {
                const hs = await withTimeout(
                    tlsHandshake(target.hostname, { ciphers: "DEFAULT:@SECLEVEL=0:!TLSv1.3", maxVersion: "TLSv1.2" }),
                    9000, "Weak cipher probe");
                if (hs.cipher && WEAK_CIPHERS.test(hs.cipher.name)) weak = hs.cipher.name;
            } catch (e) { /* refused, which is the good outcome */ }
            return weak
                ? { passed: false, evidence: `The server accepts the weak cipher ${weak}.`, detail: { cipher: weak } }
                : { passed: true, evidence: "No weak cipher suite was negotiated." };
        },
    },

    {
        id: "TLS-WEAKKEY-35",
        domain: 4, severity: "medium", minTier: "advanced",
        title: "Certificate key length below current standard",
        why: "Key sizes that were sound a decade ago are now within reach of rented computing power. This is the cheapest thing on this list to fix: it costs one certificate reissue.",
        async run(target) {
            const hs = await handshake(target);
            if (hs.error) throw new Error(`TLS handshake failed: ${hs.error}`);
            const bits = hs.cert.bits;
            if (!bits) throw new Error("Certificate key size was not reported");
            const type = hs.cert.asn1Curve ? "ECDSA" : "RSA";
            const min = type === "ECDSA" ? 256 : 2048;
            return bits < min
                ? { passed: false, evidence: `${type} ${bits}-bit key, below the ${min}-bit minimum.`, detail: { type, bits, minimum: min } }
                : { passed: true, evidence: `${type} ${bits}-bit key.` };
        },
    },
];

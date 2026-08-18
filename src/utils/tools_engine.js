// ─────────────────────────────────────────────────────────────────────────
//  tools_engine — the five free public tools.
//
//  Each is a separate front door with its own page and its own search
//  traffic. They are not a dropdown on the scan page, and that is
//  deliberate: someone searching "check if my email can be spoofed" arrives
//  on a page that answers exactly that, and leaves knowing our name.
//
//  All five are free forever, need no login, no email and no card, and cost
//  us nothing to run.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");
const dns = require("dns").promises;
const {
    fetchUrl, getCertificate, txtRecords, withTimeout,
    normaliseDomain, typoVariants,
} = require("./scan_engine");

// ── 1 · Password Exposure Check ──────────────────────────────────────────
//
// k-anonymity, and it is not a detail — it is the whole reason this tool is
// defensible. The password is hashed in the browser. Only the FIRST FIVE
// characters of that hash are sent to us, and we forward only those five to
// the range API. We receive a list of hash suffixes and count matches.
//
// We never see the password. We never see the full hash. We could not
// reconstruct it if we wanted to, and neither could anyone reading our logs.
//
// This function therefore takes a 5-character prefix, never a password. If
// a future change makes it accept a password, the promise on the page
// becomes a lie.

async function passwordPrefix(prefix) {
    if (!/^[0-9A-F]{5}$/i.test(String(prefix || ""))) {
        throw Object.assign(new Error("Expected a five-character hash prefix."), { code: "BAD_PREFIX" });
    }
    const res = await withTimeout(
        fetchUrl(`https://api.pwnedpasswords.com/range/${prefix.toUpperCase()}`, { maxBytes: 1048576 }),
        10000, "Password range lookup");

    if (res.status !== 200) {
        throw Object.assign(new Error("The breach index could not be reached. Try again shortly."),
            { code: "UPSTREAM" });
    }
    // Each line is SUFFIX:COUNT
    const suffixes = {};
    String(res.body || "").split("\n").forEach((line) => {
        const [suffix, count] = line.trim().split(":");
        if (suffix) suffixes[suffix.toUpperCase()] = parseInt(count, 10) || 0;
    });
    return { suffixes };
}

// ── 2 · Email Spoofing Test ──────────────────────────────────────────────

async function emailSpoofing(domainInput) {
    const parsed = normaliseDomain(domainInput);
    if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: "INVALID_DOMAIN" });
    const domain = parsed.domain;

    const out = { domain, records: {}, issues: [], verdict: null };

    // SPF
    try {
        const txt = await withTimeout(txtRecords(domain), 8000, "SPF lookup");
        const spf = txt.find((r) => r.toLowerCase().startsWith("v=spf1"));
        if (spf) {
            const all = (/[~\-+?]all/.exec(spf) || [])[0];
            out.records.spf = {
                present: true, value: spf,
                policy: all === "-all" ? "strict" : all === "~all" ? "soft" : all === "+all" ? "open" : "none",
            };
            if (all === "+all") out.issues.push({ severity: "critical", text: "Your SPF record ends in +all, which authorises the entire internet to send mail as you." });
            else if (!all) out.issues.push({ severity: "medium", text: "Your SPF record has no all mechanism, so receivers are given no instruction about unlisted senders." });
            else if (all === "~all") out.issues.push({ severity: "low", text: "SPF is set to soft fail. Mail from unlisted servers is usually still delivered, to the spam folder." });
        } else {
            out.records.spf = { present: false };
            out.issues.push({ severity: "high", text: "No SPF record. Nothing states which servers may send email using your domain." });
        }
    } catch (e) {
        out.records.spf = { present: null, error: "Could not be checked" };
    }

    // DMARC
    try {
        const txt = await withTimeout(txtRecords(`_dmarc.${domain}`), 8000, "DMARC lookup").catch(() => []);
        const dmarc = txt.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
        if (dmarc) {
            const policy = ((/p\s*=\s*(none|quarantine|reject)/i.exec(dmarc) || [])[1] || "").toLowerCase();
            out.records.dmarc = { present: true, value: dmarc, policy };
            if (policy === "none") out.issues.push({ severity: "high", text: "DMARC is set to p=none. Forged mail is reported to you but still delivered to the recipient." });
            else if (!policy) out.issues.push({ severity: "high", text: "Your DMARC record has no policy tag." });
        } else {
            out.records.dmarc = { present: false };
            out.issues.push({ severity: "critical", text: "No DMARC record. Anyone can send email that appears to come from your domain and receivers have no instruction to stop it." });
        }
    } catch (e) {
        out.records.dmarc = { present: null, error: "Could not be checked" };
    }

    // DKIM — selectors are chosen by the sender, so absence proves nothing.
    // Report what we find and say plainly what we cannot know.
    const SELECTORS = ["default", "google", "selector1", "selector2", "k1", "s1", "mail", "dkim", "zoho"];
    const found = [];
    await Promise.all(SELECTORS.map(async (sel) => {
        try {
            const txt = await withTimeout(txtRecords(`${sel}._domainkey.${domain}`), 4000, "DKIM lookup");
            if (txt.some((r) => /v=DKIM1|k=rsa|p=/i.test(r))) found.push(sel);
        } catch (e) { /* selector absent — expected for most */ }
    }));
    out.records.dkim = {
        present: found.length > 0, selectors: found,
        note: "DKIM selectors are chosen by whoever sends your mail, so we can only test common ones. Finding none does not prove DKIM is absent.",
    };

    // MTA-STS
    try {
        const txt = await withTimeout(txtRecords(`_mta-sts.${domain}`), 5000, "MTA-STS lookup").catch(() => []);
        out.records.mtaSts = { present: txt.some((r) => /v=STSv1/i.test(r)) };
    } catch (e) { out.records.mtaSts = { present: null }; }

    const worst = out.issues.map((i) => i.severity);
    out.verdict = worst.includes("critical")
        ? "Anyone can send email that appears to come from you."
        : worst.includes("high")
            ? "Your email domain is only partly protected."
            : out.issues.length
                ? "Broadly protected, with room to tighten."
                : "Your email authentication is properly configured.";

    return out;
}

// ── 3 · SSL / TLS Test ───────────────────────────────────────────────────

async function sslTest(domainInput) {
    const parsed = normaliseDomain(domainInput);
    if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: "INVALID_DOMAIN" });
    const domain = parsed.domain;

    let cert, protocol;
    try {
        ({ cert, protocol } = await withTimeout(getCertificate(domain), 12000, "TLS connection"));
    } catch (e) {
        throw Object.assign(new Error(`We could not open a secure connection to ${domain}. It may not serve HTTPS.`),
            { code: "NO_TLS" });
    }

    const notAfter = new Date(cert.valid_to);
    const notBefore = new Date(cert.valid_from);
    const days = Math.floor((notAfter - Date.now()) / 86400000);

    const issues = [];
    if (days < 0) issues.push({ severity: "critical", text: `The certificate expired ${Math.abs(days)} day(s) ago. Visitors see a full-page security warning.` });
    else if (days <= 14) issues.push({ severity: "high", text: `The certificate expires in ${days} day(s).` });

    if (protocol && /TLSv1(\.[01])?$/.test(protocol)) {
        issues.push({ severity: "high", text: `The connection negotiated ${protocol}, which is deprecated and fails most compliance checks.` });
    }

    const keyBits = cert.bits || null;
    if (keyBits && keyBits < 2048 && !/EC/i.test(cert.asn1Curve || cert.nistCurve || "")) {
        issues.push({ severity: "high", text: `The key is ${keyBits}-bit, below the 2048-bit minimum.` });
    }

    const names = (cert.subjectaltname || "")
        .split(",").map((s) => s.trim().replace(/^DNS:/, "")).filter(Boolean);
    const covers = names.some((n) =>
        n.toLowerCase() === domain || (n.startsWith("*.") && domain.endsWith(n.slice(1))));
    if (!covers) issues.push({ severity: "critical", text: `The certificate does not list ${domain} among its names.` });

    const selfSigned = cert.issuer && cert.subject &&
        JSON.stringify(cert.issuer) === JSON.stringify(cert.subject);
    if (selfSigned) issues.push({ severity: "critical", text: "The certificate is self-signed. No browser will trust it." });

    return {
        domain,
        issuer: (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || "Unknown",
        subject: (cert.subject && cert.subject.CN) || domain,
        validFrom: notBefore.toISOString().slice(0, 10),
        validTo: notAfter.toISOString().slice(0, 10),
        daysRemaining: days,
        protocol: protocol || "Unknown",
        keyBits,
        altNames: names.slice(0, 20),
        altNameCount: names.length,
        selfSigned,
        issues,
        verdict: issues.some((i) => i.severity === "critical")
            ? "This certificate has a serious problem visitors will see."
            : issues.length ? "Working, with something worth attending to."
                : "Certificate and protocol configuration look healthy.",
    };
}

// ── 4 · Security Headers Test ────────────────────────────────────────────

const HEADER_SPEC = [
    {
        key: "strict-transport-security", label: "HSTS", severity: "high",
        what: "Tells browsers to only ever reach you over HTTPS, which closes the gap where a first visit over plain HTTP can be intercepted.",
    },
    {
        key: "content-security-policy", label: "Content Security Policy", severity: "high",
        what: "Limits where scripts may load from. The single most effective defence against a script injected into your pages.",
    },
    {
        key: "x-frame-options", label: "Frame protection", severity: "medium",
        what: "Stops another site loading yours inside an invisible frame and capturing clicks intended for you.",
        alt: (h) => /frame-ancestors/i.test(h["content-security-policy"] || ""),
    },
    {
        key: "x-content-type-options", label: "MIME sniffing protection", severity: "medium",
        what: "Stops a browser second-guessing a file's type, which is how an uploaded image becomes an executed script.",
    },
    {
        key: "referrer-policy", label: "Referrer Policy", severity: "low",
        what: "Controls how much of the page address is passed on when a visitor follows a link away from you.",
    },
    {
        key: "permissions-policy", label: "Permissions Policy", severity: "low",
        what: "Declares which browser features — camera, microphone, location — your pages may use.",
    },
];

async function securityHeaders(domainInput) {
    const parsed = normaliseDomain(domainInput);
    if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: "INVALID_DOMAIN" });
    const domain = parsed.domain;

    let res;
    try {
        res = await withTimeout(fetchUrl(`https://${domain}/`, { maxBytes: 65536 }), 12000, "Page request");
    } catch (e) {
        throw Object.assign(new Error(`We could not reach https://${domain}.`), { code: "UNREACHABLE" });
    }

    const h = {};
    Object.entries(res.headers || {}).forEach(([k, v]) => { h[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v; });

    const headers = HEADER_SPEC.map((spec) => {
        const value = h[spec.key];
        const satisfied = !!value || (spec.alt ? spec.alt(h) : false);
        return {
            label: spec.label, key: spec.key, present: satisfied,
            value: value ? String(value).slice(0, 180) : null,
            severity: spec.severity, what: spec.what,
        };
    });

    // Cookie flags — a session cookie without Secure and HttpOnly is a
    // session waiting to be stolen by any script on the page.
    const cookies = [].concat(res.headers["set-cookie"] || []);
    const cookieIssues = cookies.map((c) => {
        const name = String(c).split("=")[0];
        const missing = [];
        if (!/;\s*secure/i.test(c)) missing.push("Secure");
        if (!/;\s*httponly/i.test(c)) missing.push("HttpOnly");
        if (!/;\s*samesite/i.test(c)) missing.push("SameSite");
        return missing.length ? { name, missing } : null;
    }).filter(Boolean);

    const missing = headers.filter((x) => !x.present);
    const serverHeader = h["server"] || null;

    return {
        domain, status: res.status,
        headers, cookieIssues,
        presentCount: headers.length - missing.length,
        totalCount: headers.length,
        serverHeader,
        serverDisclosure: serverHeader && /\d/.test(serverHeader)
            ? `Your server announces itself as "${serverHeader}". A version number tells an attacker which vulnerabilities to try first.`
            : null,
        verdict: missing.length === 0 ? "Every header we check for is present."
            : missing.some((m) => m.severity === "high")
                ? `${missing.length} header(s) missing, including at least one that matters a great deal.`
                : `${missing.length} header(s) missing.`,
    };
}

// ── 5 · Lookalike Domain Check ───────────────────────────────────────────
//
// The commercially useful part is not "these typos are registered". It is
// "these typos can send email today", which is a live invoice-fraud risk
// rather than a theoretical one.

async function lookalikeDomains(domainInput) {
    const parsed = normaliseDomain(domainInput);
    if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: "INVALID_DOMAIN" });
    const domain = parsed.domain;

    const variants = typoVariants(domain).slice(0, 24);

    const checked = await Promise.all(variants.map(async (v) => {
        const row = { domain: v, registered: false, hasMail: false, hasWebsite: false };
        try {
            const a = await withTimeout(dns.resolve4(v), 4000, "A lookup");
            row.registered = !!(a && a.length);
            row.hasWebsite = row.registered;
        } catch (e) { /* not resolvable */ }
        try {
            const mx = await withTimeout(dns.resolveMx(v), 4000, "MX lookup");
            if (mx && mx.length) { row.registered = true; row.hasMail = true; }
        } catch (e) { /* no mail */ }
        return row;
    }));

    const registered = checked.filter((r) => r.registered);
    const mailCapable = checked.filter((r) => r.hasMail);

    return {
        domain,
        variantsChecked: variants.length,
        registered,
        mailCapable,
        registeredCount: registered.length,
        mailCapableCount: mailCapable.length,
        verdict: mailCapable.length
            ? `${mailCapable.length} lookalike domain(s) can send email that appears to come from you.`
            : registered.length
                ? `${registered.length} lookalike domain(s) are registered but none are configured to send mail.`
                : "No common misspelling of your domain appears to be registered.",
        note: "We test common misspellings — a dropped letter, a doubled letter, two letters swapped, and characters that are hard to tell apart. This is not an exhaustive search of every possible variant.",
    };
}

module.exports = {
    passwordPrefix, emailSpoofing, sslTest, securityHeaders, lookalikeDomains,
};

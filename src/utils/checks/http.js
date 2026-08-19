// ─────────────────────────────────────────────────────────────────────────
//  Domain 1 — External Attack Surface, the HTTP-observable subset.
//  14 checks here plus TLS-NOREDIRECT-36, which belongs to domain 4 but is
//  answered by an HTTP request, so it lives with the request that answers it.
//
//  Ported from dShield v6.3 src/checks/http.js.
//
//  ONE HOMEPAGE FETCH, shared by all of them. Fifteen checks each making
//  their own request to the same site would be fifteen times the load for
//  identical bytes, and looks like a probe rather than a visit.
// ─────────────────────────────────────────────────────────────────────────

const { memo, fetchUrl, withTimeout } = require("../net");

/**
 * The homepage, fetched once per scan.
 *
 * The fallback to plain HTTP is deliberately narrow. Only an error that
 * means TLS is genuinely absent — refused, unresolvable, protocol error —
 * justifies retrying over HTTP. A TIMEOUT means the host is slow, not that
 * it lacks TLS, and retrying just doubles the wait for a result we will not
 * get. Profiling the source engine against github.com found exactly this
 * costing 213 seconds.
 */
function getRoot(target) {
    return memo(target, "http:root", async () => {
        try {
            return await withTimeout(fetchUrl(`https://${target.domain}/`), 12000, "Homepage request");
        } catch (err) {
            const noTls = /ECONNREFUSED|ENOTFOUND|EPROTO|ERR_SSL|wrong version number/i.test(err.message || "");
            if (!noTls) return { error: err.message };
            try {
                return await withTimeout(fetchUrl(`http://${target.domain}/`), 12000, "Homepage request");
            } catch (e2) { return { error: err.message }; }
        }
    });
}

const hdr = (res, name) => res.headers && res.headers[name.toLowerCase()];

/**
 * Can we conclude anything from this response's headers?
 *
 * A 4xx or 5xx is very often produced by a CDN, WAF or egress proxy that
 * never reached the origin, and those error pages do not carry the origin's
 * header policy. Reporting "HSTS missing" from a 403 block page is a false
 * finding about a site we were never allowed to see.
 *
 * The source found this while benchmarking competitors: an egress proxy
 * returned 403 for every domain, and all six sites appeared to be missing
 * HSTS, CSP and X-Frame-Options. They were not. We simply never reached them.
 *
 * When the origin did not answer, the honest result is inconclusive.
 */
function assertUsable(res) {
    if (res.error) throw new Error(res.error);
    if (typeof res.status !== "number") throw new Error("No response status");
    if (res.status >= 400) {
        throw new Error(`Origin returned HTTP ${res.status} — headers on an error or block page do not reflect the site's policy`);
    }
    return res;
}

function parseCookies(res) {
    const raw = res.headers && res.headers["set-cookie"];
    if (!raw) return [];
    return [].concat(raw).map((c) => {
        const name = String(c).split(";")[0].split("=")[0].trim();
        return {
            name,
            secure: /;\s*Secure/i.test(c),
            httpOnly: /;\s*HttpOnly/i.test(c),
            sameSite: (String(c).match(/;\s*SameSite=(\w+)/i) || [])[1] || null,
        };
    });
}

const cookiesOf = (target) => memo(target, "cookies", async () => parseCookies(assertUsable(await getRoot(target))));

const SESSION_HINT = /(sess|sid|auth|token|jwt|login|phpsessid|jsessionid|asp\.net)/i;

module.exports = [
    {
        id: "HDR-HSTS-17",
        domain: 1, severity: "medium", minTier: "advanced",
        title: "HTTP Strict Transport Security not enabled",
        why: "HSTS tells browsers to only ever reach you over HTTPS. Without it, the very first visit can be intercepted before any encryption is agreed.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const h = hdr(res, "strict-transport-security");
            return h
                ? { passed: true, evidence: `Strict-Transport-Security: ${h}` }
                : { passed: false, evidence: "The Strict-Transport-Security header is absent." };
        },
    },

    {
        id: "HDR-HSTS-18",
        domain: 1, severity: "low", minTier: "advanced",
        title: "Strict Transport Security duration too short",
        why: "A short HSTS lifetime, or one that omits subdomains, leaves gaps an attacker can wait for. A year with includeSubDomains is the accepted baseline.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const h = hdr(res, "strict-transport-security");
            if (!h) return { passed: true, evidence: "No HSTS — reported by HDR-HSTS-17." };

            const maxAge = parseInt((h.match(/max-age=(\d+)/i) || [])[1] || "0", 10);
            const subs = /includeSubDomains/i.test(h);
            return (maxAge < 31536000 || !subs)
                ? { passed: false, evidence: `Strict-Transport-Security: ${h}`, detail: { maxAge, includeSubDomains: subs } }
                : { passed: true, evidence: `max-age ${maxAge} with includeSubDomains.` };
        },
    },

    {
        id: "HDR-CSP-19",
        domain: 1, severity: "medium", minTier: "advanced",
        title: "Content Security Policy not configured",
        why: "A Content Security Policy limits where scripts may load from. It is the single most effective defence against a script injected into your pages.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const h = hdr(res, "content-security-policy");
            return h
                ? { passed: true, evidence: `Content-Security-Policy present (${h.length} characters).` }
                : { passed: false, evidence: "The Content-Security-Policy header is absent." };
        },
    },

    {
        id: "HDR-CSP-20",
        domain: 1, severity: "medium", minTier: "advanced",
        title: "Content Security Policy weakened by unsafe directives",
        why: "unsafe-inline and unsafe-eval permit exactly the behaviour a Content Security Policy exists to stop. A policy containing them provides much less than it appears to.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const csp = hdr(res, "content-security-policy");
            if (!csp) return { passed: true, evidence: "No CSP — reported by HDR-CSP-19." };

            const scriptSrc = (csp.match(/script-src([^;]*)/i) || [])[1] || "";
            const unsafe = [];
            if (/unsafe-inline/i.test(scriptSrc)) unsafe.push("'unsafe-inline'");
            if (/unsafe-eval/i.test(scriptSrc)) unsafe.push("'unsafe-eval'");
            if (/\s\*(\s|$)/.test(scriptSrc)) unsafe.push("wildcard source");

            return unsafe.length
                ? { passed: false, evidence: `script-src contains ${unsafe.join(", ")}.`, detail: { unsafe, scriptSrc: scriptSrc.trim().slice(0, 120) } }
                : { passed: true, evidence: "script-src contains no unsafe directives." };
        },
    },

    {
        id: "HDR-XFO-21",
        domain: 1, severity: "medium", minTier: "advanced",
        title: "No protection against clickjacking",
        why: "Without this, another site can load yours inside an invisible frame and capture clicks your visitors believe they are giving to you.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const xfo = hdr(res, "x-frame-options");
            const fa = /frame-ancestors/i.test(hdr(res, "content-security-policy") || "");
            return (!xfo && !fa)
                ? { passed: false, evidence: "Neither X-Frame-Options nor a CSP frame-ancestors directive is present." }
                : { passed: true, evidence: xfo ? `X-Frame-Options: ${xfo}` : "frame-ancestors is set in the CSP." };
        },
    },

    {
        id: "HDR-NOSNIFF-22",
        domain: 1, severity: "low", minTier: "advanced",
        title: "MIME type sniffing not disabled",
        why: "Without nosniff a browser may second-guess a file's declared type, which is how an uploaded image ends up being executed as a script.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const h = hdr(res, "x-content-type-options");
            return (!h || !/nosniff/i.test(h))
                ? { passed: false, evidence: "The X-Content-Type-Options header is absent or does not say nosniff." }
                : { passed: true, evidence: "X-Content-Type-Options: nosniff" };
        },
    },

    {
        id: "HDR-REFERRER-23",
        domain: 1, severity: "low", minTier: "advanced",
        title: "Referrer policy not restricted",
        why: "A permissive referrer policy leaks the full address of the page a visitor was on — including anything sensitive in the query string — to every site they click through to.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const h = hdr(res, "referrer-policy");
            return (!h || /unsafe-url|^no-referrer-when-downgrade$/i.test(h))
                ? { passed: false, evidence: `Referrer-Policy is ${h || "absent"}.` }
                : { passed: true, evidence: `Referrer-Policy: ${h}` };
        },
    },

    {
        id: "COOKIE-SECURE-24",
        domain: 1, severity: "high", minTier: "advanced",
        title: "Session cookie not restricted to encrypted connections",
        why: "A cookie without Secure is sent over plain HTTP too, where anyone on the network path can read it and use it to become that visitor.",
        async run(target) {
            const cookies = await cookiesOf(target);
            if (!cookies.length) return { passed: true, evidence: "No cookies are set on the homepage." };

            const bad = cookies.filter((c) => !c.secure);
            if (!bad.length) return { passed: true, evidence: `All ${cookies.length} cookies are marked Secure.` };
            const session = bad.filter((c) => SESSION_HINT.test(c.name));
            return {
                passed: false,
                evidence: `${bad.length} cookie(s) are set without the Secure attribute, including "${bad[0].name}".`,
                detail: { cookies: bad.map((c) => c.name), sessionLike: session.map((c) => c.name) },
            };
        },
    },

    {
        id: "COOKIE-HTTPONLY-25",
        domain: 1, severity: "high", minTier: "advanced",
        title: "Session cookie readable by JavaScript",
        why: "Without HttpOnly, any script on the page can read the session cookie. One injected script is then enough to take over an account.",
        async run(target) {
            const cookies = await cookiesOf(target);
            if (!cookies.length) return { passed: true, evidence: "No cookies were observed." };

            const bad = cookies.filter((c) => !c.httpOnly && SESSION_HINT.test(c.name));
            return bad.length
                ? { passed: false, evidence: `Session cookie "${bad[0].name}" is set without HttpOnly.`, detail: { cookies: bad.map((c) => c.name) } }
                : { passed: true, evidence: "Session cookies are marked HttpOnly." };
        },
    },

    {
        id: "COOKIE-SAMESITE-26",
        domain: 1, severity: "medium", minTier: "advanced",
        title: "Cookie SameSite attribute not set",
        why: "SameSite stops another site causing a visitor's browser to make authenticated requests to you without their knowledge.",
        async run(target) {
            const cookies = await cookiesOf(target);
            if (!cookies.length) return { passed: true, evidence: "No cookies were observed." };

            const bad = cookies.filter((c) => !c.sameSite || /^none$/i.test(c.sameSite));
            return bad.length
                ? { passed: false, evidence: `Cookie "${bad[0].name}" has SameSite=${bad[0].sameSite || "absent"}.`, detail: { cookies: bad.map((c) => c.name) } }
                : { passed: true, evidence: "SameSite is set on every cookie." };
        },
    },

    {
        id: "SURF-BANNER-14",
        domain: 1, severity: "low", minTier: "advanced",
        title: "Software version disclosed in server headers",
        why: "A version number tells an attacker which published vulnerabilities to try first. Removing it does not fix anything, but it does mean they have to work for the answer.",
        async run(target) {
            const res = assertUsable(await getRoot(target));
            const server = hdr(res, "server") || "";
            const powered = hdr(res, "x-powered-by") || "";
            return (/\d+\.\d+/.test(server) || /\d+\.\d+/.test(powered))
                ? { passed: false, evidence: `Server: ${server || "—"} · X-Powered-By: ${powered || "—"}`, detail: { server, powered } }
                : { passed: true, evidence: "No software version is disclosed in the headers." };
        },
    },

    {
        id: "SURF-SECURITYTXT-64",
        domain: 1, severity: "low", minTier: "advanced",
        title: "No vulnerability disclosure contact published",
        why: "Without a published contact, somebody who finds a flaw in your systems has no obvious way to tell you. Many give up; some publish instead.",
        async run(target) {
            for (const path of ["/.well-known/security.txt", "/security.txt"]) {
                try {
                    const res = await withTimeout(fetchUrl(`https://${target.domain}${path}`, { maxBytes: 16384 }), 9000, "security.txt");
                    if (res.status === 200 && /contact:/i.test(res.body || "")) {
                        return { passed: true, evidence: `Published at ${path}.` };
                    }
                } catch (e) { /* try the next location */ }
            }
            return { passed: false, evidence: "No security.txt is published at either standard location." };
        },
    },

    {
        /* One of the eight free-tier checks. The body is the one already in
           this repo rather than the source's, because the free scan's output
           must not change — see the note in checks/index.js. */
        id: "SURF-GIT-04",
        domain: 1, severity: "critical", minTier: "snapshot",
        title: "Version control directory exposed",
        why: "A published .git directory can often be reconstructed into your complete source code, including any password or key ever committed to it — even one deleted in a later commit.",
        async run(target) {
            const res = await fetchUrl(`${target.origin}/.git/config`, { maxBytes: 4096 });
            const looksLikeGit = res.status === 200 && /\[core\]|repositoryformatversion/i.test(res.body || "");
            return looksLikeGit
                ? { passed: false, evidence: `${target.origin}/.git/config returned 200 and contains a git configuration block.` }
                : { passed: true, evidence: `No readable .git directory (HTTP ${res.status}).` };
        },
    },

    {
        id: "SURF-ENVFILE-05",
        domain: 1, severity: "critical", minTier: "advanced",
        title: "Configuration file containing credentials is publicly readable",
        why: "A .env file holds database passwords and API keys in plain text. If it is readable over the web, so is everything it protects.",
        async run(target) {
            try {
                const res = await withTimeout(fetchUrl(`https://${target.domain}/.env`, { maxBytes: 16384 }), 9000, ".env probe");
                const body = res.body || "";
                const looksLikeEnv = /^[A-Z_]+=/m.test(body) && /(KEY|SECRET|PASSWORD|TOKEN|DB_)/i.test(body);
                if (res.status === 200 && looksLikeEnv) {
                    return { passed: false, evidence: `${target.domain}/.env returned 200 with credential patterns present (${body.length} bytes).`, detail: { bytes: body.length } };
                }
            } catch (e) { /* unreachable, which is the good outcome */ }
            return { passed: true, evidence: "No readable .env file." };
        },
    },

    {
        id: "TLS-NOREDIRECT-36",
        domain: 4, severity: "medium", minTier: "advanced",
        title: "Unencrypted connections not redirected",
        why: "If plain HTTP serves the site rather than redirecting, a visitor who types your address without https can be served a modified copy of your pages and never know.",
        async run(target) {
            try {
                const res = await withTimeout(fetchUrl(`http://${target.domain}/`, { maxBytes: 8192 }), 9000, "HTTP redirect probe");
                if (res.status === 200) {
                    return { passed: false, evidence: "Plain HTTP returns 200 and serves content without redirecting to HTTPS." };
                }
                const loc = (res.headers && res.headers.location) || "";
                return loc.startsWith("https://")
                    ? { passed: true, evidence: `Plain HTTP returns ${res.status} redirecting to HTTPS.` }
                    : { passed: true, evidence: `Plain HTTP returns ${res.status}.` };
            } catch (err) {
                return { passed: true, evidence: "The site is not served over plain HTTP at all." };
            }
        },
    },
];

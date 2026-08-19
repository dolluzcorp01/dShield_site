// ─────────────────────────────────────────────────────────────────────────
//  External attack surface, content and DNS.  13 checks.
//  Mostly domain 1, plus TLS-MIXED-37 (domain 4) and DNS-DNSSEC-49 (domain 6),
//  which sit here because they are answered by the same page fetch and DNS
//  work as their neighbours.
//
//  Ported from dShield v6.3 src/checks/surface.js.
//
//  EVERY CHECK HERE IS PASSIVE: an ordinary HTTP request or DNS query that
//  any browser or resolver would make. Nothing probes ports, brute-forces, or
//  sends malformed input. That promise is printed on the site and in the
//  terms customers accept, and it constrains what may ever be added here.
// ─────────────────────────────────────────────────────────────────────────

const dns = require("dns").promises;
const { memo, mapLimit, fetchUrl, withTimeout, aSafe, ctNames } = require("../net");

/**
 * One request, never throwing. Returns { ok, status, headers, body, bytes }.
 *
 * Four seconds, not eight: these checks probe several paths in sequence, and
 * an eight-second ceiling per path let one slow host consume an entire scan's
 * budget on its own.
 */
async function probe(host, path, opts = {}) {
    const scheme = opts.insecure ? "http" : "https";
    try {
        const res = await withTimeout(
            fetchUrl(`${scheme}://${host}${path}`, { maxBytes: opts.cap || 65536, headers: opts.headers || {} }),
            opts.timeout || 8000, `Request to ${path}`);
        return { ok: true, status: res.status, headers: res.headers || {}, body: res.body || "", bytes: (res.body || "").length };
    } catch (err) {
        return { ok: false, error: err.code || err.message };
    }
}

/** The homepage HTML, fetched once and shared by the checks that parse it. */
const homepage = (target) => memo(target, "surface:html", () => probe(target.domain, "/", { cap: 262144 }));

/** Server banner, shared by the end-of-life and known-vulnerability checks. */
const bannerOf = (target) => memo(target, "surface:banner", async () => {
    const r = await homepage(target);
    if (!r.ok) return { ok: false, error: r.error };
    return {
        ok: true,
        banner: [r.headers.server, r.headers["x-powered-by"], r.headers["x-aspnet-version"]].filter(Boolean).join(" "),
    };
});

const ADMIN_PATHS = [
    { p: "/admin", name: "Generic admin" },
    { p: "/wp-admin/", name: "WordPress admin" },
    { p: "/administrator/", name: "Joomla admin" },
    { p: "/phpmyadmin/", name: "phpMyAdmin" },
    { p: "/manager/html", name: "Tomcat Manager" },
    { p: "/jenkins/", name: "Jenkins" },
    { p: "/.well-known/security.txt", name: null },   // control: proves the host answers at all
    { p: "/solr/", name: "Apache Solr" },
    { p: "/grafana/login", name: "Grafana" },
    { p: "/kibana/", name: "Kibana" },
];

const NONPROD = /^(dev|test|staging|stage|uat|qa|sandbox|demo|preprod|beta|alpha)[.-]/i;

const BACKUP_PATHS = [
    "/backup.zip", "/backup.tar.gz", "/backup.sql", "/db.sql", "/dump.sql",
    "/database.sql", "/site.zip", "/www.zip", "/backup.bak", "/wp-config.php.bak",
    "/config.php.bak", "/.env.bak", "/index.php.bak",
];

const ARCHIVE_MAGIC = [/^PK\x03\x04/, /^\x1f\x8b/];

const EOL = [
    { re: /Apache\/2\.2\./i, name: "Apache 2.2", ended: "2018-01" },
    { re: /Apache\/2\.0\./i, name: "Apache 2.0", ended: "2013-07" },
    { re: /nginx\/1\.(1[0-7]|[0-9])\./i, name: "nginx 1.17 or older", ended: "2019-12" },
    { re: /PHP\/5\./i, name: "PHP 5", ended: "2018-12" },
    { re: /PHP\/7\.[0-3]/i, name: "PHP 7.3 or older", ended: "2021-12" },
    { re: /Microsoft-IIS\/[6-7]\./i, name: "IIS 6/7", ended: "2015-07" },
    { re: /OpenSSL\/1\.0\./i, name: "OpenSSL 1.0.x", ended: "2019-12" },
    { re: /OpenSSL\/1\.1\.0/i, name: "OpenSSL 1.1.0", ended: "2019-09" },
];

const KNOWN_VULN = [
    { re: /Apache\/2\.4\.(4[0-9]|[0-3][0-9])(?!\d)/i, name: "Apache 2.4.49 and earlier", note: "CVE-2021-41773 path traversal affects 2.4.49–2.4.50." },
    { re: /nginx\/1\.(1[0-9]|20)\.(?!\d)/i, name: "nginx 1.20 or earlier", note: "Several resolver and mp4 module issues." },
    { re: /OpenSSL\/3\.0\.[0-6](?!\d)/i, name: "OpenSSL 3.0.0–3.0.6", note: "CVE-2022-3602 and CVE-2022-3786 buffer overflow." },
    { re: /PHP\/8\.0\.[0-9](?!\d)/i, name: "PHP 8.0 early releases", note: "Multiple issues fixed in later 8.0.x." },
];

const DEBUG_SIGNS = [
    { re: /Whoops[,\s].*there was an error|Laravel.*Debug|Ignition/i, name: "Laravel debug mode" },
    { re: /Django.*DEBUG\s*=\s*True|You're seeing this error because you have <code>DEBUG/i, name: "Django debug mode" },
    { re: /Werkzeug Debugger|Traceback \(most recent call last\)/i, name: "Python traceback exposed" },
    { re: /<b>(Warning|Notice|Fatal error|Parse error)<\/b>:.*on line <b>\d+/i, name: "PHP errors displayed" },
    { re: /Server Error in .* Application.*Stack Trace/is, name: "ASP.NET stack trace" },
    { re: /at [\w.$]+\([\w.]+\.java:\d+\)/, name: "Java stack trace" },
    { re: /ORA-\d{5}|SQLSTATE\[|You have an error in your SQL syntax/i, name: "Database error exposed" },
];

const DEFAULT_PAGES = [
    { re: /Welcome to nginx!/i, name: "nginx default page" },
    { re: /Apache2 (Ubuntu|Debian) Default Page|It works!/i, name: "Apache default page" },
    { re: /IIS Windows Server|Internet Information Services/i, name: "IIS default page" },
    { re: /Apache Tomcat.*If you're seeing this, you've successfully installed/is, name: "Tomcat default page" },
    { re: /XAMPP|Welcome to XAMPP/i, name: "XAMPP default page" },
    { re: /This is the default web page for this server/i, name: "Generic default page" },
];

module.exports = [
    {
        id: "SURF-ADMIN-02",
        domain: 1, severity: "high", minTier: "basic",
        title: "Administrative interface exposed to the internet",
        why: "An administration panel reachable from the open internet is a login form anybody in the world can attempt. Restricted to your office network or a VPN, it is a door that most attackers never find.",
        async run(target) {
            /* HIGH, NOT CRITICAL. A single critical caps the grade at D, and
               that must be reserved for something actively exploitable — not
               an admin path sitting behind authentication. When this was
               critical, google.com, wikipedia.org and stripe.com all scored
               D. If a source says critical, the source is stale. */
            const results = await mapLimit(ADMIN_PATHS, 4, async (a) => ({ a, r: await probe(target.domain, a.p, { cap: 8192 , timeout: 4500 }) }));

            const found = [];
            let answered = 0;
            for (const { a, r } of results) {
                if (!r.ok) continue;
                answered += 1;
                if (!a.name) continue;

                /* A 403 means the server refused, which is correct posture
                   rather than a finding. Treating it as one was the false
                   positive that capped four well-run sites at D. */
                if (r.status === 403) continue;

                if (r.status === 401) { found.push({ path: a.p, name: a.name, status: 401, gated: true }); continue; }

                if (r.status === 200) {
                    const head = r.body.slice(0, 8000);
                    const looksLikeAdmin = /type=["']?password|name=["']?password|wp-login|j_username|<form[^>]*(login|signin|auth)|dashboard|administrator/i.test(head);
                    const isSoft404 = /not found|404|page you.{0,20}looking for/i.test(r.body.slice(0, 2000));
                    if (looksLikeAdmin && !isSoft404) found.push({ path: a.p, name: a.name, status: 200, gated: false });
                }
            }

            if (answered === 0) throw new Error("The host did not respond to any request");
            if (!found.length) return { passed: true, evidence: "No administrative interface was found on the common paths." };

            const ungated = found.filter((f) => !f.gated);
            const worst = ungated[0] || found[0];
            return {
                passed: false,
                evidence: worst.gated
                    ? `A ${worst.name} login prompt is exposed at ${target.domain}${worst.path}.`
                    : `${worst.name} is reachable without authentication at ${target.domain}${worst.path}.`,
                detail: { found, ungatedCount: ungated.length },
            };
        },
    },

    {
        id: "SURF-STAGING-03",
        domain: 1, severity: "critical", minTier: "basic",
        title: "Non-production environment publicly accessible",
        why: "Staging and test sites run older code, carry real data copied from production, and are rarely patched or monitored. They are the softest way into an otherwise well-run estate.",
        async run(target) {
            const ct = await ctNames(target);
            if (!ct.ok) throw new Error(`Requires certificate transparency data: ${ct.error}`);

            const candidates = [...ct.names]
                .filter((n) => n.endsWith(target.domain) && !n.startsWith("*") && NONPROD.test(n))
                .slice(0, 20);

            if (!candidates.length) return { passed: true, evidence: "No non-production hostnames appear in the certificate data." };

            const live = (await mapLimit(candidates, 5, async (host) => {
                const a = await aSafe(host);
                if (!a.ok || !a.data.length) return null;
                const r = await probe(host, "/", { cap: 4096 });
                if (!r.ok || r.status >= 500) return null;
                return { host, status: r.status, gated: r.status === 401 || r.status === 403 };
            })).filter(Boolean);

            if (!live.length) return { passed: true, evidence: `${candidates.length} non-production name(s) found, none reachable.`, detail: { candidates } };

            const open = live.filter((l) => !l.gated);
            if (!open.length) return { passed: true, evidence: "Non-production hosts exist but all require authentication.", detail: { live } };

            return { passed: false, evidence: `${open[0].host} is reachable without authentication (HTTP ${open[0].status}).`, detail: { live } };
        },
    },

    {
        id: "SURF-BACKUP-06",
        domain: 1, severity: "high", minTier: "basic",
        title: "Backup or archive files accessible in the web root",
        why: "A backup left in the web root hands over your database or source code to anyone who guesses the filename, and the filenames are always the same handful.",
        async run(target) {
            const results = await mapLimit(BACKUP_PATHS, 4, async (p) => ({ p, r: await probe(target.domain, p, { cap: 2048 , timeout: 4500 }) }));

            const found = [];
            for (const { p, r } of results) {
                if (!r.ok || r.status !== 200) continue;
                // A soft 404 returns 200 with an HTML error page. Confirm the
                // body actually looks like the file it claims to be.
                const looksHtml = /^\s*<(!doctype|html)/i.test(r.body);
                const magic = ARCHIVE_MAGIC.some((m) => m.test(r.body));
                const sqlLike = /^(--|\/\*|CREATE TABLE|INSERT INTO|DROP TABLE)/im.test(r.body);
                const phpLike = /^<\?php/.test(r.body);
                if (magic || sqlLike || phpLike || (!looksHtml && r.bytes > 1024)) {
                    found.push({ path: p, bytes: r.bytes, type: magic ? "archive" : sqlLike ? "sql" : phpLike ? "source" : "binary" });
                }
            }

            return found.length
                ? { passed: false, evidence: `A downloadable ${found[0].type} file is served at ${target.domain}${found[0].path}.`, detail: { found } }
                : { passed: true, evidence: "No backup files were found on the common paths." };
        },
    },

    {
        id: "SURF-DIRLIST-07",
        domain: 1, severity: "medium", minTier: "basic",
        title: "Directory listing enabled",
        why: "A directory listing shows every file in a folder, including ones never linked from anywhere. It removes the guesswork from finding what you did not mean to publish.",
        async run(target) {
            const paths = ["/images/", "/uploads/", "/files/", "/assets/", "/static/", "/backup/", "/docs/"];
            const results = await mapLimit(paths, 4, async (p) => ({ p, r: await probe(target.domain, p, { cap: 8192 , timeout: 4500 }) }));

            const found = [];
            for (const { p, r } of results) {
                if (!r.ok || r.status !== 200) continue;
                if (/<title>Index of |Directory listing for |\[To Parent Directory\]/i.test(r.body)) {
                    found.push({ path: p, entries: (r.body.match(/<a href=/gi) || []).length });
                }
            }

            return found.length
                ? { passed: false, evidence: `${target.domain}${found[0].path} lists its contents (${found[0].entries} entries).`, detail: { found } }
                : { passed: true, evidence: "Directory listing is disabled." };
        },
    },

    {
        id: "SURF-EOL-08",
        domain: 1, severity: "high", minTier: "basic",
        title: "End-of-life software running on a public host",
        why: "Software past end of life receives no security patches at all. Every vulnerability found from that date onward stays open permanently, and they are published for anyone to read.",
        async run(target) {
            const b = await bannerOf(target);
            if (!b.ok) throw new Error(`Host unreachable: ${b.error}`);
            if (!b.banner) return { passed: true, evidence: "No software version is disclosed in the response headers." };

            const hits = EOL.filter((e) => e.re.test(b.banner));
            return hits.length
                ? { passed: false, evidence: `${hits[0].name}, unsupported since ${hits[0].ended}.`, detail: { banner: b.banner.slice(0, 120), matches: hits.map((h) => ({ name: h.name, ended: h.ended })) } }
                : { passed: true, evidence: `"${b.banner.slice(0, 60)}" — no end-of-life version detected.` };
        },
    },

    {
        id: "SURF-CVE-09",
        domain: 1, severity: "high", minTier: "basic",
        title: "Component version with published vulnerabilities",
        why: "A version with published vulnerabilities gives an attacker a ready-made method rather than a puzzle. Worth verifying: banners often keep the old number after a patch has been backported.",
        async run(target) {
            const b = await bannerOf(target);
            if (!b.ok) throw new Error(`Host unreachable: ${b.error}`);
            if (!b.banner) return { passed: true, evidence: "No software version is disclosed." };

            const hits = KNOWN_VULN.filter((v) => v.re.test(b.banner));
            return hits.length
                ? {
                    passed: false,
                    evidence: `${hits[0].name}. ${hits[0].note}`,
                    // Version banners are frequently inaccurate after a
                    // backported patch, so this is an indication to verify
                    // rather than a confirmed vulnerability.
                    detail: { banner: b.banner.slice(0, 120), note: "Version banners are often inaccurate after backported patches. Verify before acting." },
                }
                : { passed: true, evidence: "No known-vulnerable version was detected in the banner." };
        },
    },

    {
        id: "SURF-BUCKET-12",
        domain: 1, severity: "critical", minTier: "advanced",
        title: "Cloud storage container publicly readable",
        why: "A storage bucket set to public lists and serves every file in it to anyone who learns the name — and the names are usually just your company name with a word after it.",
        async run(target) {
            const base = target.domain.replace(/\.[a-z]+$/, "").replace(/\./g, "-");
            const names = [base, `${base}-assets`, `${base}-backup`, `${base}-static`, `${base}-uploads`, `${base}-data`, `${base}-prod`];

            const results = await mapLimit(names, 4, async (n) =>
                ({ n, r: await probe("s3.amazonaws.com", `/${encodeURIComponent(n)}?max-keys=2`, { cap: 4096 , timeout: 4500 }) }));

            const found = [];
            for (const { n, r } of results) {
                if (r.ok && r.status === 200 && /<ListBucketResult/i.test(r.body)) {
                    found.push({ bucket: n, provider: "AWS S3", objectsVisible: (r.body.match(/<Key>/g) || []).length });
                }
            }

            return found.length
                ? { passed: false, evidence: `The AWS S3 container "${found[0].bucket}" lists its contents publicly.`, detail: { found } }
                : { passed: true, evidence: `No publicly listable storage found for ${names.length} predictable names.` };
        },
    },

    {
        id: "SURF-DEBUG-13",
        domain: 1, severity: "high", minTier: "basic",
        title: "Debug mode or verbose errors enabled in production",
        why: "A debug error page prints file paths, configuration and sometimes database credentials straight onto the screen. It is a map of your application, published by accident.",
        async run(target) {
            /* Requesting a path that will not exist is exactly what a browser
               produces on a mistyped URL. The path is prefixed so it is
               identifiable as ours in the customer's own access logs. */
            const probePath = `/dshield-probe-${Math.random().toString(36).slice(2, 10)}`;
            const responses = await Promise.all([
                homepage(target),
                probe(target.domain, probePath, { cap: 16384 }),
            ]);

            const usable = responses.filter((r) => r.ok);
            if (!usable.length) throw new Error("The host did not respond");

            const found = [];
            for (const r of usable) {
                for (const s of DEBUG_SIGNS) if (s.re.test(r.body)) found.push({ sign: s.name, status: r.status });
            }

            return found.length
                ? { passed: false, evidence: `${found[0].sign} is visible in an HTTP ${found[0].status} response.`, detail: { found: [...new Set(found.map((f) => f.sign))] } }
                : { passed: true, evidence: "Error pages do not disclose internal detail." };
        },
    },

    {
        id: "SURF-DEFAULT-15",
        domain: 1, severity: "medium", minTier: "basic",
        title: "Default installation page present",
        why: "A default page means a server was installed and never configured. Anything else forgotten on that machine is probably still at its default too, including the passwords.",
        async run(target) {
            const r = await homepage(target);
            if (!r.ok) throw new Error(`Host unreachable: ${r.error}`);
            const hit = DEFAULT_PAGES.find((d) => d.re.test(r.body));
            return hit
                ? { passed: false, evidence: `The ${hit.name} is still being served.` }
                : { passed: true, evidence: "The host serves a real application rather than a default page." };
        },
    },

    {
        id: "HDR-CORS-27",
        domain: 1, severity: "high", minTier: "basic",
        title: "Overly permissive cross-origin resource sharing",
        why: "Reflecting any origin while allowing credentials lets any website on the internet read your users' private data using their own logged-in session.",
        async run(target) {
            const evil = "https://dshield-origin-test.example";
            const r = await probe(target.domain, "/", { cap: 1024, headers: { Origin: evil } });
            if (!r.ok) throw new Error(`Host unreachable: ${r.error}`);

            const allow = r.headers["access-control-allow-origin"];
            const creds = String(r.headers["access-control-allow-credentials"] || "").toLowerCase() === "true";

            if (!allow) return { passed: true, evidence: "No cross-origin sharing headers, so requests stay same-origin." };
            if (allow === evil && creds) return { passed: false, evidence: "The server reflects any origin and allows credentials.", detail: { allowOrigin: allow, allowCredentials: true } };
            if (allow === evil) return { passed: false, evidence: "The server reflects arbitrary origins in Access-Control-Allow-Origin.", detail: { allowOrigin: allow } };
            if (allow === "*" && creds) return { passed: false, evidence: "A wildcard origin is combined with credentials.", detail: { allowOrigin: "*", allowCredentials: true } };
            if (allow === "*") return { passed: true, evidence: "Wildcard origin without credentials, which is acceptable for public data." };
            return { passed: true, evidence: `Cross-origin sharing is restricted to ${allow}.` };
        },
    },

    {
        id: "SURF-THIRDPARTY-65",
        domain: 1, severity: "medium", minTier: "advanced",
        title: "Third-party scripts loaded without integrity verification",
        why: "A third-party script runs with the same powers as your own code. Without an integrity check, whoever hosts it can change what it does on your pages at any moment, and you would not know.",
        async run(target) {
            const r = await homepage(target);
            if (!r.ok) throw new Error(`Host unreachable: ${r.error}`);

            const tags = r.body.match(/<script[^>]+src=["'][^"']+["'][^>]*>/gi) || [];
            const external = [];
            for (const tag of tags) {
                const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1];
                if (!src) continue;
                let host;
                try {
                    if (src.startsWith("//")) host = new URL(`https:${src}`).hostname;
                    else if (/^https?:\/\//i.test(src)) host = new URL(src).hostname;
                    else continue;                                   // relative — our own origin
                } catch (e) { continue; }
                if (host === target.domain || host.endsWith(`.${target.domain}`)) continue;
                external.push({ host, hasIntegrity: /\sintegrity=/i.test(tag) });
            }

            if (!external.length) return { passed: true, evidence: "No third-party scripts on the homepage." };
            const unprotected = external.filter((e) => !e.hasIntegrity);
            return unprotected.length
                ? { passed: false, evidence: `${unprotected.length} of ${external.length} third-party scripts load without an integrity check, including one from ${unprotected[0].host}.`, detail: { total: external.length, unprotected: unprotected.slice(0, 8).map((u) => u.host) } }
                : { passed: true, evidence: `All ${external.length} third-party scripts use subresource integrity.` };
        },
    },

    {
        id: "TLS-MIXED-37",
        domain: 4, severity: "medium", minTier: "basic",
        title: "Mixed content on encrypted pages",
        why: "One resource loaded over plain HTTP undoes the encryption for the whole page. Browsers block the dangerous kinds outright, which usually means part of your site simply stops working.",
        async run(target) {
            const r = await homepage(target);
            if (!r.ok) throw new Error(`Host unreachable: ${r.error}`);
            const html = r.body;

            const active = [], passive = [];
            const patterns = [
                { tag: "script", re: /<script[^>]+src=["']http:\/\/([^"'/]+)/gi, kind: "active" },
                { tag: "link", re: /<link[^>]+href=["']http:\/\/([^"'/]+)/gi, kind: "active" },
                { tag: "iframe", re: /<iframe[^>]+src=["']http:\/\/([^"'/]+)/gi, kind: "active" },
                { tag: "img", re: /<img[^>]+src=["']http:\/\/([^"'/]+)/gi, kind: "passive" },
                { tag: "media", re: /<(video|audio|source)[^>]+src=["']http:\/\/([^"'/]+)/gi, kind: "passive" },
            ];
            for (const p of patterns) {
                let m;
                while ((m = p.re.exec(html)) !== null) {
                    const host = m[2] || m[1];
                    if (!host || host === "localhost" || host.startsWith("127.")) continue;
                    (p.kind === "active" ? active : passive).push({ tag: p.tag, host });
                }
            }

            if (!active.length && !passive.length) return { passed: true, evidence: "Every page resource is loaded over HTTPS." };
            if (active.length) {
                return { passed: false, evidence: `${active.length} active resource(s) load over plain HTTP, including a ${active[0].tag} from ${active[0].host}.`, detail: { active: active.slice(0, 8), passiveCount: passive.length } };
            }
            return { passed: false, evidence: `${passive.length} image or media resource(s) load over plain HTTP.`, detail: { passive: passive.slice(0, 8) } };
        },
    },

    {
        id: "DNS-DNSSEC-49",
        domain: 6, severity: "medium", minTier: "basic",
        title: "DNSSEC not enabled",
        why: "DNSSEC signs your DNS answers so a resolver can tell they were not tampered with. Without it, somebody who can interfere with DNS can point your domain name at their server.",
        async run(target) {
            /* THE SOURCE'S APPROACH DOES NOT WORK ON NODE.
               v6.3 calls dns.resolve(domain, "DNSKEY"), but Node's resolver
               supports only A, AAAA, ANY, CAA, CNAME, MX, NAPTR, NS, PTR,
               SOA, SRV and TXT. DNSKEY raises ERR_INVALID_ARG_VALUE, so that
               check can never have returned anything but an error.

               Asked over DNS-over-HTTPS instead. No new dependency — it is an
               ordinary HTTPS request through the same helper as every other
               check. It does add one outbound host, which matters on a
               network that restricts egress: if Cloudflare cannot be reached
               the check is INCONCLUSIVE, never a pass. */
            let res;
            try {
                res = await withTimeout(
                    fetchUrl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(target.domain)}&type=DNSKEY`,
                        { maxBytes: 32768, headers: { Accept: "application/dns-json" }, timeout: 8000 }),
                    9000, "DNSSEC lookup");
            } catch (err) {
                throw new Error(`DNSKEY lookup failed: ${err.message}`);
            }
            if (res.status !== 200) throw new Error(`DNSKEY lookup returned HTTP ${res.status}`);

            let data;
            try { data = JSON.parse(res.body); }
            catch (e) { throw new Error("DNSKEY response was not readable"); }

            // Status 0 = NOERROR, 3 = NXDOMAIN. Anything else means we did not
            // get a usable answer and must not conclude the zone is unsigned.
            if (data.Status !== 0 && data.Status !== 3) throw new Error(`DNSKEY lookup returned DNS status ${data.Status}`);

            const keys = (data.Answer || []).filter((a) => a.type === 48);   // 48 = DNSKEY
            return keys.length
                ? { passed: true, evidence: `DNSSEC is enabled, with ${keys.length} key(s) published.`, detail: { keyCount: keys.length } }
                : { passed: false, evidence: "No DNSKEY record — the zone is not signed with DNSSEC." };
        },
    },
];

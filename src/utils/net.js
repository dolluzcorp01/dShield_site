// ─────────────────────────────────────────────────────────────────────────
//  net — the shared network helpers every check uses.
//
//  These lived in scan_engine.js. They moved here for one reason: scan_engine
//  now imports the check list, and the checks need these helpers. Leaving
//  them in scan_engine would make that require cycle back on itself, and a
//  check file would receive a half-initialised module with empty exports.
//
//  scan_engine.js re-exports every one of them, so its public surface is
//  unchanged — tools_engine.js still imports them from there and did not
//  need touching.
//
//  Behaviour is IDENTICAL to before; this is a move, not a rewrite.
// ─────────────────────────────────────────────────────────────────────────

const dns = require("dns").promises;
const tls = require("tls");
const https = require("https");
const http = require("http");

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
// `headers` and `timeout` are additions to the original signature, both
// optional and both defaulting to the previous behaviour. HDR-CORS-27 has
// to send a custom Origin to test whether the server reflects it, which
// is the whole point of that check.
function fetchUrl(url, { method = "GET", maxBytes = 262144, headers = {}, timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        let lib;
        try {
            lib = new URL(url).protocol === "http:" ? http : https;
        } catch (e) {
            return reject(new Error("Invalid URL"));
        }

        const req = lib.request(url, {
            method,
            timeout,
            rejectUnauthorized: false,   // we report certificate problems, not refuse on them
            headers: { "User-Agent": "dShield-Scanner/1.0 (+https://dshield.dolluzcorp.com)", ...headers },
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

/**
 * Common typo-squatting patterns: a dropped character, a doubled
 * character, two adjacent characters swapped, and the handful of
 * substitutions that are hardest to see in a mail client.
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

/**
 * A full TLS handshake with options, for the checks that must probe how a
 * server negotiates rather than simply read its certificate.
 *
 * getCertificate() above answers "what certificate is this"; this answers
 * "will you still speak TLS 1.0", which needs a deliberately constrained
 * handshake. Resolves with { cert, cipher, protocol, authorized, authError }.
 */
function tlsHandshake(host, opts = {}) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({
            host,
            port: opts.port || 443,
            servername: host,
            rejectUnauthorized: false,   // we inspect, we do not trust
            minVersion: opts.minVersion,
            maxVersion: opts.maxVersion,
            ciphers: opts.ciphers,
            timeout: opts.timeout || 8000,
        }, () => {
            const out = {
                cert: socket.getPeerCertificate(true),
                cipher: socket.getCipher(),
                protocol: socket.getProtocol(),
                authorized: socket.authorized,
                authError: socket.authorizationError,
            };
            socket.destroy();
            resolve(out);
        });
        socket.on("error", (err) => { socket.destroy(); reject(err); });
        socket.on("timeout", () => { socket.destroy(); reject(new Error("Handshake timed out")); });
    });
}

/**
 * Memoise per scan.
 *
 * Fifteen header checks read the same homepage and eight TLS checks read the
 * same certificate. Without this each would fetch its own copy: fifty-eight
 * checks would mean dozens of requests to one site, which looks like an
 * attack from the far end and is the opposite of the passive scan we promise.
 *
 * The result is cached on the target, so a cache lives exactly as long as one
 * scan. A REJECTED promise is cached too, deliberately — if the homepage is
 * unreachable, every check that needs it should fail fast with the same
 * reason rather than retrying the same dead host fifteen times.
 */
function memo(target, key, fn) {
    if (!target._memo) target._memo = new Map();
    if (!target._memo.has(key)) target._memo.set(key, fn());
    return target._memo.get(key);
}

/**
 * Map with bounded concurrency.
 *
 * Fifty-eight checks fired at one host at once looks like an attack from the
 * far end, and is the opposite of the passive scan printed on the site. It
 * would also get our address blocked, after which every scan is inconclusive.
 */
async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return out;
}

/**
 * A DNS lookup that separates "there is no such record" from "we could not
 * ask".
 *
 * This distinction IS the product. ENOTFOUND and ENODATA mean the server
 * answered and there is genuinely nothing there — a real negative a check may
 * act on. Anything else (SERVFAIL, timeout, refused) means we did not get an
 * answer, and a check that treats that as "no record" reports a finding
 * against a domain that may be perfectly configured.
 *
 * Resolves to { ok: true, data } or { ok: false, error }. It never throws, so
 * a caller must look at `ok` rather than relying on a catch.
 */
const ABSENT = new Set(["ENOTFOUND", "ENODATA", "NOTFOUND"]);

async function resolveSafe(fn, name) {
    try {
        return { ok: true, data: await fn(name) };
    } catch (err) {
        if (ABSENT.has(err.code)) return { ok: true, data: [] };   // answered: nothing there
        return { ok: false, error: err.code || err.message };      // no answer
    }
}

const txtSafe = (name) => resolveSafe(async (n) => {
    const records = await dns.resolveTxt(n);
    return records.map((parts) => parts.join(""));
}, name);

const mxSafe = (name) => resolveSafe((n) => dns.resolveMx(n), name);
const caaSafe = (name) => resolveSafe((n) => dns.resolveCaa(n), name);
const aSafe = (name) => resolveSafe((n) => dns.resolve4(n), name);
const nsSafe = (name) => resolveSafe((n) => dns.resolveNs(n), name);
const cnameSafe = (name) => resolveSafe((n) => dns.resolveCname(n), name);

/**
 * Hostnames published for this domain in certificate transparency logs.
 *
 * Two checks in different files need this — BREACH-METADATA-55 looks for
 * internal-sounding names, SURF-STAGING-03 looks for reachable staging
 * environments — so it lives here rather than in either of them, and is
 * memoised so crt.sh is asked exactly once per scan.
 *
 * Resolves to { ok: true, names: Set } or { ok: false, error }. crt.sh is
 * frequently slow or rate-limited, and a check that cannot read it must be
 * inconclusive rather than reporting that a domain has no subdomains.
 */
function ctNames(target) {
    return memo(target, "ct:names", async () => {
        try {
            const res = await withTimeout(
                fetchUrl(`https://crt.sh/?q=%25.${encodeURIComponent(target.domain)}&output=json`, { maxBytes: 524288 }),
                11000, "Certificate transparency lookup");

            if (res.status !== 200) return { ok: false, error: `crt.sh returned HTTP ${res.status}` };

            let rows;
            try { rows = JSON.parse(res.body); }
            catch (e) { return { ok: false, error: "Certificate transparency response was not readable" }; }
            if (!Array.isArray(rows)) return { ok: false, error: "Unexpected response shape" };

            const names = new Set();
            rows.forEach((r) => String(r.name_value || "").split("\n").forEach((n) => {
                const clean = n.trim().toLowerCase().replace(/^\*\./, "");
                if (clean.endsWith(target.domain)) names.add(clean);
            }));
            return { ok: true, names };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });
}

module.exports = {
    withTimeout, fetchUrl, getCertificate, txtRecords, typoVariants,
    tlsHandshake, memo, mapLimit, ctNames,
    resolveSafe, txtSafe, mxSafe, caaSafe, aSafe, nsSafe, cnameSafe,
};

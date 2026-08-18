// ─────────────────────────────────────────────────────────────────────────
//  routes — the single list of paths this site actually serves.
//
//  Used by two things that must agree:
//    server.js            to answer 404 for anything not listed, instead of
//                         serving index.html with a 200 (a "soft 404")
//    Sitemap_server.js    to generate sitemap.xml
//
//  ⚠️  A ROUTE ADDED TO src/App.js MUST BE ADDED HERE TOO.
//
//  Two lists that must agree eventually disagree. The failure is quiet and
//  nasty in this direction: a new route missing from here still renders
//  perfectly for a human, because index.html is served either way — it just
//  carries a 404 status, so crawlers drop it and nobody notices for months.
//
//  CommonJS on purpose: server.js requires this at boot, and the frontend
//  does not import it. Same convention as scan_engine.js.
// ─────────────────────────────────────────────────────────────────────────

// Exact paths. /data-request is here — it must serve normally — but it is
// excluded from the sitemap and carries noindex, because it is a personal
// form and has no business in a search result.
const EXACT_ROUTES = [
    "/",
    "/tools",
    "/pricing",
    "/services",
    "/coverage",
    "/how-it-works",
    "/trust",
    "/contact",
    "/legal",
    "/data-request",
];

// Paths whose children are valid: /tools/ssl, /legal/privacy, /result/<uuid>,
// /preferences/<token>. The trailing slash is required — "/tools" is matched
// exactly above, and without it "/toolsomething" would match too.
const PREFIX_ROUTES = ["/tools/", "/legal/", "/result/", "/preferences/"];

const TOOL_SLUGS = ["email-spoofing", "ssl", "headers", "lookalike", "password"];
const LEGAL_KEYS = ["terms", "privacy", "refunds", "cookies"];

/** Does this path correspond to a page the React app can render? */
function isKnownRoute(pathname) {
    const path = String(pathname || "/").replace(/\/+$/, "") || "/";
    if (EXACT_ROUTES.includes(path)) return true;
    return PREFIX_ROUTES.some((p) => path.startsWith(p) && path.length > p.length);
}

/**
 * Routes for sitemap.xml, with priority.
 *
 * The five tools sit at 0.9 deliberately: they are the traffic engine. Each
 * is a separate front door for somebody searching a specific question, and
 * the scan converts them once they are here.
 *
 * /result, /preferences and /data-request are absent by design — they mirror
 * the Disallow lines in robots.txt and the noindex tags in the app.
 */
const SITEMAP_ROUTES = [
    { path: "/", priority: "1.0" },
    ...TOOL_SLUGS.map((s) => ({ path: `/tools/${s}`, priority: "0.9" })),
    { path: "/pricing", priority: "0.9" },
    { path: "/services", priority: "0.8" },
    { path: "/coverage", priority: "0.8" },
    { path: "/tools", priority: "0.5" },
    { path: "/how-it-works", priority: "0.5" },
    { path: "/trust", priority: "0.5" },
    { path: "/contact", priority: "0.5" },
    { path: "/legal", priority: "0.5" },
    ...LEGAL_KEYS.map((k) => ({ path: `/legal/${k}`, priority: "0.5" })),
];

module.exports = {
    EXACT_ROUTES,
    PREFIX_ROUTES,
    TOOL_SLUGS,
    LEGAL_KEYS,
    SITEMAP_ROUTES,
    isKnownRoute,
};

// ─────────────────────────────────────────────────────────────────────────
//  Sitemap_server — GET /sitemap.xml
//
//  Generated from src/utils/routes.js rather than kept as a static file in
//  public/. A static sitemap is correct on the day it is written and wrong
//  by the next deployment, and nothing ever fails to tell you so.
//
//  This matters more here than on an ordinary site: a single-page app gives
//  a crawler no links to follow until JavaScript runs, so a route nobody
//  links to externally may simply never be found.
//
//  Mounted BEFORE express.static and the SPA fallback in server.js — after
//  them, the fallback would answer this path with index.html.
// ─────────────────────────────────────────────────────────────────────────

const express = require("express");
const { SITEMAP_ROUTES } = require("../utils/routes");

const router = express.Router();

const SITE_URL =
    (process.env.REACT_APP_SITE_URL || "https://dshield.dolluzcorp.com").replace(/\/+$/, "");

/** XML text escaping. Our paths are plain, but a sitemap that can be broken
 *  by one ampersand in a future route is a sitemap waiting to break. */
const xmlEscape = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

router.get("/", (req, res) => {
    // Date only, no time. lastmod to the second on a page that did not change
    // teaches crawlers the value is noise and to stop trusting it.
    const lastmod = new Date().toISOString().slice(0, 10);

    const urls = SITEMAP_ROUTES.map(({ path, priority }) => `  <url>
    <loc>${xmlEscape(SITE_URL + path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
});

module.exports = router;

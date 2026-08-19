// ─────────────────────────────────────────────────────────────────────────
//  pdf — render a report to a PDF, once, and freeze it.
//
//  A report is evidence. A customer and their auditor must see the IDENTICAL
//  document every time, months apart, so the file is generated once at
//  fulfilment, hashed, stored, and served as bytes thereafter. Nothing is
//  ever regenerated on download.
//
//  ⚠️  CHROME IS LAUNCHED WITH --no-sandbox, which is a real trade-off and
//  is only acceptable because we render OUR OWN template. Nothing
//  customer-supplied is ever passed as HTML — pdf-template.js escapes every
//  interpolated value, and that is what makes this safe rather than the
//  sandbox flag.
//
//  ⚠️  ONE RENDER AT A TIME. Chrome is memory-hungry; two simultaneous
//  renders on a 4GB box is how the OOM killer gets involved, and the symptom
//  is intermittent failures that are very hard to attribute.
// ─────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const RENDER_TIMEOUT_MS = 60000;

const reportDir = () => path.resolve(process.env.REPORT_DIR || "./storage/reports");
const pdfEnabled = () => String(process.env.PDF_ENABLED || "").toLowerCase() === "true";

/** Is PDF generation actually possible right now? */
async function isPdfAvailable() {
    if (!pdfEnabled()) return { ok: false, reason: "PDF_ENABLED is not true" };
    let puppeteer;
    try { puppeteer = require("puppeteer"); }
    catch (e) { return { ok: false, reason: "puppeteer is not installed" }; }

    try {
        const explicit = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
        const exe = explicit || await puppeteer.executablePath();
        if (!exe || !fs.existsSync(exe)) {
            return { ok: false, reason: `Chrome not found at ${exe || "(unresolved)"} — run: npx puppeteer browsers install chrome` };
        }
        return { ok: true, executablePath: exe };
    } catch (e) {
        return { ok: false, reason: `Chrome could not be resolved: ${e.message}` };
    }
}

/* ── the browser, reused ──────────────────────────────────────────────
   Launching Chrome per report costs about two seconds and leaks processes
   under load. One instance is kept and relaunched if it has died. */
let browser = null;

async function getBrowser() {
    if (browser && browser.connected) return browser;
    if (browser) { try { await browser.close(); } catch (e) { /* already gone */ } browser = null; }

    const avail = await isPdfAvailable();
    if (!avail.ok) throw new Error(avail.reason);

    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
        headless: true,
        executablePath: avail.executablePath,
        args: [
            "--no-sandbox",              // see the note at the top of this file
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",   // /dev/shm is tiny in most containers
            "--disable-gpu",
        ],
    });
    return browser;
}

async function closeBrowser() {
    if (browser) { try { await browser.close(); } catch (e) { /* nothing to do */ } browser = null; }
}

/* ── depth-one queue ───────────────────────────────────────────────────
   Renders are chained onto one promise, so a second request waits rather
   than starting a second Chrome. */
let chain = Promise.resolve();

function serialise(fn) {
    const run = chain.then(fn, fn);
    // Keep the chain alive even when a render rejects.
    chain = run.then(() => undefined, () => undefined);
    return run;
}

/**
 * Render one report.
 *
 * @returns { path, relPath, sha256, bytes }
 */
async function renderReportPdf(report, orderRef, opts = {}) {
    return serialise(async () => {
        const { renderReportHtml } = require("./pdf-template");

        const dir = reportDir();
        await fsp.mkdir(dir, { recursive: true });
        const file = path.join(dir, `${String(orderRef).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`);

        /* Reuse an existing file rather than producing a second one. A report
           is evidence: two downloads must not differ, and re-rendering would
           change the timestamp and therefore the hash. */
        const contentShaEarly = crypto.createHash("sha256")
            .update(JSON.stringify({ orderRef, report })).digest("hex");

        if (!opts.force && fs.existsSync(file)) {
            const buf = await fsp.readFile(file);
            return {
                path: file, relPath: path.basename(file), reused: true,
                sha256: crypto.createHash("sha256").update(buf).digest("hex"),
                contentSha: contentShaEarly,
                bytes: buf.length,
            };
        }

        /* THE FINGERPRINT IS A HASH OF THE REPORT CONTENT, NOT OF THE FILE.
           The task asks for the file's own SHA-256 printed inside the file,
           and that cannot exist: embedding the hash changes the bytes, which
           changes the hash. The purpose — letting a customer and an auditor
           confirm two copies are the same document — is served by hashing the
           REPORT DATA, which is stable and reproducible. The file's own hash
           is still computed and stored on the order for integrity of the
           stored bytes; it simply is not printed inside itself. */
        const contentSha = contentShaEarly;

        const b = await getBrowser();
        const page = await b.newPage();

        let timer;
        try {
            const html = renderReportHtml(report, { orderRef, shaShort: contentSha.slice(0, 16) });

            // A hard ceiling. On timeout the page is closed and the browser is
            // dropped, so a wedged render cannot hold the queue forever.
            const killed = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`PDF render exceeded ${RENDER_TIMEOUT_MS / 1000}s`)), RENDER_TIMEOUT_MS);
            });

            const work = (async () => {
                // `domcontentloaded`, not `networkidle` — this document makes no
                // network requests, and waiting for idle would just add latency.
                await page.setContent(html, { waitUntil: "domcontentloaded" });
                await page.emulateMediaType("print");

                /* displayHeaderFooter REQUIRES explicit margins. Without them
                   the header and footer render outside the printable area and
                   are simply invisible — an hour of debugging that looks like
                   the templates being ignored. */
                return page.pdf({
                    format: "A4",
                    printBackground: true,
                    displayHeaderFooter: true,
                    margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
                    headerTemplate: "<div></div>",
                    footerTemplate: `
                      <div style="width:100%;font-size:7pt;color:#7b8189;padding:0 14mm;
                                  font-family:-apple-system,'Segoe UI',Arial,sans-serif;
                                  display:flex;justify-content:space-between;">
                        <span>${escapeForTemplate(report.domain)} &middot; ${escapeForTemplate(orderRef)} &middot; ${escapeForTemplate(contentSha.slice(0, 16))}</span>
                        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
                      </div>`,
                });
            })();

            const buf = await Promise.race([work, killed]);
            clearTimeout(timer);

            await fsp.writeFile(file, buf);
            const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
            return { path: file, relPath: path.basename(file), sha256, contentSha, bytes: buf.length, reused: false };
        } catch (err) {
            clearTimeout(timer);
            // A wedged Chrome must not poison every later render.
            await closeBrowser();
            throw err;
        } finally {
            try { if (!page.isClosed()) await page.close(); } catch (e) { /* browser already gone */ }
        }
    });
}

/** The footer goes into Chrome's own template, so it needs escaping too. */
function escapeForTemplate(v) {
    return String(v === null || v === undefined ? "" : v)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

module.exports = { isPdfAvailable, renderReportPdf, closeBrowser, reportDir, pdfEnabled };

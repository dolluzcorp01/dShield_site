require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();

// Hardcoded, and deliberately NOT read from process.env.PORT.
//
// react-scripts loads .env into process.env before it starts, and its dev
// server port is `parseInt(process.env.PORT) || 3000`. A PORT line in .env
// meant for Express is therefore taken by the React dev server first, which
// then binds the FRONTEND to the API's port and leaves nothing for the API.
// Same convention as the sibling dApps: dAdmin 4002, dShield 4008.
const port = 4008;

// ✅ CORS — explicit allowlist in production; in development also allow any
// localhost / 127.0.0.1 port so the React dev server on 3000 isn't blocked.
const isProd = process.env.NODE_ENV === "production";

const allowedOrigins = [
    'https://dshield.dolluzcorp.com',   // Production URL (this app)
    'https://dolluzcorp.com',
];

// A browser cannot forge a localhost Origin from a real site, and this is
// gated on !isProd, so production stays locked to the allowlist above.
const isLocalhostOrigin = (origin) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);   // same-origin / server-to-server / health checks
        const clean = origin.replace(/\/$/, '');
        if (allowedOrigins.includes(clean)) return callback(null, true);
        if (!isProd && isLocalhostOrigin(clean)) return callback(null, true);
        console.error("❌ Blocked by CORS:", origin);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
}));

/* ⚠️  THE WEBHOOK NEEDS THE RAW BYTES, AND THIS MOUNT MUST STAY ABOVE
   express.json(). THIS IS NOT A MISTAKE.

   Razorpay signs the exact body it sent. express.json() would parse it, and
   anything we then re-stringify differs by key order and whitespace, so the
   HMAC never matches — and the failure looks exactly like a wrong secret,
   which is a genuinely miserable afternoon.

   Scoped to this one path, so every other route still gets parsed JSON. */
app.use("/api/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }));

// ✅ Middleware for parsing JSON and reading HTTP-only cookies
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Behind nginx in production, req.ip is the proxy unless we trust it. The
// scan limiter is per IP, so without this every visitor shares one bucket
// and the first dozen scans of the hour lock out everybody else.
if (isProd) app.set("trust proxy", 1);

// Routes
const ScanRoutes = require('./src/backend_routes/Scan_server');
const ToolsRoutes = require('./src/backend_routes/Tools_server');
const LeadRoutes = require('./src/backend_routes/Lead_server');

// Legal_server exports three routers rather than one. They share a file
// because they share the suppression and document helpers, but they mount at
// three unrelated paths — folding them into one router would mean writing
// the mount point into each route string.
const { legalRouter, preferencesRouter, dataRequestRouter } = require('./src/backend_routes/Legal_server');

// Checkout, payment verification, fulfilment and report delivery.
const { router: PaymentRoutes, reportsRouter: ReportRoutes } = require('./src/backend_routes/Payment_server');

app.use("/api/scan", ScanRoutes);
app.use("/api/tools", ToolsRoutes);
app.use("/api/leads", LeadRoutes);
app.use("/api/legal", legalRouter);
app.use("/api/preferences", preferencesRouter);
app.use("/api/data-request", dataRequestRouter);
app.use("/api/payments", PaymentRoutes);
app.use("/api/reports", ReportRoutes);

// Mounted here, before the static and SPA-fallback block below. After them,
// express.static would miss it and the fallback would answer with index.html.
const SitemapRoutes = require('./src/backend_routes/Sitemap_server');
app.use("/sitemap.xml", SitemapRoutes);

// Health check — used by the deploy script and by uptime monitoring.
app.get("/api/health", (req, res) => {
    res.json({ ok: true, app: "dshield-global", time: new Date().toISOString() });
});

// Serve the built React app in production. In development the React dev
// server runs separately on 3000 and proxies here.
if (isProd) {
    const build = path.join(__dirname, "build");
    const { isKnownRoute } = require("./src/utils/routes");

    app.use(express.static(build));

    /* SPA fallback, with an honest status code.
     *
     * Previously every path returned 200 and let React render NotFound. To a
     * person that looks right; to a crawler it is a "soft 404" — the server
     * said the page exists and is healthy, so every typo and every stale link
     * anyone ever posts becomes an indexed page, diluting the ranking of the
     * pages that matter.
     *
     * The fix is the status, not the body. index.html is still served either
     * way, so React still renders a proper NotFound page rather than a bare
     * error. The difference is invisible to a person and decisive for a
     * crawler.
     *
     * Known paths live in src/utils/routes.js — add new routes there as well
     * as in src/App.js. */
    app.get(/^\/(?!api\/).*/, (req, res) => {
        const status = isKnownRoute(req.path) ? 200 : 404;
        res.status(status).sendFile(path.join(build, "index.html"));
    });
}

/* Mail worker.
 *
 * Runs IN-PROCESS, which is only correct because this site is a single
 * instance. Under PM2 cluster mode four processes would each poll
 * mail_outbox on the same schedule and every message would go out four
 * times. If that day comes the fix is a lock or one dedicated worker
 * process — not a shorter interval. See the header of
 * src/workers/mail-worker.js. */
if (String(process.env.MAIL_WORKER_ENABLED || "").toLowerCase() === "true") {
    const { startMailWorker } = require("./src/workers/mail-worker");
    const getDBConnection = require("./config/db");
    startMailWorker(getDBConnection(process.env.DB_NAME || "dshield"));
} else {
    console.log("✉️  Mail worker disabled (MAIL_WORKER_ENABLED is not 'true'). Messages will queue.");
}

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});

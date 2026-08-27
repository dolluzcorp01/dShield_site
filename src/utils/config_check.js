// ─────────────────────────────────────────────────────────────────────────
//  config_check — say out loud, at boot, what is configured badly enough to
//  break something quietly.
//
//  WHY THIS EXISTS.
//  Every entry below is a value that is empty or wrong RIGHT NOW on some
//  environment, and whose failure mode is silence. RAZORPAY_WEBHOOK_SECRET
//  is the worst of them: checkout works, the customer is charged, the
//  webhook arrives, signature validation fails, nothing is fulfilled, and
//  nothing anywhere says so. The scan keeps working, so the site looks fine.
//
//  The failure mode this codebase has produced repeatedly is a component
//  reporting success for work it did not do. A deploy that silently loses
//  every payment is that failure with money attached.
//
//  WARN, DO NOT EXIT.
//  A server that refuses to start over a missing webhook secret is worse
//  than one that starts with the free scan working. The free scan is what
//  most visitors came for and it needs none of this. Refusing to boot turns
//  a broken checkout into a broken site.
//
//  THE ONE EXCEPTION, for whoever adds the first one:
//  A SIGNING SECRET LEFT AT A PLACEHOLDER MUST EXIT. Session tokens, JWTs,
//  cookie secrets — anything where a known default means anyone can mint a
//  valid credential. There, starting IS the dangerous outcome: the server
//  comes up, appears healthy, and accepts forged tokens from anybody who has
//  read the repository. Warning is not enough because nothing downstream
//  fails visibly.
//
//  This app has no such secret today — it has no login, no sessions and no
//  JWTs, because portal access lives in a different application. If one is
//  ever added, put it in FATAL below rather than WARNINGS, and the rule
//  survives the person who wrote it.
//
//  CommonJS: server.js requires this at boot, the same as routes.js.
// ─────────────────────────────────────────────────────────────────────────

/** Empty, whitespace-only or unset all count as missing. */
const blank = (v) => String(v ?? "").trim() === "";

/* ── things that must never run with a placeholder ────────────────────────
 *
 * EMPTY BY DESIGN. See the header: entries here EXIT the process, and are
 * only for secrets where a known default lets an outsider forge a
 * credential. Nothing in this app qualifies yet.
 *
 * Shape, for whoever adds the first one:
 *
 *   { name: "SESSION_SECRET",
 *     bad: (v) => blank(v) || v === "change-me",
 *     consequence: "anyone who has read the repo can mint a valid session" }
 */
const FATAL = [];

/* ── things that break quietly and must be shouted about ──────────────── */
const WARNINGS = [
    {
        name: "RAZORPAY_WEBHOOK_SECRET",
        bad: (v) => blank(v),
        state: "empty",
        consequence: "webhooks fail signature validation, customers pay and receive nothing",
    },
    {
        /* This one fires in local development too, and that is deliberate.
           There is no way to tell "developer on a laptop" from "production
           box where somebody forgot the variable" — and the second is the
           case that silently hands the whole internet one rate-limit
           bucket. A warning you see every day and understand is cheaper
           than a limiter nobody notices is broken. */
        name: "NODE_ENV",
        bad: (v) => v !== "production",
        state: "not 'production'",
        consequence: "trust proxy off, the scan rate limit applies to the whole internet at once",
    },
    {
        name: "SENDGRID_API_KEY",
        bad: (v) => blank(v),
        state: "empty",
        consequence: "mail queues but never sends",
    },
    {
        name: "RAZORPAY_KEY_ID",
        bad: (v) => String(v ?? "").startsWith("rzp_test"),
        state: "starts rzp_test",
        consequence: "test mode, no real money moves",
    },
];

/**
 * Check the environment and report.
 *
 * Prints nothing at all when everything is configured — a quiet boot should
 * mean a good one, and a block that appears every time is a block people
 * stop reading.
 *
 * @param {NodeJS.ProcessEnv} env  defaults to process.env; injectable so the
 *                                 rules can be tested without setting real
 *                                 variables on the process.
 * @param {object} io              console-like sink, for the same reason.
 * @returns {{fatal: string[], warnings: string[]}} the names that tripped.
 */
function checkConfig(env = process.env, io = console) {
    const fatal = FATAL.filter((c) => c.bad(env[c.name]));
    const warnings = WARNINGS.filter((c) => c.bad(env[c.name]));

    if (fatal.length) {
        const width = Math.max(...fatal.map((c) => c.name.length));
        io.error("");
        io.error("╔══════════════════════════════════════════════════════════════════════════╗");
        io.error("║  ❌  REFUSING TO START — a signing secret is at its placeholder value    ║");
        io.error("╚══════════════════════════════════════════════════════════════════════════╝");
        fatal.forEach((c) => {
            io.error(`   ${c.name.padEnd(width)}  →  ${c.consequence}`);
        });
        io.error("");
        io.error("   Starting is the dangerous outcome here: the server would come up, look");
        io.error("   healthy, and accept credentials anyone could forge. Set it and retry.");
        io.error("");
        return { fatal: fatal.map((c) => c.name), warnings: warnings.map((c) => c.name) };
    }

    if (!warnings.length) return { fatal: [], warnings: [] };

    const width = Math.max(...warnings.map((c) => c.name.length));
    const state = Math.max(...warnings.map((c) => c.state.length));

    io.warn("");
    io.warn("╔══════════════════════════════════════════════════════════════════════════╗");
    io.warn("║  ⚠️   CONFIGURATION — these fail SILENTLY. The site will look fine.      ║");
    io.warn("╚══════════════════════════════════════════════════════════════════════════╝");
    warnings.forEach((c) => {
        io.warn(`   ${c.name.padEnd(width)}  ${c.state.padEnd(state)}`);
        io.warn(`   ${" ".repeat(width)}  └─ ${c.consequence}`);
    });
    io.warn("");
    io.warn(`   ${warnings.length} of ${WARNINGS.length} checks failed. The free scan and the five tools do not`);
    io.warn("   depend on any of them, which is why this is a warning and not a refusal.");
    io.warn("");

    return { fatal: [], warnings: warnings.map((c) => c.name) };
}

module.exports = { checkConfig, FATAL, WARNINGS };

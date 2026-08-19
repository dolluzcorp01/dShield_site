// ─────────────────────────────────────────────────────────────────────────
//  plans — the single price list.
//
//  This lived inside Lead_server.js and is now shared, because checkout and
//  the pricing page disagreeing about what something costs is the kind of
//  problem you find out about from a customer.
//
//  ── amountPaise ────────────────────────────────────────────────────────
//  Razorpay works in the smallest currency unit, so ₹4,312 is 431200.
//  Getting this wrong by a factor of a hundred is the classic first
//  integration bug, and it is wrong in both directions: charging a hundred
//  times too much, or a hundred times too little.
//
//  ⚠️  THE SITE DISPLAYS USD AND RAZORPAY CHARGES INR. The paise figures
//  below were converted at ₹88 to the dollar. That rate is fixed in this
//  file and does not track the market, so it needs reviewing before launch
//  and periodically after — and the pricing page should show the rupee
//  price a customer will actually be charged. See the note in the report.
//
//  ── available ──────────────────────────────────────────────────────────
//  A tier is only buyable when Razorpay is configured. With no key the
//  pricing page keeps offering "Notify me" rather than a checkout button
//  that cannot work.
// ─────────────────────────────────────────────────────────────────────────

const USD_TO_INR = 88;
const paiseFor = (usd) => usd * USD_TO_INR * 100;

/** True only when a live key is configured — see the note above. */
const paymentsConfigured = () => {
    const k = String(process.env.RAZORPAY_KEY_ID || "").trim();
    return k.startsWith("rzp_");
};

const BASE_PLANS = [
    {
        key: "snapshot", name: "Free scan", price: 0, display: "Free",
        billing: "No card, no sign-up",
        tagline: "Where you stand, from outside",
        features: [
            "Grade across the five domains a scan can measure",
            "How many issues, and how serious",
            "The full 23-domain coverage map",
            "Unlimited, forever",
        ],
        notIncluded: ["What the issues actually are"],
        available: true,
        cta: "Run a free scan",
    },
    {
        key: "basic", name: "Basic", price: 49, display: "$49",
        billing: "one-time",
        tagline: "Knowing what is wrong",
        features: [
            "Every finding named, with the evidence",
            "Severity and priority for each",
            "A timeline per finding",
            "PDF and machine-readable export",
        ],
        notIncluded: ["How to fix any of it"],
        available: false,
        cta: "Notify me",
    },
    {
        key: "advanced", name: "Advanced", price: 199, display: "$199",
        billing: "one-time or monthly",
        tagline: "Measuring, not just asking",
        highlight: true,
        features: [
            "Everything in Basic",
            "Step-by-step remediation for every finding",
            "Effort estimate and verification step",
            "A prioritised 90-day roadmap",
            "Connect 3 of your own systems, read-only",
            "We measure your posture directly",
        ],
        available: false,
        cta: "Notify me",
    },
    {
        key: "full_protection", name: "Full Protection", price: 499, display: "$499",
        billing: "one-time or monthly",
        tagline: "Seeing all 23 domains",
        features: [
            "Everything in Advanced",
            "Connect 15 systems",
            "222-question guided assessment",
            "Covers the 18 domains no scan can reach",
            "Two consultation sessions with a specialist",
            "Log and document analysis",
        ],
        available: false,
        cta: "Talk to us",
    },
    {
        // Named for what it is: Extended Support is not an alternative to Full
        // Protection, it is Full Protection with the remediation carried out.
        // The key stays `extended_support` — it is written into leads and
        // enquiries rows already, and renaming it would orphan them.
        key: "extended_support", name: "Full Protection + Extended Support", price: 999, display: "$999+",
        billing: "per month",
        tagline: "Having it fixed, not documented",
        features: [
            "Everything in Full Protection",
            "Connect 25 systems",
            "Remediation carried out by our engineers",
            "Four consultation hours every month",
            "A named lead who knows your estate",
            "Three months post-resolution support",
        ],
        available: false,
        cta: "Talk to us",
    },
];

/* Prices are applied here rather than written into each entry above, so the
   conversion lives in exactly one place. `available` is computed at read
   time because it depends on whether a key is configured, which is
   environment rather than data. */
const PAISE = {
    snapshot: 0,
    basic: paiseFor(49),
    advanced: paiseFor(199),
    full_protection: paiseFor(499),
    extended_support: paiseFor(999),
};

// Which tiers actually produce a report from a scan. extended_support is a
// retainer, not a report, and must not be sold through this checkout.
const ASSESSMENT_TIERS = new Set(["basic", "advanced", "full_protection"]);

function getPlans() {
    const live = paymentsConfigured();
    return BASE_PLANS.map((p) => ({
        ...p,
        amountPaise: PAISE[p.key] ?? 0,
        amountInr: (PAISE[p.key] ?? 0) / 100,
        available: p.key === "snapshot" ? true : (live && ASSESSMENT_TIERS.has(p.key)),
        cta: p.key === "snapshot" ? p.cta
            : (live && ASSESSMENT_TIERS.has(p.key)) ? "Buy report" : p.cta,
    }));
}

const getPlan = (key) => getPlans().find((p) => p.key === key) || null;

module.exports = {
    getPlans, getPlan, paymentsConfigured,
    ASSESSMENT_TIERS, USD_TO_INR, PAISE,
};

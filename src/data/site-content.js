// ─────────────────────────────────────────────────────────────────────────
//  site-content — the words and tables the public site renders.
//
//  Ported from the frozen customer-website prototype in
//  dShield-v6.3-COMPLETE.zip:
//
//      CURRENT/frontend/01-customer-website-v5.9-FROZEN.jsx
//
//  WHY THIS IS A SEPARATE FILE.
//  The prototype is one 1,954-line component with its tables declared at the
//  top. Here the same tables are shared by the home page and the standalone
//  routes (/pricing, /services, /coverage, /tools), which must not drift
//  apart — two lists describing the same product is precisely the defect
//  journey testing caught in the main engine: the site promised five areas,
//  the engine covered two, and every check passed because each artefact was
//  correct on its own terms.
//
//  ⚠️  DOMAINS BELOW CARRIES NO SCORES.
//  The prototype hardcodes score:62, score:78, score:41, score:94, score:10
//  and strings like "your certificate expires in 19 days", because it renders
//  with LIVE_API = false and never reads the scan response — scanResult is
//  assigned on line 913 of that file and never referenced again.
//
//  Shipping those constants would show every visitor the same five invented
//  grades for their own domain. They are dropped here on purpose. Real
//  numbers come from the scan response and nowhere else.
//
//  ES modules on purpose: the frontend imports this. scan_engine.js and
//  routes.js are CommonJS because server.js requires them at boot.
// ─────────────────────────────────────────────────────────────────────────

/* The wording on the marketing opt-in.

   Group-scoped by design: it names Dolluz Corp and its products, not dShield
   alone. That is what lets a dShield unsubscribe be honoured without
   destroying a permission the person gave to the company — and why the
   preference centre can offer "stop dShield" and "stop everything" as two
   separate, honest choices rather than one button that quietly means the
   other. The exact string is submitted with the tick, so a later change to
   this copy cannot rewrite what a past contact agreed to. */
export const OPT_IN_TEXT =
    "I agree to receive updates, offers and security briefings from Dolluz Corp and its products. "
    + "I can change this or unsubscribe at any time.";

/* The four categories on the preference centre. Kept few on purpose: a person
   deciding what to keep will scan four boxes and choose, and will abandon
   eight. These must match the categories the CRM stores. */
export const PREF_CATEGORIES = [
    ["product_updates", "Product updates and new features",
        "What has changed in dShield and what is coming."],
    ["offers", "Offers and seasonal discounts",
        "Pricing offers, renewals and seasonal promotions."],
    ["newsletter", "Security newsletter and threat briefings",
        "What is happening in cyber security and what it means for you."],
    ["events", "Webinars and events",
        "Invitations to sessions we run, online and in person."],
];

/* ── the 23 risk areas, in customer language ──────────────────────────────

   The names here are the ones a buyer recognises — "Your email", not "Email
   & Domain Security". The engineering names still exist in scan_engine.js
   because a report has to line up with the main product; these are what the
   site says out loud.

   `seen` marks the five a scan can reach without anything from the customer.
   It must stay in step with ALL_DOMAINS in src/utils/scan_engine.js — the
   free scan covers domains 1, 4, 6, 10 and 20 via eight checks.

   `by` is how the other eighteen get answered: "connect" means a system the
   customer links, "questions" means the guided review. */
export const DOMAINS = [
    { n: 1, name: "Your website, from outside", seen: true },
    { n: 2, name: "Your web applications", hides: "whether someone can guess their way in, and whether anyone would notice", by: "questions" },
    { n: 3, name: "Your network", hides: "what is still switched on that nobody remembers setting up", by: "questions" },
    { n: 4, name: "Your certificates", seen: true },
    { n: 5, name: "Who can log in", hides: "how many of your administrators have no second step to log in", by: "connect", tool: "Microsoft 365" },
    { n: 6, name: "Your email", seen: true },
    { n: 7, name: "Your laptops and phones", hides: "which devices are unencrypted, unpatched, or have quietly stopped reporting in", by: "connect", tool: "Intune" },
    { n: 8, name: "Your cloud storage", hides: "which files are readable by anyone on the internet right now", by: "connect", tool: "AWS" },
    { n: 9, name: "Your suppliers", hides: "which outside companies can reach your data, and who approved that", by: "questions" },
    { n: 10, name: "Leaked passwords", seen: true },
    { n: 11, name: "If you were locked out", hides: "whether your backups have ever actually been tested by restoring them", by: "questions" },
    { n: 12, name: "Would you notice", hides: "whether anyone would spot a break-in, and how long it would take", by: "connect", tool: "Sentinel" },
    { n: 13, name: "If everything stopped", hides: "how many days you could keep trading with your systems down", by: "questions" },
    { n: 14, name: "Rules and audits", hides: "whether you would pass the audit your biggest client is about to ask for", by: "questions" },
    { n: 15, name: "Your people", hides: "whether a junior would question a payment request that looked like it came from you", by: "questions" },
    { n: 16, name: "Your building", hides: "who can walk into your server room, and whether anyone would know", by: "questions" },
    { n: 17, name: "How you build software", hides: "whether passwords are sitting in your own code", by: "connect", tool: "GitHub" },
    { n: 18, name: "AI tools your staff use", hides: "what your team is pasting into AI chatbots", by: "questions" },
    { n: 19, name: "Machines on the floor", hides: "whether factory equipment can be reached from the office network", by: "questions" },
    { n: 20, name: "Fake versions of you", seen: true },
    { n: 21, name: "Who targets your trade", hides: "who is going after companies like yours this year", by: "questions" },
    { n: 22, name: "Invoice fraud", hides: "how a fake invoice would travel through your accounts team", by: "questions" },
    { n: 23, name: "If you were acquired", hides: "what a buyer would find before you do", by: "questions" },
];

/* The five a scan reaches, and the connector examples. Derived rather than
   listed twice — a second hand-maintained list is a second thing to forget. */
export const SEEN_DOMAINS = DOMAINS.filter((d) => d.seen);
export const CONNECT_DOMAINS = DOMAINS.filter((d) => d.by === "connect");

/* Domain number -> the customer-facing name, for the result page. The engine
   returns domain numbers and its own DOMAIN_NAMES; this is the translation
   into the words the rest of the site uses. */
export const DOMAIN_LABELS = Object.fromEntries(DOMAINS.map((d) => [d.n, d.name]));

/* ── the tiers ────────────────────────────────────────────────────────────

   The headline word is "Sample", not "FREE". A giant FREE next to four paid
   tiers makes the paid ones look like the exception. "Sample" says the same
   thing and sounds like the first step rather than the whole offer.

   `covers` is how many of the 23 areas that tier scores. */
export const TIERS = [
    {
        key: "free", name: "Free check", price: "SAMPLE", covers: 5,
        line: "Your grade, and an honest map of what we could not see.",
        gets: ["Your grade out of 100", "How many problems, and how serious",
            "All 23 areas named", "What we could not see, and why"],
    },
    {
        key: "basic", name: "Basic", price: "$49", covers: 5,
        line: "Every problem, with the proof.",
        gets: ["Everything in the free check", "Each problem, with the evidence",
            "Ranked by what to fix first", "A PDF you can forward"],
    },
    {
        key: "adv", name: "Advanced", price: "$199", covers: 8, star: true,
        line: "We stop guessing and start measuring.",
        gets: ["Everything in Basic", "How to fix each problem", "Effort estimate per fix",
            "A 90-day plan", "Connect 3 of your systems", "We check again with what they show us"],
    },
    {
        key: "full", name: "Full Protection", price: "$499", covers: 21,
        line: "The eighteen we cannot see from outside.",
        gets: ["Everything in Advanced", "A guided 222-question review", "Connect 15 systems",
            "Two hours with a specialist", "We read your logs and documents",
            "21 of 23 areas scored"],
    },
    {
        key: "fpes", name: "FP + Support", price: "$999/mo", covers: 21,
        line: "We do the fixing, not just the finding.",
        gets: ["Everything in Full Protection", "Our engineers fix it for you", "Connect 25 systems",
            "One named person who knows you", "Four hours every month",
            "Three months support after each fix"],
    },
];

/* ── services ─────────────────────────────────────────────────────────────

   Eight, split across two columns in the menu. The left column is what we run
   continuously; the right is what we do when something needs proving or has
   already gone wrong. That split is why the two columns exist — it is not
   just a way to make the box shorter.

   The fifth item was "ISO Standards & Audits", which is too narrow. ISO/IEC
   27001 is one framework among many a client may be asked for, alongside
   SOC 2, PCI DSS and India's DPDP Act. Naming one loses enquiries about the
   rest, so the menu says "Standards & Compliance Audits" and the description
   names them. */
/* The slug is what turns each card into a link. /contact?topic=<slug> is
   read by ContactForm, which shows the service as a read-only line rather
   than dropping it into the tier dropdown — a service has no list price, and
   putting one in a menu of prices would misrepresent it.

   The platform card carries no slug: it points back at the free scan at the
   top of the page. Asking somebody to enquire about the thing they can
   simply use, for nothing, right now, would be absurd. */
export const SERVICES_LEFT = [
    { name: "Cyber Resilience Check", note: "Our platform. Start free, above.", platform: true },
    { name: "Technical Assurance", note: "Independent testing of what you built.", slug: "technical-assurance" },
    { name: "Third-Party Risk Management", note: "Know what your suppliers can reach.", slug: "third-party-risk-management" },
    { name: "SOC Setup & Monitoring", note: "Someone watching, around the clock.", slug: "soc-setup-monitoring" },
];
export const SERVICES_RIGHT = [
    { name: "Incident Response & Forensics", note: "When it has already happened, and the clock is running.", slug: "incident-response-forensics" },
    { name: "Penetration Testing", note: "We try to break in, so nobody else does first.", slug: "penetration-testing" },
    { name: "Continuous GRC", note: "Governance that stays current between audits.", slug: "continuous-grc" },
    { name: "Standards & Compliance Audits", note: "ISO/IEC 27001, SOC 2, PCI DSS, DPDP.", slug: "standards-compliance-audits" },
];
export const SERVICES = [...SERVICES_LEFT, ...SERVICES_RIGHT];

/* Compliance — the frameworks clients are actually asked to satisfy. Left is
   the certifiable standards, right is the privacy and reporting regimes.
   Same logic as the services split. */
export const COMPLY_LEFT = [
    { name: "ISO 27001:2022", note: "Information security management." },
    { name: "ISO 9001:2015", note: "Quality management." },
    { name: "ISO 42001:2023", note: "AI management systems." },
    { name: "ISO/IEC 20000-1:2018", note: "IT service management." },
];
export const COMPLY_RIGHT = [
    { name: "SOC 2 Type 1 & Type 2", note: "Trust services reporting, point-in-time and over a period." },
    { name: "GDPR", note: "European data protection." },
    { name: "HIPAA", note: "Healthcare information in the United States." },
    { name: "CCPA", note: "California consumer privacy." },
];
export const COMPLIANCE = [...COMPLY_LEFT, ...COMPLY_RIGHT];

/* Why anyone should believe us. Every claim here is checkable, which is the
   point — a security company that asks for trust without evidence is asking
   for the wrong thing.

   "58" and "23" are not decorative. They are asserted against the real
   catalogue by scripts/verify-site-content.js, so this block cannot quietly
   disagree with the engine. */
export const PROOF = [
    { big: "58", label: "checks, from outside", sub: "No agent. No access. No permission needed." },
    { big: "23", label: "risk areas mapped", sub: "We name all of them, including the ones we cannot reach." },
    { big: "~30s", label: "to your first answer", sub: "Then you decide whether to look deeper." },
    { big: "0", label: "passwords we ever see", sub: "Read-only access, approved on your provider's screen." },
];

export const FAQ = [
    {
        q: "Do you need access to my systems?",
        a: "Not for the free check. That runs entirely from outside, the same way anyone on the internet sees you. Access only comes in later, and only if you want the eighteen areas we cannot reach.",
    },
    {
        q: "Is this safe to run on my live website?",
        a: "Yes. We only look. Nothing we do sends traffic that could disturb your site, and we never attempt to break in or exploit anything we find.",
    },
    {
        q: "What do you do with my data?",
        a: "Findings are kept for twelve months so you can compare over time. Logs go after ninety days. We do not sell anything to anyone, and you can ask us to erase everything.",
    },
    {
        q: "Can I cancel a subscription?",
        a: "Any time, from your own portal. No call, no retention conversation.",
    },
    {
        q: "Who is behind this?",
        a: "Dolluz Corp, an IT services and consulting firm in Chennai. Real people, a real office, and a phone number that a person answers.",
    },
];

/* The prototype ships "+91 00000 00000" for both phone and WhatsApp —
   placeholders, the same class of thing as the unfilled markers in the legal
   documents. They are NOT copied here.

   The FAQ two blocks up promises "a phone number that a person answers". A
   fake number under that sentence is worse than no number at all, so the
   field is absent until somebody supplies a real one. */
export const OFFICE = {
    company: "Dolluz Corp",
    line1: "Chennai, Tamil Nadu",
    country: "India",
    /* THE ADDRESS WE PRINT IS NOT THE ADDRESS WE SEND FROM, and that is
       deliberate.

       Outbound mail leaves as connect@dolluzcorp.com (SENDGRID_FROM), which
       is the mailbox the sending infrastructure is authenticated against —
       its SPF and DKIM records are what make our mail arrive rather than
       land in a spam folder. Publishing that address on a public page puts
       it in front of every scraper that reads this site, and a sending
       address sitting in spam lists is a deliverability problem that takes
       months to undo.

       So every address rendered in the interface is admin@dolluzcorp.com:
       the monitored inbox a person writes to when they want help, and the
       same address enquiry alerts already land in (ENQUIRY_ALERT_TO).
       Change this one line and every "contact us" on the site changes with
       it. */
    email: "admin@dolluzcorp.com",
    hours: "Mon to Fri, 9:30am to 6:30pm IST",

    /* WhatsApp, digits only in international format. Empty would mean the
       floating button does not render at all — see Floating.js. The
       prototype ships "+91 00000 00000" here and a button with no handler;
       this is the real number.

       Written with the country code and no punctuation because that is what
       wa.me takes. Floating.js strips non-digits anyway, so "+91 77790
       79666" would also work — this form is just what reaches the URL. */
    whatsapp: "917779079666",

    /* The same number, punctuated for a person to read off the page. The
       digits-only form above is what wa.me takes; this is what the footer
       and the contact card print. Kept immediately beside it so the two
       cannot drift — a printed number that does not match the one the
       button dials is a support call nobody can explain. */
    whatsappDisplay: "+91 77790 79666",

    /* Pre-filled into the chat so the person does not have to open with
       "hi". A message already in the box is the difference between a button
       people tap and a button people think about tapping. */
    whatsappMessage: "Hello, I have a question about your service. Can you please help me?",
};

/* The chat URL, built once.

   The floating button, the footer and the contact card all offer WhatsApp,
   and until now only the floating button knew how to construct the link.
   Three copies of this expression is three places for the number to go stale
   and two of them nobody would think to check.

   wa.me wants digits only — no +, no spaces, no dashes — so the display form
   is stripped here rather than demanding a clean value in OFFICE. The
   pre-filled message is encoded, not interpolated: it contains a comma and a
   question mark, and a raw "?" would truncate the query string at exactly
   the wrong place.

   Null when there is no number, which is what makes the floating button and
   the footer line disappear together rather than one of them rendering a
   link to nowhere. */
export const WHATSAPP_HREF = (() => {
    const digits = String(OFFICE.whatsapp || "").replace(/\D/g, "");
    if (!digits) return null;
    const text = OFFICE.whatsappMessage
        ? `?text=${encodeURIComponent(OFFICE.whatsappMessage)}`
        : "";
    return `https://wa.me/${digits}${text}`;
})();

/* ── Smart Checks ─────────────────────────────────────────────────────────

   Seven single-question tools. The five free ones are BUILT — they are the
   five slugs in src/utils/routes.js and the five engines in tools_engine.js.

   The two paid ones are NOT built here. dShield-Backend-v6.3.zip carries
   working engines for both (socialImpersonation and executiveOsint in
   src/services/tools.js), so porting them is a contained piece of work
   rather than a research problem — but until that happens, built:false keeps
   them off the site. Advertising a tool with nothing behind it is the fifty
   connectors and one collector defect, in miniature. */
export const SMART = [
    { name: "Can someone fake your email?", price: "FREE", slug: "email-spoofing", built: true },
    { name: "Is your certificate healthy?", price: "FREE", slug: "ssl", built: true },
    { name: "Is your site missing protections?", price: "FREE", slug: "headers", built: true },
    { name: "Are there fake versions of your domain?", price: "FREE", slug: "lookalike", built: true },
    { name: "Has your password leaked?", price: "FREE", slug: "password", built: true },
    { name: "Is someone impersonating you?", price: "$19", slug: "impersonation", built: false },
    { name: "What can be found about your CEO?", price: "$49", slug: "executive", built: false },
];

/* The ones with something behind them. The site renders from this, so an
   unbuilt tool cannot reach a customer by being forgotten in a list. */
export const SMART_BUILT = SMART.filter((t) => t.built);

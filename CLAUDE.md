# dShield Site — project context

Read this before changing anything. It is the standing context for every
session; individual task files in `docs/claude-tasks/` sit on top of it.

---

## What this is

The public front door for dShield, Dolluz Corp's cybersecurity assessment
product. Anyone can enter a domain and get a free security grade, use five free
tools, and see what the paid tiers cover.

It is **one of four applications**. The other three are not in this repository:

| App | Subdomain | Who logs in |
|---|---|---|
| **This one** — public site | `dshield.dolluzcorp.com` | nobody |
| Customer portal | `app.dshield.dolluzcorp.com` | recurring subscribers |
| Employee portal | `employee.dshield.dolluzcorp.com` | Dolluz staff |
| Console | `admin.dshield.dolluzcorp.com` | admins |

They must stay separate sites. The permission model depends on it — a
compromised session on one must not be able to reach another.

---

## Stack and conventions

React 19 SPA + Express API + MySQL, matching the sibling dApps (dAdmin, dSlip,
dTime). Follow the existing house style rather than introducing a new one.

- **API port 4008.** Hardcoded in `server.js`, deliberately *not* from
  `process.env.PORT` — `react-scripts` reads `.env` first and would bind the
  dev server to it. dAdmin is 4002.
- **Database access** is `config/db.js` → `getDBConnection(dbName)`, a pool
  factory. Callback-style `db.query`, not promises. Do not add an ORM.
- **Backend routes** live in `src/backend_routes/*_server.js`, one file per
  area, mounted explicitly in `server.js`.
- **Frontend** is one component per file in `src/`, each with a matching
  `.css` beside it. Design tokens are CSS variables in `src/index.css`.
- **Response shape** is `{ success: boolean, message?: string, ... }`.
- Errors are logged with `console.error` and an `❌` or `⚠️` prefix.

**Do not add npm dependencies** without saying so explicitly and explaining
why. The dependency list is deliberately short.

---

## The rules that must not be relaxed

These are not style preferences. Each one exists because breaking it produced a
real failure in the main product.

### A check that could not run is INCONCLUSIVE, never a pass

"We looked and found nothing wrong" and "we could not look" are different
sentences. Inconclusive checks are excluded from **both sides** of the scoring
sum, never counted as passes.

Testing of the main engine once found an aborted scan reporting **grade A,
score 100, zero findings** — because with every check errored there was nothing
left to fail. A customer behind a firewall would have been told they were
secure by a product they came to for the opposite.

### No grade from a partial scan

Below the coverage floor (`MIN_COVERAGE_RATIO`, `MIN_COVERAGE_CHECKS` in
`src/utils/scan_engine.js`) no score is published at all. Do not add a
"best-effort" grade, an estimated score, or a partial result with a caveat.

### The paywall is server-side

Content the free tier does not include is **never sent to the browser** — not
hidden with CSS, not greyed out, not present in the JSON. It cannot leak from a
page if it was never in the response.

`issueSummary` in a scan result carries severity and domain only. Never add
finding titles, evidence, or remediation to it.

### The scan is passive, always

No port scanning. No login attempts. No input designed to find a weakness by
breaking something. Every check reads what the target already publishes to any
visitor. This is a promise printed on the site and it is worth more than any
check it excludes.

### The password tool never receives a password

SHA-1 is computed in the browser. Only the first five characters of the hash
are sent. If the endpoint is ever changed to accept a password or a full hash,
a sentence printed on the page becomes a lie.

### Domain input is validated before anything is fetched

`normaliseDomain` and `isPrivateAddress` in `scan_engine.js` refuse internal
names, IP addresses and reserved ranges — including `169.254.169.254`, the
cloud metadata endpoint that returns the server's own credentials. Without
these guards the scanner is an open proxy into our own network.

### Scoring stays identical to the main engine

Check IDs, severity weights (critical 10, high 6, medium 3, low 1), the grade
caps and the formula match dShield v6.3 exactly, so a free scan here and a paid
scan there produce comparable numbers. The formula is published on the Trust
page and a customer is invited to recompute any grade by hand. Changing it
here without changing that page makes us wrong in public.

---

## What is deliberately not here

Do not add these. Their absence is the plan, not an oversight.

| Missing | Why |
|---|---|
| **Checkout / payments** | Razorpay KYC and legal review outstanding. A checkout that takes a card and delivers nothing is how you lose a payment gateway in week one. |
| **Login / accounts** | Portal access is for recurring subscribers only, and lives in a different app. One-time buyers never log in. |
| **The 222-question assessment** | Full Protection and above. Different app. |
| **Connectors** | Advanced and above. Different app. |
| **Cookie consent banner** | The site sets no non-essential cookies. A banner asking permission for cookies we do not set is theatre. **This changes the moment analytics is added** — then a banner becomes required. |

---

## Known gaps, in priority order

1. **Legal pages** — Terms, Privacy Notice, Refund & Cancellation, Cookie
   Notice. Blocking: the site already stores IP and email, and Razorpay
   onboarding generally requires published policy pages.
2. **Selling sections** — "What we do", Services, Compliance, "Six of the
   eighteen". The consulting work is the actual business and the site
   currently has no path to it.
3. **SEO** — per-route meta tags and a sitemap. The five tools are meant to be
   five separate front doors; without unique titles they are one page to a
   search engine.
4. **Enquiries reach nobody.** They land in the `enquiries` table and SendGrid
   is not wired. Somebody has to watch that table until it is.

---

## Things worth knowing before deploying

- **The rate limiter is in-memory**, per IP and per target domain, and resets
  on restart. Fine for one process. Under PM2 cluster mode, four processes
  means four times the limit — move it to Redis then.
- **`trust proxy` is on in production.** Behind nginx `req.ip` is the proxy
  otherwise, and the scan limiter is per IP — every visitor would share one
  bucket.
- **Two checks need outbound access** some networks block: `crt.sh` and
  `api.pwnedpasswords.com`. Both degrade to inconclusive, never to a false
  pass.
- **`db/*.sql` is committed.** The schema carries no credentials, and schema
  changes are exactly the kind that benefit from review and history. Dumps
  and local database files stay ignored.

---

## How to work here

- Say what you are about to change before changing it.
- Run the verification steps in the task file and **report the real output**.
  Do not report success without running them.
- After any change, confirm a scan of `dolluzcorp.com` still returns the same
  grade and finding counts as before. If it does not, stop and say so.
- If an instruction conflicts with what is actually in the repo, stop and
  describe the conflict rather than working around it silently.
- Uncomfortable findings are wanted stated plainly, not softened.

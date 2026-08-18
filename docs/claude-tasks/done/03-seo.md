# Claude Code — dShield Site · Task 03
## SEO and discoverability

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 02 merged (`d6d3f23` or later)
**Do not touch:** `src/utils/scan_engine.js`, `src/utils/tools_engine.js`,
`src/utils/suppression.js`, `src/backend_routes/Scan_server.js`,
`src/backend_routes/Tools_server.js`, `src/backend_routes/Legal_server.js`

---

## Why this task exists

The five free tools are supposed to be **five separate front doors**. Somebody
searching "can people send fake email from my domain" should land on the Email
Spoofing Test, get their answer, and leave knowing our name. That is the entire
acquisition strategy: the tools bring strangers in, the free scan converts them,
the coverage gap sells the services.

None of it works at the moment, for three reasons.

**1. Every page has the same title and description.** `public/index.html` sets
one `<title>` and one meta description for the whole application, and React
never changes them. To a search engine the site is one page called *"dShield —
See what an attacker sees"*, no matter which of the fifteen routes you open.
The five tools do not exist as far as search is concerned.

**2. There is no sitemap.** Nothing tells a crawler the routes exist. A
single-page app has no links for a crawler to follow until JavaScript runs, so
pages nobody links to externally may never be found.

**3. Every URL returns HTTP 200, including ones that do not exist.** Task 02
found this: `/nonexistent-page` serves `index.html` with a 200, React renders
the NotFound component, and the crawler is told "this page exists and is
healthy". This is a **soft 404**. Every typo, every stale link anyone ever
posts, becomes an indexed page. It dilutes the ranking of the pages that
matter.

---

## Design decisions — follow these, do not substitute

### No SEO library

Do **not** add `react-helmet`, `react-helmet-async`, or any equivalent. The
dependency list is deliberately short and this needs about forty lines of
plain code.

Write a small `useDocumentMeta` hook that sets `document.title` and updates the
relevant `<meta>` tags on mount. React 19 also supports rendering `<title>` and
`<meta>` directly inside a component and hoists them to `<head>` — either
approach is fine, but pick one and use it everywhere rather than mixing them.

### Understand what this does and does not fix

Be honest about this in your report rather than overstating the result.

Client-side meta tags work for Google, which executes JavaScript. They do
**not** work for most social preview crawlers — WhatsApp, Slack, LinkedIn and
Twitter fetch the raw HTML and never run JavaScript. A link shared in WhatsApp
will show whatever is in `public/index.html`, not the per-page tags.

Two consequences:

- The **static fallback in `public/index.html` still matters**, because it is
  what every social preview will use. Make it a good generic description of the
  site rather than a homepage-specific one.
- Genuine per-page social previews need server-rendered tags. That is a larger
  change and **out of scope for this task**. Note it in your report as the
  next step if social sharing becomes important.

### The 404 fix is server-side and must not break the SPA

The React app must still handle its own routing. The server needs to know which
paths are real so it can return a 404 status for the rest — while still serving
`index.html` so React renders a proper NotFound page rather than a bare error.

Status 404 **with** the normal page body. Not a redirect, not a blank page.

Keep the list of known routes in one place. A route added to `App.js` and
forgotten here becomes a page that 404s while looking fine to a human, which is
worse than the current problem because nobody will notice.

---

## What to build

### 1 · `src/utils/meta.js` — new file

Export a `useDocumentMeta({ title, description, canonical, noindex })` hook.

- Sets `document.title`
- Creates or updates `<meta name="description">`
- Creates or updates `<link rel="canonical">`
- When `noindex` is true, sets `<meta name="robots" content="noindex">`;
  otherwise removes any such tag
- Restores nothing on unmount — the next page sets its own

Also export a `SITE_URL` constant read from `process.env.REACT_APP_SITE_URL`
with a fallback of `https://dshield.dolluzcorp.com`, and add
`REACT_APP_SITE_URL` to `.env` and `.env.example`. Canonical URLs must be
absolute, and hardcoding the domain in fifteen components is how it ends up
wrong on a staging deployment.

### 2 · Titles and descriptions per route

Call the hook in each page component. Use these exactly — they are written to
be read in a search result, where the first sixty characters of the title and
the first hundred and fifty of the description are what a person actually sees.

| Route | Title | Description |
|---|---|---|
| `/` | Free Security Scan — See What an Attacker Sees \| dShield | Check your company's security from the outside in under a minute. Email spoofing, certificates, exposed files and lookalike domains. No sign-up, no card. |
| `/tools` | Five Free Security Tools \| dShield | Check email spoofing, SSL certificates, security headers, lookalike domains and password exposure. Free, unlimited, no login. |
| `/tools/email-spoofing` | Email Spoofing Test — Can Anyone Fake Your Email? \| dShield | Free SPF, DKIM, DMARC and MTA-STS check. Find out in seconds whether someone can send email that appears to come from your domain. |
| `/tools/ssl` | Free SSL / TLS Certificate Test \| dShield | Check your certificate's expiry, issuer, chain and protocol the way a browser does. Free, instant, no sign-up. |
| `/tools/headers` | Free Security Headers Test \| dShield | Check HSTS, Content Security Policy, frame protection and cookie flags on your website. See what your pages tell browsers about protecting visitors. |
| `/tools/lookalike` | Lookalike Domain Check — Find Fake Versions of Your Domain \| dShield | Find misspellings of your domain that are registered, and which of them have mail servers configured and can send invoices today. |
| `/tools/password` | Free Password Exposure Check — Has Yours Been Breached? \| dShield | Check whether a password appears in known data breaches. Your password never leaves your browser — only five characters of its hash are sent. |
| `/pricing` | Pricing — Security Assessment Reports \| dShield | From a free grade to full remediation. See what each level covers, what a report contains, and where the free scan stops. |
| `/services` | Cybersecurity Services — Audits, Testing, Compliance \| dShield | Penetration testing, incident response, SOC setup, third-party risk and ISO 27001, SOC 2 and DPDP compliance, delivered by Dolluz Corp engineers. |
| `/coverage` | What a Security Scan Cannot See \| dShield | A scan reaches five of twenty-three risk domains. See what the other eighteen cover, and which six open when you connect a system. |
| `/how-it-works` | How the dShield Security Scan Works \| dShield | We read only what your servers already publish. No port scanning, no login attempts, no access to your systems. Here is exactly what we check. |
| `/trust` | Our Scoring Formula, Published \| dShield | The formula behind every grade, what we store, and why a check that could not run never counts as a pass. |
| `/legal` | Legal Documents \| dShield | Terms of Service, Privacy Notice, Refund Policy and Cookie Notice. |
| `/contact` | Contact Dolluz Corp — Security Services \| dShield | Talk to our engineers about audits, penetration testing, incident response or compliance. |

**Dynamic routes:**

- `/legal/:key` — title from the fetched document, e.g. *"Privacy Notice |
  dShield"*
- `/tools/:slug` — from the table above, matched on slug
- `/result/:id` — see below

**`noindex` on three routes.** Set it for `/result/:id`, `/preferences/:token`
and `/data-request`.

A scan result is about somebody else's company and often contains a poor grade.
Letting Google index *"acme.com — Grade D"* would publish a security assessment
of a third party under our name, which is a reputational and possibly legal
problem we have no reason to take on. The preference and data-request pages are
personal and have no business in search results.

For `/result/:id` use a generic title — *"Scan Result | dShield"* — and do not
put the scanned domain in the title or description.

### 3 · Improve `public/index.html`

This is the static fallback every social crawler will use. Keep the existing
favicon, font and manifest lines untouched.

- Change the title to `dShield — Free Security Scan by Dolluz Corp`
- Keep the description generic and site-wide, not homepage-specific
- Add Open Graph and Twitter card tags: `og:title`, `og:description`,
  `og:type` (`website`), `og:url`, `og:site_name` (`dShield`),
  `twitter:card` (`summary_large_image`)
- Add `og:image` pointing at `%PUBLIC_URL%/og-image.png`, and **create that
  image** — 1200×630, near-black `#08090C` background, the dShield wordmark in
  gold `#F5A524`, and the line *"See what an attacker sees"*. An SVG converted
  to PNG at build time is fine; if you cannot generate a PNG, write the SVG,
  reference it, and say so in your report rather than leaving a broken path.

A broken `og:image` is worse than none — the preview renders as an empty grey
box.

### 4 · `public/robots.txt`

Replace with:

```
User-agent: *
Allow: /
Disallow: /result/
Disallow: /preferences/
Disallow: /data-request

Sitemap: https://dshield.dolluzcorp.com/sitemap.xml
```

The `Disallow` lines mirror the `noindex` decisions above. Both are needed:
`robots.txt` stops the crawl, `noindex` stops indexing if something is reached
another way.

### 5 · `src/backend_routes/Sitemap_server.js` — new file

Generate `sitemap.xml` from a route list rather than maintaining a static file
that will drift.

- `GET /sitemap.xml` returns XML with `Content-Type: application/xml`
- Include every public route: `/`, `/tools`, the five tool pages, `/pricing`,
  `/services`, `/coverage`, `/how-it-works`, `/trust`, `/contact`, `/legal`,
  and the four `/legal/:key` pages
- Exclude `/result/*`, `/preferences/*`, `/data-request`
- `<priority>`: `1.0` for `/`, `0.9` for the five tool pages and `/pricing`,
  `0.8` for `/services` and `/coverage`, `0.5` for the rest. The tools are
  priced high deliberately — they are the traffic engine.
- `<changefreq>` `monthly` for everything; nothing here changes daily
- Absolute URLs built from `PUBLIC_URL`

Mount it in `server.js` **before** the static and SPA-fallback block, so the
route is not swallowed by `express.static`.

### 6 · The soft-404 fix in `server.js`

In the production block, replace the catch-all so it returns a real status.

- Build a `KNOWN_ROUTES` array: exact paths, plus prefix matches for
  `/tools/`, `/legal/`, `/result/`, `/preferences/`
- If the request path matches, serve `index.html` with status 200
- If it does not, serve **the same `index.html` with status 404**

React still renders NotFound. The difference is invisible to a person and
decisive for a crawler.

Put `KNOWN_ROUTES` in a small shared module — `src/utils/routes.js` — and add
a comment in `src/App.js` above the `<Routes>` block saying that a new route
must be added there too. Two lists that must agree will eventually disagree;
make the link explicit so the next person sees it.

### 7 · Structured data on the tool pages

Add a JSON-LD `<script type="application/ld+json">` block to each of the five
tool pages, `@type: "WebApplication"`, with `name`, `description`,
`applicationCategory: "SecurityApplication"`, and an `offers` block with
`price: "0"` and `priceCurrency: "INR"`.

This is what produces a richer search result for a free tool. Keep it factual —
do not add `aggregateRating` or review counts. Inventing ratings is both
dishonest and a manual-action risk.

---

## Verification before you finish

Run these and report the real output.

```bash
# 1 — build
npx react-scripts build

# 2 — sitemap
NODE_ENV=production node server.js &
curl -s localhost:4008/sitemap.xml | head -20
curl -s -o /dev/null -w "%{content_type}\n" localhost:4008/sitemap.xml

# 3 — soft 404 fixed
curl -s -o /dev/null -w "known route:   %{http_code}\n" localhost:4008/tools/ssl
curl -s -o /dev/null -w "unknown route: %{http_code}\n" localhost:4008/nonsense-page
curl -s -o /dev/null -w "api health:    %{http_code}\n" localhost:4008/api/health

# 4 — og:image resolves
curl -s -o /dev/null -w "og image: %{http_code}\n" localhost:4008/og-image.png

# 5 — THE SCAN IS UNCHANGED
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"dolluzcorp.com"}'
```

Step 3 must show `200`, `404`, `200` in that order. If the unknown route still
returns 200, the fix has not worked.

Step 5 must be grade **A**, score **90**, counts `critical 0 / high 1 /
medium 0 / low 0`. If anything differs, stop and say which check moved and why
you believe it is legitimate. Do not assume.

**Then verify the titles actually change**, because this is the one part that
can silently do nothing:

```bash
npx serve -s build -l 5000 &
```

Open `/`, `/tools/ssl` and `/pricing` in a browser and confirm the tab title
differs on each. If you cannot open a browser, say so plainly rather than
reporting the step as passed.

Also confirm:

- `git diff package.json` is empty — no new dependency
- `grep -rn "helmet" src/` finds nothing
- No file under `src/utils/scan_engine.js` or the do-not-touch list is in the
  diff

---

## Report back

1. Files created and edited
2. Real output of every verification step
3. Whether you were able to check the titles in a browser, honestly
4. Whether `og-image.png` was generated as a PNG or left as SVG
5. Anything wrong, impossible, or conflicting in these instructions. Tasks 01
   and 02 each found a genuine error in their own instructions and were right
   to say so.

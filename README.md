# dShield — Global Site

**Dolluz Corp · Chennai**

The public front door. Anyone can enter a domain and get a free security grade,
use five free tools, and see what the paid tiers cover.

Built to the same shape as dAdmin: `config/db.js` for pooled connections,
`server.js` mounting `src/backend_routes/*_server.js`, React pages in `src/`
with a matching `.css` beside each.

---

## What runs today

| | |
|---|---|
| **Free scan** | 8 checks across all 5 domains the site promises |
| **Free tools** | Email spoofing · SSL/TLS · Security headers · Lookalike domains · Password exposure |
| **Pricing** | All five tiers, real prices, "notify me" instead of checkout |
| **Enquiries** | Stored in `enquiries` for follow-up |

**Payments are deliberately not wired.** Razorpay onboarding and the seven
legal documents are outstanding. A checkout that takes a card and delivers
nothing is the fastest way to lose a payment gateway, so the pricing page
collects interest instead. Everything above is live and useful without it.

---

## Getting it running

**You need:** Node 18+, MySQL 8, and nothing else. No API keys, no third-party
accounts. The free scan and all five tools use only DNS, TLS and HTTP.

```bash
# 1 — database
mysql -u root -p < db/schema.sql
mysql -u root -p < db/schema-legal.sql   # must run after schema.sql
mysql -u root -p < db/schema-mail.sql    # must run after schema-legal.sql
mysql -u root -p < db/schema-orders.sql  # must run after schema-mail.sql
mysql -u root -p < db/schema-pdf.sql     # must run after schema-orders.sql

# 2 — configure
#     open .env and set DB_PASSWORD

# 3 — install
npm install

# 4 — run both halves together
npm run dev
```

- React dev server → **http://localhost:3000**
- API → **http://localhost:4008**

`npm run dev` starts both. To run them separately use `npm run server` and
`npm start` in two terminals.

### Checking it works

```bash
curl http://localhost:4008/api/health
curl -X POST http://localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"github.com"}'
```

A scan takes 20–60 seconds depending on how quickly the other end answers.

---

## Layout

```
dshield-global/
├── .env                     DB credentials and API base
├── server.js                Express, port 4008, CORS allowlist, route mounts
├── config/
│   └── db.js                Pooled MySQL connections, one pool per database
├── db/
│   └── schema.sql           scans · leads · enquiries · tool_usage
├── public/                  index.html and static assets
└── src/
    ├── backend_routes/
    │   ├── Scan_server.js       POST /api/scan · GET /api/scan/:id
    │   ├── Tools_server.js      the five free tools
    │   └── Lead_server.js       enquiries, notify-me, pricing content
    ├── utils/
    │   ├── api.js               API_BASE + apiFetch/apiGet/apiPost
    │   ├── scan_engine.js       the 8 checks, scoring, SSRF guards
    │   └── tools_engine.js      the five tools
    ├── App.js                   routes
    ├── Navbar.js / .css
    ├── Home.js / .css           hero and scan form
    ├── Result.js / .css         grade, counts, 23-domain coverage map
    ├── Tools.js / .css          tool index and individual tool pages
    ├── Pricing.js / .css        five tiers, notify-me, FAQ
    └── Pages.js / .css          contact, how it works, trust, footer, 404
```

---

## The eight checks

All read information your servers already publish to anyone who asks. Nothing
is probed, nothing is attacked.

| Check | Domain | Severity |
|---|---|---|
| `EMAIL-SPF-38` No SPF record | Email & Domain Security | high |
| `EMAIL-DMARC-44` No DMARC record | Email & Domain Security | critical |
| `EMAIL-DMARC-45` DMARC monitor-only | Email & Domain Security | critical |
| `TLS-CERT-EXPIRED-29` Certificate expired | Encryption & Certificates | critical |
| `TLS-CERT-EXPIRING-28` Certificate expiring | Encryption & Certificates | high |
| `SURF-GIT-04` `.git` directory exposed | External Attack Surface | critical |
| `BREACH-METADATA-55` Internal hostnames in CT logs | Breach & Exposure Intelligence | medium |
| `BRAND-TYPO-59` Lookalike domain sending mail | Brand & Digital Risk | high |

IDs, severities, weights and the scoring formula match the main dShield engine,
so a free scan here and a paid scan there produce comparable numbers.

### The rule that must not be relaxed

> **A check we could not run is INCONCLUSIVE, never a pass.**

"We looked and found nothing wrong" and "we could not look" are different
sentences. Inconclusive checks are excluded from **both sides** of the scoring
sum. Below the coverage floor no grade is published at all — earlier testing of
the main engine found an aborted scan reporting grade A, score 100, zero
findings, because with every check errored there was nothing left to fail. A
customer behind a firewall would have been told they were secure.

### Grade caps

One critical finding caps the grade at D. Three or more cap it at E. A company
with a critical hole and otherwise good hygiene is not a B.

---

## Things worth knowing before you deploy

**The rate limiter is in-memory.** Per IP and per target domain, and it resets
on restart. Fine for a single process. If this ever runs under PM2 in cluster
mode, four processes means four times the limit — move it to Redis then.

**Enquiries do not email anybody yet.** SendGrid is not wired on this app. Rows
land in `enquiries` and somebody has to watch that table. An enquiry that
reaches nobody is worse than one never made, because the person is waiting.

**Two checks need outbound access** that some networks block: `crt.sh` for
certificate transparency, and `api.pwnedpasswords.com` for the password tool.
Both degrade correctly — inconclusive, never a false pass — but test them on
the server before launch rather than assuming.

**`trust proxy` is on in production.** Behind nginx, `req.ip` is the proxy
unless Express is told otherwise, and the scan limiter is per IP. Without it
every visitor shares one bucket and the first dozen scans of the hour lock out
everybody else.

### PDF reports — Chrome is a dependency

Paid reports are delivered as a web page **and** a PDF. The page always works;
the PDF is generated after delivery and is allowed to fail without affecting
the order.

```bash
npx puppeteer browsers install chrome
```

**The server needs 4GB of RAM.** A render peaks around 700MB across Chrome's
helper processes, and below 4GB the OS kills Chrome mid-render — which shows
up as intermittent, hard-to-attribute failures rather than a clean error.
Check the droplet before this ships.

Renders are serialised one at a time for the same reason. Chrome is launched
with `--no-sandbox`, which is acceptable only because it renders our own
template: every value interpolated into it is escaped, and no customer-supplied
HTML is ever passed in.

Generated files live in `REPORT_DIR` (default `./storage/reports`), which is
gitignored — they contain customer findings.

**If Chrome misbehaves in production, set `PDF_ENABLED=false`.** Everything
else keeps working: orders complete, reports are delivered, and no PDF button
is offered.

### Production

```bash
npm run build                 # → build/
NODE_ENV=production node server.js
```

In production `server.js` serves `build/` and falls back to `index.html` for
client-side routes, so one process serves the whole site. Set `REACT_APP_API`
before building, and add the real origin to `allowedOrigins` in `server.js`.

---

## What the free scan does not do

Deliberately, and it is worth saying out loud to anyone who asks:

- **No port scanning.** Active reconnaissance sets off intrusion detection and
  is not what somebody agreed to by typing a domain.
- **No login attempts, no injected input, no traffic designed to find a
  weakness by breaking something.**
- **No grade from a partial scan.**
- **No withheld detail sent to the browser.** The paywall is enforced on the
  server. Findings the free tier does not include are never in the response, so
  they cannot be read out of the page source.

---

## Next, in order

1. Test the scan against 20 real Indian company domains — sites behind
   Cloudflare, on shared hosting, with odd certificates. The engine has met
   test domains, not messy real ones.
2. Wire SendGrid so enquiries reach a person rather than a table.
3. Razorpay KYC and the legal documents. When both land, the checkout flow from
   the main dShield backend drops in behind the existing pricing page.

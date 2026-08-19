# Claude Code — dShield Site · Task 07
## PDF reports

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 06 merged (`adc0bb1`)
**Do not touch:** `src/utils/checks/*`, `src/utils/scan_engine.js`,
`src/utils/tools_engine.js`, `src/utils/suppression.js`,
`src/data/remediation-library.json`, `src/backend_routes/Tools_server.js`

---

## Why this task exists

Task 06 delivers a report as a web page behind a signed link. That works, and a
customer can print it. But a paid security assessment is a document people
file, forward to their board, and hand to an auditor — and a printed web page
is not that.

The pricing page promises *"PDF and machine-readable export"* at Basic. That is
currently untrue.

This task adds PDF as a **second format alongside the page that already
works**. The page stays. If PDF generation fails, the customer still has their
report — that ordering is deliberate and must not be reversed.

---

## Design decisions — follow these, do not substitute

### The PDF is generated once and frozen

A report is evidence. A customer and their auditor must see the **identical
document** on every download, months apart.

So: generate once, at fulfilment, store the file on disk, and serve the stored
bytes thereafter. Never regenerate on download. Record a **SHA-256 of the file**
on the order and print the first 16 characters in the document footer, so any
two copies can be compared by eye.

If the same order is fulfilled twice — it should not be, but the guard is
cheap — reuse the existing file rather than producing a second one.

### The report may still be wrong. Say so in the document.

Every PDF carries, on the first page, the same honesty the site carries:

- The scan covers **five of twenty-three** risk domains
- **Which checks could not complete**, and why
- That the assessment is a point-in-time view of what was publicly visible, not
  a guarantee of security
- The date and time, with timezone

A PDF outlives the page it came from. Somebody will read this in nine months
and treat it as current. Say plainly when it was made and what it did not see.

### Machine-readable means JSON, and it is the same data

`GET /api/reports/:token.json` returns the report object the page already uses.
Same paywall, same tier gating — it must not be a way to get advanced content
from a basic order. Test that explicitly.

### Puppeteer, and what it costs

Rendering HTML to PDF with headless Chrome gives typography and layout that
match the web report for free. The costs are real and must be stated in the
README rather than discovered on deployment day:

- **Chrome must be installed.** `npx puppeteer browsers install chrome`
- **4GB RAM minimum on the server.** Below that the OS kills Chrome mid-render
  and you get intermittent failures that are very hard to diagnose. The
  droplet must be checked before this ships.
- **Chrome must be launched with `--no-sandbox`** in most container and droplet
  environments, and that is a real security trade-off: it renders our own
  trusted template, never customer-supplied HTML. Add a comment saying so, and
  **never pass customer input into the template unescaped.**

The report contains customer domains, evidence strings and hostnames — all
attacker-influenced. Escape every interpolated value. A `<script>` tag in a
domain name that reaches the template is a serious problem.

### Generation must never block delivery

Generate the PDF **after** the report is stored and the email is queued.

If Chrome fails, the order stays `delivered` — the customer has their page and
their email. Record the PDF failure separately, alert internally, and let the
download endpoint fall back to the page with an honest note. A missing PDF is
an inconvenience; a missing report is a chargeback.

### One concurrent render

Chrome is memory-hungry. Serialise PDF generation through a simple in-process
queue of depth one. Two simultaneous renders on a 4GB box is how you get the
OOM killer.

---

## What to build

### 1 · `db/schema-pdf.sql` — new file

Add to `orders`:

| Column | Type | Notes |
|---|---|---|
| `pdf_path` | VARCHAR(300) NULL | relative to `REPORT_DIR` |
| `pdf_sha256` | CHAR(64) NULL | printed in the footer |
| `pdf_bytes` | INT UNSIGNED NULL | |
| `pdf_status` | ENUM('none','pending','ready','failed') NOT NULL DEFAULT 'none' | |
| `pdf_error` | VARCHAR(500) NULL | |

Use the `information_schema` guard pattern from `schema-legal.sql` — MySQL 8
has no `ADD COLUMN IF NOT EXISTS` and the file must be safe to re-run.

**`.env` additions:**

```
REPORT_DIR=./storage/reports
PDF_ENABLED=true
PUPPETEER_EXECUTABLE_PATH=
```

`PDF_ENABLED=false` must make everything work exactly as it does today, with
no PDF offered and no error. That is the switch to reach for if Chrome misbehaves
in production at 2am.

Add `storage/` to `.gitignore`.

### 2 · `src/utils/pdf.js` — new file

- `isPdfAvailable()` — `PDF_ENABLED` true, Chrome resolvable
- `renderReportPdf(report, orderRef)` — returns `{ path, sha256, bytes }`
- Depth-one queue so only one render runs at a time
- 60-second timeout per render; kill the browser on timeout, do not leak it
- Launch args: `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
- Reuse one browser instance across renders, relaunching if it has died —
  launching Chrome per report is slow and leaks processes under load

Write the file as `<orderRef>.pdf` under `REPORT_DIR`. Create the directory if
absent.

### 3 · `src/utils/pdf-template.js` — new file

Returns a complete standalone HTML string for a report. **No external
requests** — no Google Fonts, no CDN. A render that reaches the network is a
render that fails on a locked-down server. Use system font stacks.

Escape every interpolated value. Write one `esc()` helper and use it without
exception.

Structure:

**Cover** — dShield wordmark, "Security Assessment", the domain, the grade in
large type, the score, the date and time with timezone, and the order
reference.

**Page 1 — What this report does and does not cover.** The five-of-twenty-three
statement, the count of checks that ran, and the inconclusive list with
reasons. This goes **first**, not in an appendix. A reader who stops after one
page should still know the limits of what they are holding.

**Summary** — counts by severity, per-domain scores, the 23-domain coverage map
as a simple table with measured and not-measured marked.

**Findings** — one block per finding: title, severity, the affected asset,
evidence, `finding` text, and for advanced, `impact`, numbered remediation
steps, the verification step, effort and skill. Keep each finding on one page
where it fits: `page-break-inside: avoid`.

**Roadmap** — advanced only. The bands with their totals and effort notes.

**Footer on every page** — domain, order reference, page number, and the first
16 characters of the SHA-256. Chrome's `footerTemplate` handles this; note that
`displayHeaderFooter` requires explicit `margin` values or the footer is
invisible, which is a classic hour-long debugging session.

Tier gating comes from the report object, which `buildReport` has already
filtered. **Do not re-derive it here.** Two places deciding the paywall is how
paywalls leak.

### 4 · Wire into fulfilment — `Payment_server.js`

After the report is stored and the email is queued:

1. `pdf_status = 'pending'`
2. Attempt the render
3. Success → `ready` with path, hash and size
4. Failure → `failed` with the error, plus an internal alert. **The order
   remains `delivered`.**

The customer's email links to the report page as it does now. Do not hold the
email waiting for a PDF.

### 5 · Download endpoints

| Route | Behaviour |
|---|---|
| `GET /api/reports/:token.pdf` | Streams the stored file with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="dShield-<domain>-<date>.pdf"`. Same token and expiry rules as the page. |
| `GET /api/reports/:token.json` | The report object, `Content-Disposition: attachment`. Same tier gating. |

If `pdf_status` is not `ready`, return **503 with a plain message** — "the PDF
is still being prepared, your report is available on the page" — and a link.
Not a 404. The customer has paid; a missing file is our problem to explain, not
theirs to interpret.

Add a **Download PDF** button to `src/Report.js`, shown only when the PDF is
ready, and a smaller **Download JSON** link beside it.

Add `pdfReady` to the `GET /api/payments/order/:ref` response so
`OrderStatus.js` can show the PDF appearing a few seconds after the report.

### 6 · README

A short section: Chrome install command, the 4GB requirement stated plainly,
`PDF_ENABLED=false` as the disable switch, and where files are stored. Somebody
deploying this in six months needs to know Chrome is a dependency before the
first order fails.

---

## Verification before you finish

```bash
# 1 — Chrome present
npx puppeteer browsers install chrome
node -e "console.log(require('puppeteer').executablePath())"

# 2 — schema twice
mysql -u root -p dshield < db/schema-pdf.sql
mysql -u root -p dshield < db/schema-pdf.sql

# 3 — build and boot
npx react-scripts build
node server.js &
curl -s localhost:4008/api/health

# 4 — FREE SCAN UNCHANGED
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"github.com"}'
```

**Then generate a real PDF and open it.** Not a byte count — open it and read
it:

```bash
node -e "
const { runScan } = require('./src/utils/scan_engine');
const { buildReport } = require('./src/utils/report_builder');
const { renderReportPdf } = require('./src/utils/pdf');
(async () => {
  const scan = await runScan('github.com', { tier: 'advanced' });
  const r = buildReport(scan, 'advanced');
  const out = await renderReportPdf(r, 'test-advanced');
  console.log(out);
})();
"
```

Report honestly whether you were able to view the rendered pages. If you cannot
open a PDF viewer, rasterise page 1 to an image and look at that. Do not report
this step as passed without having seen it.

**Confirm, by looking:**
- The coverage limitation appears on page 1, not buried later
- Inconclusive checks are listed with reasons
- No finding is split awkwardly across a page break
- The footer shows on every page including the last
- The hash in the footer matches the returned `sha256`

**Then the tests that must not be assumed:**

| Test | Expected |
|---|---|
| Basic-tier PDF | Findings present, **no remediation, no roadmap** |
| `:token.json` on a basic order | No `remediation` key anywhere in the output |
| Generate twice for one order | Same file reused, `pdf_sha256` unchanged |
| `PDF_ENABLED=false` | Everything works, no PDF button, no error |
| Chrome unavailable — rename the binary | Order still `delivered`, `pdf_status='failed'`, alert queued, page still works |
| Domain containing `<script>alert(1)</script>` passed to the template | Escaped in the output, not executed |
| `.pdf` request while `pdf_status='pending'` | 503 with a readable message |

Report every row with its real result. The escaping row matters most — the
report renders attacker-influenced strings.

Also confirm:
- `git diff package.json` shows `puppeteer` and nothing else
- `storage/` is gitignored and no PDF is committed
- Both verify scripts still pass

---

## Report back

1. Files created and edited
2. Every verification row with its real result
3. Whether you actually viewed the PDF, and what it looked like — including
   anything that reads badly or lays out poorly
4. The measured render time and peak memory, if you can get it. If a render
   takes more than 15 seconds or Chrome uses more than 1GB, say so — that
   changes what the droplet needs.
5. Anything wrong or conflicting in these instructions. Tasks 01, 02, 05a and
   05c each found genuine errors in theirs.

# Claude Code — dShield Site · Task 06
## Checkout, payment, and delivery — the whole chain

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 05c merged (`f2c2378`)
**Do not touch:** `src/utils/tools_engine.js`, `src/utils/suppression.js`,
`src/workers/mail-worker.js`, `src/backend_routes/Tools_server.js`,
`src/utils/checks/*`, `src/data/remediation-library.json`

---

## Why this task exists, and the one rule that governs it

The site can now produce a real paid report. It cannot take money for one.

**This task builds the complete chain in a single piece:**

```
checkout → Razorpay → webhook → paid scan → report → email → download
```

It is deliberately not split, and that is the most important instruction in
this file.

The dShield v6.3 product shipped with this exact chain broken. The payment
webhook marked an order paid, wrote an audit row, and ended at
`// TODO: queue report generation + receipt email`. `enqueueScan()` existed
with zero callers. The report queue had a producer and no consumer. 823 tests
passed. A customer could pay $499 and receive **nothing at all**, and nobody
found it for months, because every unit worked perfectly in isolation and
nothing tested the sequence.

**There must be no point in this task where money can be taken and nothing
delivered.** If you cannot finish the chain, do not ship the checkout. Ship
nothing and say why.

---

## Design decisions — follow these, do not substitute

### HTML report now, PDF later

Deliver the report as a **web page behind a signed link**, plus a plain-text
summary in the email. No Puppeteer, no Chrome, no PDF in this task.

PDF needs a headless Chrome, a 4GB RAM floor and a font pipeline. Adding that
here would be the largest part of the work and would push delivery past the
point where the chain can be tested end to end today. Task 07 adds PDF as an
extra format alongside the page that already works.

This ordering is the whole point: **the customer always receives something.**

### Verify the payment server-side. Never trust the browser.

Razorpay's checkout returns a `razorpay_payment_id`, `razorpay_order_id` and
`razorpay_signature` to the browser. **Do not fulfil an order on the strength
of that callback.** Anyone can post whatever they like to your endpoint.

Two independent paths, and fulfilment happens on whichever arrives first:

1. **Webhook** — `POST /api/payments/webhook`, signature verified with
   `RAZORPAY_WEBHOOK_SECRET` against the **raw request body**. This is the
   authority.
2. **Browser callback** — `POST /api/payments/verify`, HMAC-SHA256 of
   `order_id|payment_id` with the key secret. Used only to show the customer a
   result quickly.

Both call the same `fulfilOrder(orderId)`, which must be **idempotent**. A
webhook that arrives twice, or a webhook racing the browser callback, must
produce one scan, one report and one email — never two.

Make it idempotent with a database guarantee, not a flag in memory: a unique
constraint on `orders.payment_id`, and a status transition that only proceeds
`WHERE status = 'pending'` and checks the affected row count.

### Raw body for the webhook signature

`server.js` mounts `express.json()` globally. Signature verification needs the
**exact bytes** Razorpay sent — a parsed and re-stringified body will not
match, and the failure looks like a wrong secret.

Mount `express.raw({ type: 'application/json' })` on the webhook path only,
before the global JSON parser. Add a comment saying why, because this looks
like a mistake to anyone who does not know.

### The order records what was bought, before payment

`orders` carries the **domain** at creation. In v6.3 the checkout accepted a
domain, validated it, and discarded it — so even a correct webhook had nothing
to scan.

Reject an assessment tier with no domain at checkout, **before money moves**,
rather than discovering it after.

### Price comes from the server, always

The browser sends a tier key. It never sends an amount. Read the price from
`PLANS`, and store `amount_paise` on the order at creation.

At fulfilment, compare the amount Razorpay reports against the stored amount.
If they differ, do not fulfil — record it and alert. That is either a bug or
someone tampering, and both need a human.

### One price list, not two

`PLANS` currently lives inside `Lead_server.js`. Move it to
`src/data/plans.js` and have both routes import it. Checkout and the pricing
page disagreeing about what something costs is a problem you find out about
from a customer.

Add `amountPaise` per plan. Razorpay works in the smallest currency unit —
₹4,312 is `431200`. Getting this wrong by a factor of a hundred is the classic
first-integration bug, in both directions.

### Failure states are visible, not silent

Every order carries a `fulfilment_status`. When a paid order cannot be
fulfilled — scan failed, report failed, mail failed — it lands as `failed`
with the reason, and an internal alert goes to `ENQUIRY_ALERT_TO`.

A paid order with no report must be something a person can find in one query,
not something a customer has to tell you about.

---

## What to build

### 1 · `db/schema-orders.sql` — new file

Applied after the existing three. Add it to the README setup steps.

**Table `orders`**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT PK | |
| `order_ref` | CHAR(36) NOT NULL UNIQUE | our public reference, a UUID |
| `email` | VARCHAR(190) NOT NULL | |
| `name` | VARCHAR(120) NULL | |
| `company` | VARCHAR(160) NULL | |
| `domain` | VARCHAR(253) NULL | NULL only for non-assessment products |
| `tier` | VARCHAR(30) NOT NULL | `basic`, `advanced`, `full_protection` |
| `amount_paise` | INT UNSIGNED NOT NULL | what we asked for |
| `currency` | CHAR(3) NOT NULL DEFAULT 'INR' | |
| `status` | ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending' | |
| `fulfilment_status` | ENUM('none','running','delivered','failed') NOT NULL DEFAULT 'none' | |
| `fulfilment_error` | VARCHAR(500) NULL | |
| `razorpay_order_id` | VARCHAR(60) NULL | |
| `payment_id` | VARCHAR(60) NULL | **UNIQUE** — the idempotency guarantee |
| `amount_paid_paise` | INT UNSIGNED NULL | what actually arrived |
| `terms_version` | SMALLINT UNSIGNED NULL | which Terms they accepted |
| `scan_id` | CHAR(36) NULL | the scan this order paid for |
| `report_token` | CHAR(64) NULL | the signed download link |
| `report_expires_at` | TIMESTAMP NULL | |
| `created_at` / `paid_at` / `delivered_at` | TIMESTAMP | |

Indexes on `status`, `fulfilment_status`, `email`, `razorpay_order_id`.

`payment_id UNIQUE` is what makes duplicate fulfilment impossible. A second
webhook for the same payment fails the insert and is caught, rather than
producing a second report.

**Table `payment_events`** — every webhook received, raw. `id`, `event_type`,
`razorpay_order_id`, `payment_id`, `signature_valid` BOOLEAN, `raw_body` JSON,
`received_at`. Never deleted.

When a customer says they paid and got nothing, this table is the only place
that can settle it.

**`.env` additions:**

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
REPORT_LINK_TTL_DAYS=30
```

### 2 · `src/data/plans.js` — move and extend

Move `PLANS` out of `Lead_server.js`. Add `amountPaise` and `available` per
plan. `Lead_server.js` imports it for `/api/leads/pricing`.

Set `available: true` for `basic`, `advanced` and `full_protection` **only
when `RAZORPAY_KEY_ID` is configured**. With no key the pricing page keeps
showing "Notify me" rather than a checkout button that cannot work.

### 3 · `src/backend_routes/Payment_server.js` — new file

| Route | Behaviour |
|---|---|
| `POST /api/payments/checkout` | Body: `tier`, `domain`, `email`, optional `name`/`company`, `termsAccepted`. Validate the domain with the existing `normaliseDomain`. Reject if `termsAccepted` is not true. Create the local order, create a Razorpay order, return `order_ref`, `razorpay_order_id`, `amount`, `key_id`. **Never return the key secret.** |
| `POST /api/payments/verify` | Browser callback. Verify the HMAC. On success call `fulfilOrder`. Return the order status. |
| `POST /api/payments/webhook` | Raw body. Verify the signature. Log to `payment_events` **before** anything else, valid or not. On `payment.captured` call `fulfilOrder`. **Always return 200** once logged — a non-200 makes Razorpay retry, and retrying a payment that succeeded is worse than a missed event we can replay from the table. |
| `GET /api/payments/order/:ref` | Status for the success page to poll. Returns status, fulfilment status and, when ready, the report URL. No payment details. |

**`fulfilOrder(orderRef)` — the chain, in one function:**

1. `UPDATE orders SET fulfilment_status='running' WHERE order_ref=? AND fulfilment_status='none'`. **If zero rows affected, return** — another path already has it.
2. Verify `amount_paid_paise === amount_paise`. Mismatch → `failed`, alert, stop.
3. Run the scan at the order's tier — `runScan(domain, { tier })`.
4. If the scan is inconclusive, **do not fail the order**. Mark
   `fulfilment_status='failed'` with the reason, alert internally, and email the
   customer to say we could not complete it and someone will be in touch. They
   have paid; silence is the one unacceptable outcome. A refund is a human
   decision, not an automatic one.
5. Build the report with `buildReport(scan, tier)`. Store the scan and the
   report JSON.
6. Generate `report_token` — 32 random bytes hex — and set
   `report_expires_at`.
7. Queue the `paid_report` email, **transactional**.
8. `fulfilment_status='delivered'`, `delivered_at=NOW()`.

Wrap 3–7 so any throw lands as `failed` with the message, plus an internal
alert. Never leave an order stuck at `running`.

### 4 · Report delivery

**`GET /api/reports/:token`** — returns the stored report JSON if the token
matches and has not expired. Expired → a clear message and a contact link, not
a 404. Someone with an expired link is a paying customer, not an intruder.

**`src/Report.js` + `.css`** — the page at `/report/:token`. Renders what the
tier bought: grade and counts for all, plus findings with evidence for basic,
plus impact, remediation steps, verification and the roadmap for advanced.

Reuse existing tokens and classes. Add a print stylesheet so
**Ctrl+P produces something presentable** — it is the interim answer for
customers who want a file, until Task 07.

**Two new email templates** in `mail-templates.js`:

- `paid_report` — transactional, to the customer. Grade, counts, the link, the
  expiry date. **No finding titles and no evidence** — an email is forwarded
  far more often than a page, and the paywall applies to both.
- `fulfilment_failed` — internal, to `ENQUIRY_ALERT_TO`. Order ref, tier,
  domain, error, and the amount at stake.

### 5 · Frontend

**`src/Checkout.js`** at `/checkout?tier=advanced&domain=example.com`.

Collects email, optional name and company, confirms the domain, and requires an
explicit **"I have read and accept the Terms of Service and Privacy Notice"**
checkbox with links to `/legal/terms` and `/legal/privacy`. Record the terms
version on the order.

Loads Razorpay's checkout script from `https://checkout.razorpay.com/v1/checkout.js`
on demand — not in `index.html`, where it would load on every page including
the free scan.

**`src/Result.js`** — the existing buy path currently goes to `/pricing`. When
a plan is available, link to `/checkout?tier=X&domain=Y` carrying the scanned
domain, so the customer does not retype it.

**`src/OrderStatus.js`** at `/order/:ref` — the post-payment page. Polls
`GET /api/payments/order/:ref` every 3 seconds for up to 3 minutes. Shows the
scan running, then the report link. On failure, shows a calm message saying we
have their payment, something went wrong, and a person has been alerted.

**`src/Pricing.js`** — where `available` is true, the button becomes
**Buy report** linking to `/checkout?tier=X`. Where false, "Notify me" stays.

---

## Verification — the part that matters

Razorpay test keys are in `.env`. Use test card **4111 1111 1111 1111**, any
future expiry, any CVV.

```bash
# 1 — schema applies twice
mysql -u root -p dshield < db/schema-orders.sql
mysql -u root -p dshield < db/schema-orders.sql

# 2 — build and boot
npx react-scripts build
node server.js &
curl -s localhost:4008/api/health

# 3 — FREE SCAN UNCHANGED
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"github.com"}'
```

**Then the whole chain, by hand, in a browser.** This is the test this task
exists for and it cannot be replaced by unit tests:

1. Run a free scan, click through to buy Advanced
2. Complete checkout with the test card
3. Land on `/order/:ref` and watch it move to delivered
4. Open the report link
5. **Confirm the report contains remediation steps** — the thing $199 buys
6. **Check the inbox** and confirm the email arrived with the link and **no
   finding titles**
7. `SELECT order_ref, status, fulfilment_status, amount_paise, amount_paid_paise, delivered_at FROM orders;`

**Then the failure paths**, each of which must be proven, not assumed:

| Test | Expected |
|---|---|
| Replay the same webhook body twice | One order delivered. Second attempt fulfils nothing. `SELECT COUNT(*) FROM mail_outbox WHERE template='paid_report'` returns 1. |
| Webhook with a wrong signature | Logged to `payment_events` with `signature_valid=0`, order untouched, 200 returned |
| Checkout with no domain on an assessment tier | 400 before any Razorpay order is created |
| Checkout with `termsAccepted` false | 400 |
| Basic-tier report | Findings present, **no remediation** |
| Expired report token | Clear message, not a 404 |
| Tampered amount — set `amount_paid_paise` below `amount_paise` and fulfil | `failed`, internal alert, no report |

Report the actual result of every row.

Also confirm:
- `git diff package.json` shows `razorpay` and nothing else, if you used the SDK
- The key **secret** appears nowhere in the built frontend:
  `grep -r "$RAZORPAY_KEY_SECRET" build/` finds nothing
- A snapshot report still leaks no titles — re-run
  `node scripts/verify-remediation.js`

---

## Report back

1. Files created and edited
2. Every verification row above with its real result
3. Whether you completed a real test payment end to end, and what the customer
   received at each step
4. The contents of `orders` and `mail_outbox` after the run
5. Anything wrong or conflicting in these instructions — Tasks 01, 02, 05a and
   05c each found genuine errors in theirs, and 05c's would have destroyed the
   paywall had it been followed literally

**If any part of the chain does not work, say so and do not mark the task
complete.** A checkout that takes money without delivering is the one failure
this project cannot afford.

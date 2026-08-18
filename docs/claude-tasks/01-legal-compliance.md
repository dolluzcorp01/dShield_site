# Claude Code — dShield Site · Task 01
## Legal & compliance foundation

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Run from:** the repository root
**Expected scope:** 3 new backend files, 3 new frontend files, 4 edits to existing files
**Do not touch:** `src/utils/scan_engine.js`, `src/utils/tools_engine.js`, `src/backend_routes/Scan_server.js`, `src/backend_routes/Tools_server.js`

---

## Why this task exists

Two reasons, and the second is the one that matters commercially.

**1. The site already collects personal data and has nowhere to disclose it.**
`Scan_server.js` stores `visitor_ip` and `visitor_email` on every scan.
`Lead_server.js` stores email, name, company and phone. There is no privacy
notice, no terms, no way for anyone to ask to be removed. Under the DPDP Act
2023 a published notice and a named grievance officer are required, not
optional.

**2. Razorpay onboarding is blocked without these pages.**
Indian payment gateways generally require a live website with published Terms,
Privacy Policy, Refund & Cancellation Policy and Contact page before they will
approve a merchant account. KYC is the longest pole in the dShield launch
plan, so building these pages is not a compliance chore that delays revenue —
it is a prerequisite for starting the clock on it.

*(Confirm the exact list against Razorpay's current merchant onboarding
requirements before submitting. It has been stable for years but it is their
rule, not ours.)*

---

## Design decisions — follow these, do not substitute

### Four documents, not seven

The main dShield product has seven legal documents. Four of them — the DPA,
NDA, Change Authority Annex and Protected Asset Schedule — only apply when a
customer uploads logs or lets us change their systems. Neither happens on the
public site.

Build exactly these four:

| `doc_key` | Title | Why |
|---|---|---|
| `terms` | Terms of Service | Razorpay requirement; governs use of the free scan and tools |
| `privacy` | Privacy Notice | DPDP Act; we store IP and email |
| `refunds` | Refund & Cancellation Policy | Razorpay requirement. Required *before* anything is on sale. |
| `cookies` | Cookie Notice | Discloses the one cookie we set |

### Placeholder text, clearly marked

Counsel has not reviewed anything. Every document ships with placeholder body
text and `is_placeholder = TRUE`.

Placeholder text must be **obviously** placeholder — a banner on the page
reading "This document is awaiting legal review and is not yet binding", not
plausible-looking legalese that a visitor would mistake for a real policy.
Fake terms are worse than no terms, because a visitor relies on them.

### No cookie consent banner

Do **not** build a cookie consent banner.

The site currently sets no analytics cookies, no advertising cookies, and no
tracking of any kind. Under both DPDP and GDPR, consent is required only for
non-essential cookies. A banner asking permission for cookies we do not set is
theatre, and asking for consent you do not need trains people to click through
consent that matters.

A Cookie Notice **page** is the correct response today. Add a note in that
page's source comment stating plainly: *the moment analytics is added, a
consent banner becomes required and this decision must be revisited.*

### Suppression is stored as a hash, never as an address

Copy this from the main product — it is deliberate and it is right.

The unsubscribe table stores `SHA-256(lowercased email)` and nothing else. No
address, no name, no history. It cannot be used to look anyone up or to
enumerate who has ever contacted us. It answers exactly one question, asked
immediately before every send: *is this address suppressed?*

A suppression must also be able to outlive the `leads` row it came from, so
there is **no foreign key** to `leads`.

---

## What to build

### 1 · `db/schema-legal.sql` — new file

A second schema file. `db/schema.sql` stays untouched; this is applied after
it. Add a short header comment saying it must be run after `schema.sql`.

```sql
USE dshield;
```

**Table `legal_documents`**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT PK | |
| `doc_key` | VARCHAR(40) NOT NULL | `terms`, `privacy`, `refunds`, `cookies` |
| `version` | SMALLINT UNSIGNED NOT NULL | starts at 1 |
| `title` | VARCHAR(160) NOT NULL | |
| `content` | MEDIUMTEXT NOT NULL | markdown |
| `is_placeholder` | BOOLEAN NOT NULL DEFAULT TRUE | |
| `effective_from` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| `created_at` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | |

- `UNIQUE KEY uq_doc_version (doc_key, version)`
- `INDEX idx_current (doc_key, effective_from)`

Versioned rather than updated in place: when counsel replaces a placeholder,
that is version 2 and version 1 still exists. Once anyone has agreed to a
version, overwriting it destroys the record of what they agreed to.

**Table `email_suppression`**

| Column | Type | Notes |
|---|---|---|
| `email_hash` | CHAR(64) PRIMARY KEY | SHA-256 of the lowercased, trimmed address |
| `reason` | ENUM('unsubscribed','complained','bounced','manual','erasure') NOT NULL | |
| `suppressed_at` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | |

No email column. No foreign key. Add the comment explaining why — the next
person to read it will otherwise "fix" it by adding the address back.

**Table `data_requests`**

For DPDP access and erasure requests.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT PK | |
| `email` | VARCHAR(190) NOT NULL | |
| `request_type` | ENUM('access','erasure','correction') NOT NULL | |
| `details` | TEXT NULL | |
| `status` | ENUM('open','actioned','rejected') NOT NULL DEFAULT 'open' | |
| `created_at` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| `actioned_at` | TIMESTAMP NULL | |

Index on `status` and `created_at`. The DPDP Act gives a response deadline, so
these must be findable by age, not just by address.

**Add `unsubscribe_token` to `leads`**

```sql
ALTER TABLE leads
  ADD COLUMN unsubscribe_token CHAR(36) NULL AFTER scan_id,
  ADD UNIQUE KEY uq_unsub_token (unsubscribe_token);
```

**Seed the four placeholder documents** at the bottom of the file with
`INSERT IGNORE`, version 1, `is_placeholder = TRUE`. Body text should be a
short honest paragraph per document saying what it will cover, not invented
legal wording. Include the placeholder markers listed in "What only Shoban can
supply" below, written literally as `[[REGISTERED_ADDRESS]]` etc. so they are
greppable.

---

### 2 · `src/backend_routes/Legal_server.js` — new file

Follow the exact house style of `Lead_server.js`: `express.Router()`,
`getDBConnection(process.env.DB_NAME || "dshield")`, callback-style
`db.query`, `{ success, message }` response shape, `console.error` with an
`⚠️`/`❌` prefix on failure.

| Route | Behaviour |
|---|---|
| `GET /api/legal` | List all current documents: `doc_key`, `title`, `is_placeholder`, `effective_from`. Latest version per key only. |
| `GET /api/legal/:key` | One document, latest version. 404 with a plain message if the key is unknown. Validate `:key` against the four known keys — do not interpolate it into SQL. |
| `GET /api/preferences/:token` | Look up a lead by `unsubscribe_token`. Return a **masked** email (`sh•••@dolluzcorp.com`), never the full address. Unknown token → 404, same message as an expired one. |
| `POST /api/preferences/:token/unsubscribe` | Write the SHA-256 of the address into `email_suppression` with reason `unsubscribed`. Idempotent — unsubscribing twice must succeed, not error. |
| `POST /api/data-request` | Body `{ email, request_type, details }`. Validate email. Insert into `data_requests`. |

Masking matters: without it, anyone who can guess a token gets an address.
With it, the person recognises their own address and nobody learns a new one.

Reuse the in-memory limiter pattern already in `Tools_server.js` for
`POST /api/data-request` — 10 per hour per IP is ample.

---

### 3 · `src/Legal.js` + `src/Legal.css` — new files

One component rendering any legal document by slug, plus a small index page.

- Route param `:key` maps to `GET /api/legal/:key`
- Render the markdown body. **Do not add a markdown library** — the placeholder
  text is plain paragraphs and headings. A simple split on blank lines with
  `<h2>` for lines starting `## ` is enough. Keep the dependency list as it is.
- When `is_placeholder` is true, render a prominent notice above the content
  using the existing `.ds-note` class: *"This document is awaiting legal review
  and is not yet binding."*
- Show `effective_from` as a formatted date at the top
- Use existing tokens from `index.css`. Do not introduce new colours.

Also export a `DataRequest` component — a small form posting to
`/api/data-request` with a type selector (access / erasure / correction). This
is how a person exercises their DPDP rights, and the Privacy Notice must be
able to link to it.

---

### 4 · `src/Preferences.js` — new file

The unsubscribe landing page, reached from an email link at
`/preferences/:token`.

- Load `GET /api/preferences/:token`, show the masked address
- One clear button: **Unsubscribe from all email**
- On success, a confirmation that does not require another click
- On an unknown or expired token, a calm message and a link to `/contact` —
  not an error page. Someone clicking an old unsubscribe link is trying to do
  the right thing and should not be met with a failure.

Reuse `.ds-card`, `.ds-btn`, `.ds-note`. No new CSS file — add the handful of
rules to `Pages.css`.

---

### 5 · Edits to existing files

**`server.js`** — mount the new router alongside the existing three, same
style:

```js
const LegalRoutes = require('./src/backend_routes/Legal_server');
app.use("/api/legal", LegalRoutes);
```

Note the data-request and preferences routes live in the same file but mount
at different paths. Either mount `Legal_server` three times at `/api/legal`,
`/api/preferences` and `/api/data-request`, or export three routers from it —
**prefer three named router exports**, matching how `wired.js` does it in the
main product. Keep it explicit.

**`src/App.js`** — add routes, keeping the existing order and the `*`
catch-all last:

```
/legal              → legal index
/legal/:key         → Legal
/preferences/:token → Preferences
/data-request       → DataRequest
```

**`src/Pages.js`** — the footer currently links to five pages. Add a second
row beneath the existing `footer__links` nav, visually lighter, containing:
Terms · Privacy · Refunds · Cookies · Your data. Keep the existing row as it
is; do not merge them into one list of nine.

**`src/backend_routes/Lead_server.js`** — two changes:

1. Generate an `unsubscribe_token` (`crypto.randomUUID()`) when inserting a
   lead in `/notify`, and on the `ON DUPLICATE KEY UPDATE` path use
   `COALESCE(unsubscribe_token, VALUES(unsubscribe_token))` so a returning
   lead keeps the token already printed in an email they may still have.
2. Before inserting into `leads`, check `email_suppression` for the hash. If
   suppressed, return `{ success: true }` with a neutral message but **do not
   write the row**. Someone who has unsubscribed and then fills in a form
   again should not be silently re-subscribed, and should not be told they are
   on a suppression list either.

**`README.md`** — add `mysql -u root -p < db/schema-legal.sql` to the setup
steps, immediately after the existing `schema.sql` line.

---

## What only Shoban can supply

Leave these as literal, greppable placeholders. Do **not** invent values —
a wrong registered address in a published privacy notice is worse than an
obvious blank.

| Placeholder | What it is |
|---|---|
| `[[LEGAL_ENTITY_NAME]]` | Full registered company name |
| `[[REGISTERED_ADDRESS]]` | Registered office address |
| `[[GRIEVANCE_OFFICER_NAME]]` | Required by DPDP Act 2023 |
| `[[GRIEVANCE_OFFICER_EMAIL]]` | Required by DPDP Act 2023 |
| `[[SUPPORT_EMAIL]]` | General contact |
| `[[JURISDICTION]]` | e.g. "the courts of Chennai, Tamil Nadu" |
| `[[CIN]]` | Company identification number, if applicable |

At the end of your run, print a list of every file containing a `[[` marker so
Shoban has one checklist to hand to counsel.

---

## Verification before you finish

Run these and report the actual output. Do not report success without running
them.

```bash
# 1 — schema applies cleanly, twice (it must be safe to re-run)
mysql -u root -p dshield < db/schema-legal.sql
mysql -u root -p dshield < db/schema-legal.sql

# 2 — frontend still compiles
npx react-scripts build

# 3 — server boots
node server.js &
curl -s localhost:4008/api/health

# 4 — legal endpoints
curl -s localhost:4008/api/legal
curl -s localhost:4008/api/legal/privacy
curl -s localhost:4008/api/legal/nonsense      # expect a clean 404

# 5 — the scan is untouched
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"dolluzcorp.com"}'
```

Step 5 is the important one. This task must not change scan behaviour in any
way. If the grade or the finding counts differ from before your changes,
something is wrong and you should say so rather than proceeding.

Also confirm by inspection:

- `git diff --stat` touches only the files listed in this document
- No new npm dependency has been added
- `grep -rn "consent" src/` finds no cookie banner
- `grep -rn "email" db/schema-legal.sql` shows no email column on
  `email_suppression`

---

## Report back

State plainly:

1. Which files you created and which you edited
2. The output of every verification step above
3. Every `[[PLACEHOLDER]]` and the file it sits in
4. Anything in these instructions that turned out to be wrong or impossible —
   say so rather than working around it silently. If something here conflicts
   with what is actually in the repo, stop and describe the conflict.

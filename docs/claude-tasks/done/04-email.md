# Claude Code — dShield Site · Task 04
## Email delivery

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 03 merged (`1bcb7db` or later)
**Do not touch:** `src/utils/scan_engine.js`, `src/utils/tools_engine.js`,
`src/backend_routes/Scan_server.js`, `src/backend_routes/Tools_server.js`

---

## Why this task exists

**Nothing on this site sends an email.** Three consequences, live today:

**1. "Notify me" is a dead end.** A person gives us their address, sees *"You
are on the list"*, and hears nothing. Weeks later a launch email arrives from a
company they have half forgotten.

**2. Enquiries reach nobody.** Somebody asks to talk to us about penetration
testing, sees a thank-you screen, and the row sits in the `enquiries` table
until a human happens to look. If nobody looks, they conclude we ignored them.

**3. The unsubscribe page cannot be reached.** Task 01 built
`/preferences/:token`. It works, the token is generated and stored, and no
human being can get to it — the link only exists in an email that is never
sent. That is not yet a broken promise, because we have emailed nobody. **It
becomes one the moment the first marketing email goes out without it.**

The three are the same gap. Closing it makes the unsubscribe page reachable,
which is what makes sending lawful.

---

## Design decisions — follow these, do not substitute

### Queue first, send second — the outbox pattern

Do **not** call SendGrid inside a request handler.

Every send is written to a `mail_outbox` row inside the same flow that created
it, and a worker picks it up afterwards. Reasons, in order of how badly each
has bitten before:

- **A provider outage must not lose mail.** A Dolluz SendGrid account was once
  frozen; every message attempted during that window was dropped and gone,
  with nothing recording that it had ever been attempted. A row in a table
  survives an outage, a restart, and a bad deploy.
- **A visitor must never wait on SendGrid.** The enquiry form should confirm in
  milliseconds whether or not mail is working.
- **A failed send must be visible.** `status = 'failed'` with the error and an
  attempt count is a thing somebody can find. A `console.error` scrolling past
  at 2am is not.

### Suppression is checked at send time, not only at signup

`isSuppressed` already guards the signup paths. Check it **again** in the
worker, immediately before handing anything to SendGrid.

Someone can unsubscribe between a message being queued and it being sent. The
check at signup prevents a subscription; the check at send prevents a delivery.
Both are needed and they are not the same guard.

### Every marketing email carries an unsubscribe link. Transactional ones do not need to.

Two categories, and they behave differently:

| Category | Examples | Unsubscribe link | Suppression applies |
|---|---|---|---|
| **Transactional** | Scan result they asked for, enquiry acknowledgement | Not required | **No** |
| **Marketing** | Notify-me confirmation, future launch announcement | **Required** | **Yes** |

A scan result is something a person explicitly asked us to send them, in that
moment, by typing their address into a box that said so. Withholding it because
they unsubscribed from marketing last year would be unhelpful and is not what
suppression is for.

Store the category on the outbox row. The worker uses it to decide whether to
apply suppression and whether the footer is required.

**Get this wrong in the safe direction.** If in doubt, mark it marketing.

### Internal notifications are not marketing

The enquiry alert goes to Dolluz, not to a customer. No unsubscribe footer, no
suppression check — but it still goes through the outbox, because an enquiry
alert that silently fails is the whole problem this task exists to fix.

### Plain HTML, no template engine

Do not add a templating dependency. Template literals in a `templates.js` file
are enough for four emails. Send both an HTML part and a plain-text part —
some clients show the text version, and a text-only fallback that reads as
gibberish looks broken.

Keep the HTML simple: tables and inline styles. Email clients are not browsers
and do not support the CSS this site uses.

### The one npm dependency this task may add

`@sendgrid/mail`. That is the only permitted addition. Say so in your report.

---

## What to build

### 1 · `db/schema-mail.sql` — new file

Applied after `schema.sql` and `schema-legal.sql`. Note that in a header
comment, and add it to the README setup steps.

**Table `mail_outbox`**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT PK | |
| `to_email` | VARCHAR(190) NOT NULL | |
| `template` | VARCHAR(40) NOT NULL | `notify_confirm`, `scan_result`, `enquiry_ack`, `enquiry_alert` |
| `category` | ENUM('transactional','marketing','internal') NOT NULL | decides suppression and footer |
| `subject` | VARCHAR(255) NOT NULL | |
| `payload` | JSON NOT NULL | everything the template needs to render |
| `status` | ENUM('queued','sending','sent','failed','suppressed') NOT NULL DEFAULT 'queued' | |
| `attempts` | TINYINT UNSIGNED NOT NULL DEFAULT 0 | |
| `last_error` | VARCHAR(500) NULL | |
| `queued_at` | TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| `sent_at` | TIMESTAMP NULL | |

- `INDEX idx_status_queued (status, queued_at)` — the worker's only query
- `INDEX idx_to (to_email)`

`suppressed` is a distinct status from `failed`. "We chose not to send this"
and "we tried and could not" are different facts, and conflating them makes
the table useless for answering either question later.

Render the body at send time from `payload`, not at queue time. A wording fix
should not require re-queueing anything.

**Add to `.env` and `.env.example`:**

```
SENDGRID_API_KEY=
SENDGRID_FROM=noreply@dolluzcorp.com
SENDGRID_FROM_NAME=dShield
ENQUIRY_ALERT_TO=
MAIL_WORKER_ENABLED=true
```

`ENQUIRY_ALERT_TO` is where enquiry alerts land — a real Dolluz address.

### 2 · `src/utils/mail.js` — new file

- `queueMail(db, { to, template, category, subject, payload }, cb)` — inserts
  one outbox row. Validates the address, returns an error rather than throwing.
- `sendNow(row)` — hands one message to SendGrid, returns a promise
- `isConfigured()` — true when `SENDGRID_API_KEY` is set and not a placeholder

**Behaviour with no API key configured:** `queueMail` still writes the row.
The worker logs once at startup that mail is not configured and leaves rows
`queued`. It does not mark them failed, and it does not crash.

This matters. A developer running locally without a key should still be able to
exercise the whole flow and see rows appear, and those rows should send the
moment a key is added rather than needing to be re-created.

### 3 · `src/utils/mail-templates.js` — new file

Four templates. Each exports `{ subject(payload), html(payload), text(payload) }`.

Write them in the site's voice — plain, direct, no exclamation marks, no
"Hi there!". Read the copy on `/trust` and `/how-it-works` and match it.

**`notify_confirm`** — marketing. To the person.
Subject: `You are on the list — dShield`
Body: confirms we will write once paid reports open; states we will not write
about anything else; one line pointing back to the free scan and the five free
tools, which they can use now. Unsubscribe link in the footer.

**`scan_result`** — transactional. To the person who gave an address on a scan.
Subject: `Your dShield scan of {domain}`
Body: the grade, the score, the counts by severity, and a link to the result
page. **No finding titles and no evidence** — the same paywall applies in email
as on the page, and an email is more likely to be forwarded than a page is.
Include the honest line that a scan covers five of twenty-three risk domains
and link to `/coverage`.

**`enquiry_ack`** — transactional. To the person who wrote to us.
Subject: `We have your message — Dolluz Corp`
Body: short. Confirms receipt, says a person will reply, does not promise a
time we have not agreed. If they named a topic, mention it back to them so it
is clear we read it.

**`enquiry_alert`** — internal. To `ENQUIRY_ALERT_TO`.
Subject: `Enquiry from {name or email} — {topic or "general"}`
Body: every field they submitted, laid out plainly, plus the timestamp. This is
a working document for whoever picks it up, not a customer-facing email.

**Footer rule:** the shared footer takes a category. Marketing gets the
unsubscribe line with an absolute URL built from `PUBLIC_URL` and the lead's
`unsubscribe_token`. Transactional and internal get a one-line explanation of
why the person received it. Every email says who we are and where we are.

### 4 · `src/workers/mail-worker.js` — new file

A `setInterval` poller, not a queue library. There is no Redis in this app and
adding one for four emails a day would be absurd.

Every 30 seconds:

1. Select up to 10 rows `WHERE status = 'queued' AND attempts < 5`
   `ORDER BY queued_at`
2. For each, mark `sending` first, so a second tick cannot pick up the same row
3. **If category is `marketing`, check suppression.** Suppressed → status
   `suppressed`, do not send, do not count an attempt
4. Render and send
5. Success → `sent`, `sent_at = NOW()`. Failure → increment `attempts`, store
   `last_error` truncated to 500 chars, return to `queued`
6. At `attempts >= 5` the row stops being selected. Do not delete it — a
   permanently failed email is something somebody needs to see.

Start it from `server.js` when `MAIL_WORKER_ENABLED` is true, and add a
comment explaining that this runs in-process **because the site is a single
instance**. Under PM2 cluster mode, four processes would each poll the same
table and send everything four times. If that day comes, the fix is a lock, not
more polling.

### 5 · Wire the three triggers

**`src/backend_routes/Lead_server.js`**

- `/notify` — after a successful insert, queue `notify_confirm` as
  **marketing**. Payload needs the unsubscribe token, so read it back with the
  insert rather than generating a second one.
- `/enquiry` — after a successful insert, queue two: `enquiry_ack` to them as
  **transactional**, and `enquiry_alert` to `ENQUIRY_ALERT_TO` as **internal**.

In both cases the HTTP response must not depend on queueing succeeding. If
`queueMail` errors, log it and still return success to the visitor — their
enquiry is stored, which is the part that matters.

**`src/backend_routes/Scan_server.js` — the one exception to do-not-touch**

Add **only** the queueing of `scan_result` when `visitor_email` is present, as
**transactional**. Change nothing else in the file: not the scan call, not the
scoring, not the response, not the existing suppression logic.

Queue it after the scan row is written and after the response has been sent to
the client. The scan result is what they came for and must never wait on the
mail table.

### 6 · Small frontend change

`src/Pricing.js` — the notify-me success message currently says *"You are on
the list."* Change it to say a confirmation email is on its way, so a person
knows to expect one. One sentence. Do not restructure the component.

---

## Verification before you finish

`SENDGRID_API_KEY` is a working key in `.env`, so these can send real mail.

```bash
# 1 — schema applies twice
mysql -u root -p dshield < db/schema-mail.sql
mysql -u root -p dshield < db/schema-mail.sql

# 2 — build
npx react-scripts build

# 3 — server boots with the worker
node server.js &
curl -s localhost:4008/api/health

# 4 — notify queues a marketing email
curl -s -X POST localhost:4008/api/leads/notify \
     -H "Content-Type: application/json" \
     -d '{"email":"REPLACE_WITH_A_REAL_INBOX","tier":"advanced"}'

# 5 — enquiry queues two
curl -s -X POST localhost:4008/api/leads/enquiry \
     -H "Content-Type: application/json" \
     -d '{"email":"REPLACE_WITH_A_REAL_INBOX","name":"Test","topic":"penetration-testing","message":"Testing the alert."}'

# 6 — scan with an email queues a result
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"dolluzcorp.com","email":"REPLACE_WITH_A_REAL_INBOX"}'
```

Then, after waiting for a worker tick:

```sql
SELECT id, template, category, status, attempts, last_error FROM mail_outbox;
```

**Report the actual contents of that table.** Every row should reach `sent`.

**Then the two tests that matter most:**

**A — suppression is honoured at send time.**
Queue a `notify_confirm` for an address, immediately insert that address's
SHA-256 into `email_suppression`, and let the worker run. The row must end as
`suppressed`, not `sent`. This proves the second guard works, which is the one
that protects us if somebody unsubscribes at the wrong moment.

**B — a transactional email is NOT suppressed.**
With that same address still suppressed, queue a `scan_result`. It must
**send**. If it is suppressed, the category logic is inverted and a person who
asked for their result would silently not get it.

**Then look at the actual emails in the inbox** and confirm:
- The marketing one has a working unsubscribe link that opens
  `/preferences/:token` and shows the masked address
- The scan result contains **no finding titles and no evidence**
- The enquiry alert contains every submitted field
- The plain-text version of each reads sensibly on its own

**C — the scan is unchanged.**

```bash
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"dolluzcorp.com"}'
```

Grade **A**, score **90**, counts `0 / 1 / 0 / 0`. If anything differs, stop and
say which check moved.

Delete the test rows from `leads`, `enquiries`, `mail_outbox` and
`email_suppression` when you are done, and say that you have.

Also confirm:
- `git diff package.json` shows `@sendgrid/mail` and nothing else
- The diff of `Scan_server.js` contains only the queueing addition

---

## Report back

1. Files created and edited
2. The real contents of `mail_outbox` after the run
3. Whether tests A and B passed, quoting the status each row ended with
4. Whether you actually opened the emails, and what the unsubscribe link did
5. Anything wrong, impossible, or conflicting in these instructions — say so
   plainly. Tasks 01 and 02 each found a genuine error in theirs.

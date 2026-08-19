# Claude Code — dShield Site · Task 05a
## Port the full check engine — 8 checks to 58

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 04 merged (`aa884ca` or later)
**Source material:** the dShield v6.3 package, `CURRENT/backend/dShield-Backend-v6.3.zip`,
files `src/checks/*.js`
**Do not touch:** `src/backend_routes/Tools_server.js`, `src/utils/tools_engine.js`,
`src/utils/suppression.js`, `src/utils/mail.js`, `src/workers/mail-worker.js`

---

## Why this task exists

There is nothing behind the paywall.

The site runs **8 checks**. Every tier runs the same 8, because no others
exist. So a Basic customer paying $49 would receive the titles of the same
eight findings the free scan already counted, and an Advanced customer paying
$199 would receive nothing further at all.

The pricing page currently promises *"step-by-step remediation for every
finding"*, a *"90-day roadmap"* and *"full asset inventory"*. None of that
content exists in this repository.

**Checkout cannot be built until there is something to sell.** This task and
its sibling 05b supply it: 05a brings the checks, 05b brings the remediation
guidance that turns a finding into something a customer can act on.

---

## The shape of the port

58 checks across five files in the source package:

| Source file | Checks | Domain |
|---|---|---|
| `surface.js` | 13 | 1 — External Attack Surface |
| `http.js` | 15 | 1 — headers and cookies |
| `tls.js` | 8 | 4 — Encryption & Certificates |
| `email.js` | 13 | 6 — Email & Domain Security |
| `intel.js` | 9 | 10 & 20 — Breach intelligence, Brand |

By tier: **8 snapshot** (already here), **11 basic**, **39 advanced**.

The 8 currently in `scan_engine.js` are already correct and already match the
source IDs. They stay. This task adds the other 50.

---

## Design decisions — follow these, do not substitute

### Port faithfully. Do not improve the checks.

Check IDs, domains, severities, tiers and titles must match v6.3 **exactly**.
The scoring formula is published on `/trust` and a customer is invited to
recompute any grade by hand. If this site scores `SURF-ADMIN-02` as critical
while the main product scores it high, the same domain gets two different
grades from the same company.

One check in particular: **`SURF-ADMIN-02` is `high`, not `critical`.** It was
critical once, and because a single critical caps a grade at D, google.com,
wikipedia.org and stripe.com all scored D. If you find a source that says
critical, the source is stale — it is `high`.

### One exception, and only one: the certificate expiry threshold

`TLS-CERT-EXPIRING-28` in this repo warns at **14 days**, not 30. That is a
deliberate local fix and it stays.

Let's Encrypt issues 90-day certificates and renews at 30 days remaining. A
30-day threshold fires on perfectly healthy sites in the middle of normal
automated renewal — tested against stripe.com, which sat at 29 days while
renewing correctly. Do not "restore" it to 30 to match the source.

### Keep the current file structure, do not copy the source architecture

The v6.3 engine uses ES6 classes, a `Check` base class, a `CheckRegistry`, and
a `ScanContext`. **Do not port that.** This repo uses a flat array of plain
objects with a `run(target)` function, and it works.

Split by area, as the source does, but in this repo's style:

```
src/utils/checks/surface.js    exports an array
src/utils/checks/http.js
src/utils/checks/tls.js
src/utils/checks/email.js
src/utils/checks/intel.js
src/utils/checks/index.js      concatenates them, exports ALL_CHECKS
```

`scan_engine.js` then imports `ALL_CHECKS` instead of holding the array
inline. Everything else in `scan_engine.js` — scoring, tier gating,
`normaliseDomain`, `isPrivateAddress`, the coverage floor — stays exactly as
it is. **Do not modify the scoring logic in this task.**

Each check object keeps the existing shape:

```js
{ id, domain, severity, minTier, title, why, async run(target) { ... } }
```

`why` is this repo's addition and the source has no equivalent — one sentence,
plain English, explaining why a person should care. Write one for each of the
50. It is what makes a finding readable rather than a code.

### Tier gating already exists — use it

`scan_engine.js` currently runs every check because all 8 are snapshot. Add a
`minTier` filter so `runScan(domain, { tier })` runs only the checks at or
below that tier, with `snapshot` as the default.

The rank order is `snapshot → basic → advanced → full_protection`. A higher
tier runs everything the lower tiers run plus its own — never a different set.
**Write a test for this.** A tier that is not a superset of the one below is a
customer paying more for less.

### Three checks need API keys they do not have

`BREACH-CREDS-52` and `BREACH-EXEC-53` need a HIBP key; `BREACH-SECRET-54`
needs a GitHub token. Neither is configured on this site.

Port them, and have them return **inconclusive with a clear reason** when the
key is absent — exactly as the source does. Do not skip them, and do not let
them pass.

This matters more than it looks. HIBP's domain-search endpoint also requires
the customer to have verified ownership of the domain, and the correct
commercial plan is $379/month rather than the $3.95 assumed in the original
budget. Those checks will therefore stay inconclusive for some time. An
inconclusive check is excluded from scoring on both sides, so their presence
costs nothing and their absence would be a silent gap later.

### Reuse the helpers already here

`scan_engine.js` exports `fetchUrl`, `getCertificate`, `txtRecords`,
`withTimeout` and `typoVariants`. Use them. Do not write a second HTTP helper.

`fetchUrl` caps the response body deliberately — a homepage over 256 KB once
hung every HTTP check in the source engine, because destroying the socket meant
the `end` event never fired. One check took ten seconds against a 108ms raw
request. Do not remove the cap.

### The budget problem you must solve

The current scan runs 8 checks sequentially and takes 20–60 seconds. **58
sequential checks will exceed any reasonable request timeout.**

Group checks that hit the same target and run each group with bounded
concurrency — `Promise.all` over batches of 6–8, not all 58 at once. A single
site being hit by 58 simultaneous requests from us looks like an attack and may
get our IP blocked, which is the opposite of passive.

Add an overall budget: **150 seconds**, after which remaining checks are marked
inconclusive rather than the scan failing. A partial scan that says so honestly
is worth more than a scan that hangs.

Fetch the homepage **once** and share the response across every check that
needs it. Fifteen header and cookie checks all reading the same page must not
make fifteen requests.

---

## What to build

### 1 · `src/utils/checks/` — five new files plus an index

Port the 58, keeping the 8 that exist. Work file by file and verify each before
moving to the next; this is a long task and a mistake in check 40 is easier to
find if checks 1–39 are already green.

**Order of work, easiest first:**

1. `tls.js` — 8 checks, all from one certificate read, no new technique
2. `email.js` — 13 checks, all DNS TXT lookups
3. `http.js` — 15 checks, all from one homepage fetch
4. `surface.js` — 13 checks, multiple paths per target, the most work
5. `intel.js` — 9 checks, three of which stay inconclusive

`index.js` concatenates and exports `ALL_CHECKS`, and throws at load time if
any two checks share an ID. A duplicate ID silently overwrites a finding and
would be very hard to trace.

### 2 · `src/utils/scan_engine.js` — modify

- Import `ALL_CHECKS` rather than holding the array inline
- Add the `tier` option and the `minTier` filter
- Add the concurrency batching and the 150-second budget
- Share one homepage fetch across the checks that need it
- **Change nothing about scoring, grading, coverage, or the SSRF guards**

### 3 · `src/backend_routes/Scan_server.js` — minimal change

The free scan continues to call `runScan(domain)` with no tier, which defaults
to `snapshot` and runs 8 checks. **Free scan behaviour must not change.**

Add nothing else. Paid scans arrive in Task 06.

### 4 · A test script

`scripts/verify-checks.js`, run with `node scripts/verify-checks.js`.

Assert, without needing a database or a network:

- Exactly 58 checks load
- No duplicate IDs
- Every check has `id`, `domain`, `severity`, `minTier`, `title`, `why`, `run`
- Severity is one of critical/high/medium/low
- Tier counts are 8 / 11 / 39
- Each tier is a strict superset of the one below
- `SURF-ADMIN-02` is `high`
- Every ID matches `^[A-Z]+-[A-Z0-9-]+$`

Print a table of tier, count and domain spread at the end.

---

## Verification before you finish

```bash
# 1 — the check inventory
node scripts/verify-checks.js

# 2 — build
npx react-scripts build

# 3 — server boots
node server.js &
curl -s localhost:4008/api/health

# 4 — FREE SCAN UNCHANGED — the one that matters most
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"dolluzcorp.com"}'
```

Step 4 must still be grade **A**, score **90**, counts `0 / 1 / 0 / 0`, 8
checks run. If the free scan now runs more than 8 checks, the tier filter is
wrong and every free result changes.

**Then exercise the paid tiers directly**, since no route reaches them yet:

```bash
node -e "
const { runScan } = require('./src/utils/scan_engine');
(async () => {
  for (const tier of ['snapshot','basic','advanced']) {
    const r = await runScan('dolluzcorp.com', { tier });
    console.log(tier.padEnd(10), 'grade', r.grade, 'score', r.score,
                '| ran', r.checksRun, '| completed', r.checksCompleted,
                '| issues', r.totalIssues, '| inconclusive', r.inconclusive.length);
  }
})();
"
```

Report the real output. Expected: 8 / 19 / 58 checks respectively.

**Then test against three real sites and report timing**, because a scan that
takes four minutes is not shippable:

```bash
node -e "
const { runScan } = require('./src/utils/scan_engine');
(async () => {
  for (const d of ['dolluzcorp.com','github.com','stripe.com']) {
    const t = Date.now();
    const r = await runScan(d, { tier: 'advanced' });
    console.log(d.padEnd(18), r.grade, r.score, ((Date.now()-t)/1000).toFixed(1)+'s',
                'incon', r.inconclusive.length);
  }
})();
"
```

If an advanced scan takes longer than 90 seconds against a normal site, say so
rather than reporting success. That is a finding, not a failure.

Also confirm:
- `git diff package.json` is empty — no new dependency
- `git diff` does not touch `tools_engine.js`, `mail.js`, `mail-worker.js`,
  `suppression.js`, or `Tools_server.js`
- `TLS-CERT-EXPIRING-28` still warns at 14 days

---

## Report back

1. Files created and edited, and how many checks each file contributes
2. The output of `verify-checks.js`
3. The per-tier scan output and the timing table
4. Any check you could not port faithfully, and why. Some may depend on source
   helpers that do not exist here — say which, rather than approximating the
   behaviour silently.
5. Anything wrong or conflicting in these instructions. Tasks 01 and 02 each
   found a genuine error in theirs and were right to say so.

**Do not start Task 05b.** The remediation library is a separate task and this
one is large enough.

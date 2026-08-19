# Claude Code — dShield Site · Task 05c
## The remediation library — what a paid report actually contains

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 05b merged (`5d0266e`)
**Source material:** the v6.3 package, `src/data/remediation-library.json`
**Do not touch:** `src/utils/tools_engine.js`, `src/utils/suppression.js`,
`src/utils/mail.js`, `src/workers/mail-worker.js`,
`src/backend_routes/Tools_server.js`, and — except where stated below —
`src/utils/scan_engine.js`

---

## Why this task exists

Task 05a gave the site 58 checks. It still has nothing to say about any of
them beyond a title.

The pricing page promises, for $199, *"step-by-step remediation for every
finding"*, an *"effort estimate per finding"* and *"verification steps"*. None
of that text exists in this repository. Without it there is no difference
between Basic and Advanced, and no honest way to charge for either.

The v6.3 package has a 65-entry library carrying exactly this content — for
each check: what the finding is, what an attacker could do with it, numbered
steps to close it, a verification step, an effort estimate and the skill
needed. **This task ports it and connects it to the checks.**

---

## The library has four known defects. Fix them during the port.

I have verified all four against the v6.3 file. Do not assume the source is
correct.

### Defect 1 — 15 check IDs do not match the scanner

The library and the code drifted. The report looks findings up by ID, so each
mismatch renders a finding with a title and nothing else — silently, with no
error.

Rename these library IDs to the scanner's. **The scanner's ID is authoritative
in every case:**

| Library ID (wrong) | Scanner ID (correct) |
|---|---|
| `EMAIL-SPF-MISSING-38` | `EMAIL-SPF-38` |
| `EMAIL-SPF-SOFT-39` | `EMAIL-SPF-39` |
| `EMAIL-SPF-LOOKUP-40` | `EMAIL-SPF-40` |
| `EMAIL-SPF-MULTI-41` | `EMAIL-SPF-41` |
| `EMAIL-DKIM-MISSING-42` | `EMAIL-DKIM-42` |
| `EMAIL-DKIM-WEAK-43` | `EMAIL-DKIM-43` |
| `EMAIL-DMARC-MISSING-44` | `EMAIL-DMARC-44` |
| `EMAIL-DMARC-NONE-45` | `EMAIL-DMARC-45` |
| `EMAIL-DMARC-NORUA-46` | `EMAIL-DMARC-46` |
| `HDR-HSTS-WEAK-18` | `HDR-HSTS-18` |
| `HDR-CSP-UNSAFE-20` | `HDR-CSP-20` |
| `TLS-PROTO-OLD-33` | `TLS-PROTO-33` |
| `BREACH-SOURCE-55` | `BREACH-METADATA-55` |
| `BRAND-TYPO-REG-58` | `BRAND-TYPO-58` |
| `BRAND-TYPO-ACTIVE-59` | `BRAND-TYPO-59` |

`BREACH-SOURCE-55` → `BREACH-METADATA-55` deserves a second look: confirm the
library's text still describes what our check actually does — internal
hostnames leaking through certificate transparency logs. If the text describes
something else, rewrite it to match the check rather than shipping guidance for
a finding we did not make.

### Defect 2 — `SURF-ADMIN-02` is `critical` in the library, `high` in the code

The scanner is right. This is the bug that once capped google.com,
wikipedia.org and stripe.com at grade D, because a single critical caps a
grade. Set the library entry to `severity: "high"`, `weight: 6`.

**The scanner is the single source of truth for severity, domain and weight.**
Consider removing those three fields from the library entirely and reading
them from the check at render time — one source cannot disagree with itself.
If you keep them, add a test asserting they match.

### Defect 3 — the tier vocabulary is from an abandoned pricing model

The library uses `snapshot` / `report` / `continuous`. Those were the three
tiers of an early prototype. The product uses `snapshot` / `basic` /
`advanced` / `full_protection`.

The field is meaningless as it stands. **Delete it.** Tier comes from the
check's `minTier`, which Task 05a already ported correctly.

### Defect 4 — `effort` is free text and cannot be totalled

30 distinct strings across 65 entries, including
*"4 hours to publish; 60-90 days to reach full enforcement"*. The v6.3 report
code parses these with a regex that takes the first number, so that one becomes
**4 hours** and any roadmap total built from it is confidently wrong.

Replace with two fields:

- `effortHours` — a number, the hands-on work only
- `effortNote` — optional string for anything the number does not capture,
  e.g. *"full DMARC enforcement takes 60–90 days of monitoring"*

Where the source gives a range, take the **upper** bound. Under-promising on
effort is the safer error when a customer is planning work.

---

## What to build

### 1 · `src/data/remediation-library.json` — new file

Port all 65 entries with the four fixes applied. Keep this shape:

```json
{
  "meta": { "version": "1.1", "checkCount": 65, "note": "..." },
  "checks": [
    {
      "id": "SURF-TAKEOVER-01",
      "title": "...",
      "finding": "...",
      "impact": "...",
      "remediation": {
        "summary": "...",
        "steps": ["...", "..."],
        "verification": "..."
      },
      "effortHours": 2,
      "effortNote": null,
      "skill": "...",
      "implemented": true
    }
  ]
}
```

**Seven entries have no matching check** and must be marked
`"implemented": false` with a `notBuiltReason`:

| ID | Reason |
|---|---|
| `SURF-PORT-DB-10` | Port scanning is active reconnaissance. dShield is passive-only and that promise is worth more than the check. |
| `SURF-PORT-RDP-11` | As above. |
| `BREACH-RANSOM-57` | Requires monitoring criminal leak sites. Out of scope by policy. |
| `BREACH-PASTE-56` | Not implemented. |
| `BRAND-PHISH-60` | Not implemented. |
| `BRAND-APP-61` | Not implemented. |
| `BRAND-EXEC-62` | Not implemented. |

Keep them rather than deleting them — the reasons are the record of decisions
that would otherwise be re-litigated, and the first two in particular are a
deliberate product position, not an oversight.

**Do not ship `detect` or `evidenceTemplate`.** Those are build notes for
whoever writes the check, not customer content, and shipping them in a file the
frontend can request would tell an attacker exactly how each check works.

### 2 · `src/utils/remediation.js` — new file

- `getRemediation(checkId)` → the entry, or `null`
- `hasRemediation(checkId)` → boolean
- `summariseEffort(checkIds)` → `{ totalHours, notes[] }` for a roadmap
- Loads the JSON once at module level and freezes it

At load, **assert every implemented library ID matches a check in
`ALL_CHECKS`**, and throw with the offending IDs if not. Defect 1 existed for
months because nothing checked. A startup crash naming the mismatch is a far
better outcome than a report that silently renders half a finding.

### 3 · `src/utils/report_builder.js` — new file

Takes a scan result and a tier, returns the report object for that tier. This
is where the paywall is decided, and it must be decided **here on the server**,
never in the frontend.

| Tier | Contains |
|---|---|
| `snapshot` | Grade, score, counts by severity, the 23-domain coverage map. **No titles, no evidence, no remediation.** |
| `basic` | The above, plus each finding's **title, severity, evidence and `finding` text**. **No `impact`, no remediation.** |
| `advanced` | The above, plus `impact`, full `remediation` with steps and verification, `effortHours`, `skill`, and a prioritised roadmap. |
| `full_protection` | Same as advanced for now. The questionnaire and connectors live in a different application. |

**The roadmap** for advanced: findings grouped into three bands — *"This week"*
(critical), *"This month"* (high), *"This quarter"* (medium and low) — each
with a total from `effortHours` and any `effortNote` collected.

Sort within each band by weight descending, then by `effortHours` ascending, so
the cheapest high-impact work comes first. That ordering is what makes a
roadmap useful rather than merely ordered.

**Inconclusive checks appear in their own section**, listed with their reasons,
never among the findings and never counted as passes. A customer paying for a
report is owed a plain statement of what could not be measured.

### 4 · `scripts/verify-remediation.js` — new file

Assert, with no database and no network:

- 65 entries load, no duplicate IDs
- All 58 check IDs have an implemented entry
- All 7 unimplemented entries carry a `notBuiltReason`
- No entry has `tier`, `detect` or `evidenceTemplate`
- Every `effortHours` is a positive number
- Every entry has non-empty `finding`, `impact`, `remediation.summary`,
  at least two `remediation.steps`, and a `remediation.verification`
- `report_builder` at `snapshot` leaks no titles: serialise the output and
  assert no check title string appears anywhere in it
- `report_builder` at `basic` contains titles but **no** `remediation` key
  anywhere in the serialised output
- `report_builder` at `advanced` contains remediation

Those last three are the paywall tests and they are the point of this file. A
paywall that is not tested is a paywall that leaks.

### 5 · One permitted change to `scan_engine.js`

Nothing else in it changes. If `runScan` does not already return each
finding's `evidence` and `title` on the result object, add that — the report
builder needs them. Free-scan output through the API must be **byte-identical**
to before, because `Scan_server.js` builds the public response itself.

---

## Verification before you finish

```bash
# 1 — the library
node scripts/verify-remediation.js

# 2 — checks still intact
node scripts/verify-checks.js

# 3 — build and boot
npx react-scripts build
node server.js &
curl -s localhost:4008/api/health

# 4 — FREE SCAN UNCHANGED
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"github.com"}'
```

**Then produce all three reports for one domain and read them:**

```bash
node -e "
const { runScan } = require('./src/utils/scan_engine');
const { buildReport } = require('./src/utils/report_builder');
(async () => {
  const scan = await runScan('github.com', { tier: 'advanced' });
  for (const tier of ['snapshot','basic','advanced']) {
    const r = buildReport(scan, tier);
    const s = JSON.stringify(r);
    console.log(tier.padEnd(10),
      'bytes', String(s.length).padStart(6),
      '| findings', (r.findings||[]).length,
      '| has titles', /\"title\"/.test(s),
      '| has remediation', /remediation/.test(s),
      '| roadmap bands', r.roadmap ? r.roadmap.length : 0);
  }
})();
"
```

Expected: snapshot has no titles and no remediation; basic has titles and no
remediation; advanced has both. **If snapshot contains a title, stop** — the
paywall leaks and nothing else in this task matters until it does not.

**Then print one advanced finding in full and read it as a customer would.**
Report whether the remediation steps are genuinely actionable, or whether any
read as filler. Quote one that concerns you if any does.

Also confirm:
- `git diff package.json` is empty
- The word `detect` does not appear as a key in the shipped JSON
- `SURF-ADMIN-02` is `high` everywhere

---

## Report back

1. Files created and edited
2. Output of both verify scripts
3. The three-tier size and content table
4. One advanced finding quoted in full, and your honest view of its quality
5. Any entry whose text did not match what our check actually does — the
   `BREACH-METADATA-55` rename is the likeliest, but check the others
6. Anything wrong or conflicting in these instructions. Tasks 01, 02 and 05a
   each found genuine errors in theirs.

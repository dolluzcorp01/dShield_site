# Claude Code — dShield Site · Task 02
## The selling sections

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 01 merged (commit `5550efd` or later)
**Expected scope:** 2 new frontend files, 3 edits to existing files, 1 backend edit
**Do not touch:** `src/utils/scan_engine.js`, `src/utils/tools_engine.js`,
`src/utils/suppression.js`, `src/backend_routes/Scan_server.js`,
`src/backend_routes/Tools_server.js`, `src/backend_routes/Legal_server.js`

---

## Why this task exists

The site currently sells a scan. **The scan is not the business.**

dShield exists to generate consulting work for Dolluz Corp — audits,
penetration testing, incident response, ISO 27001 and SOC 2 certification.
The free scan is a lead magnet. The one-line version of the strategy is:

> The scan sells the score. The gaps sell the services.

Right now the site does the first half and none of the second. A visitor who
runs a scan, sees a grade, and thinks *"I need help with this"* has nowhere to
go except a generic contact form. There is no page that says what Dolluz
actually does, no list of the frameworks a client will be asked about, and
nothing that makes the eighteen unmeasured domains feel like a real gap rather
than a number.

Every piece of content below already exists, written and approved, in
`01-customer-website-v5.9-FROZEN.jsx` — the frozen customer site in the
dShield v6.3 package. **This task ports that content into the live site.** It
does not invent copy.

---

## Design decisions — follow these, do not substitute

### Port the words, not the styling

The frozen file is a standalone prototype with inline styles, a neon
cyan/lime/magenta palette, `Reveal` scroll animations and a custom `glass`
object. **None of that comes across.**

Use the existing design tokens in `src/index.css` and the existing classes
(`.ds-card`, `.ds-grid`, `.ds-eyebrow`, `.ds-lead`, `.ds-btn`, `.ds-note`).
The live site is near-black and gold and stays that way.

What comes across is the **copy** — headings, body text, the service names and
notes, the framework lists. Those were written carefully and should be used
verbatim unless noted below.

### These are sections on new pages, not a longer homepage

Do not append four sections to `Home.js`. It is already a hero, a five-card
grid and a coverage argument; adding four more makes a page nobody scrolls.

Create **two new pages**:

- `/services` — What we do · Services · Compliance
- `/coverage` — the gap argument: "The part nobody shows you first"

### `/coverage` is the money page

It is the argument for every paid tier, and it must work for someone who has
**not** run a scan. In the frozen file that section only renders after a scan
completes (`phase === "done"`). Here it is a standalone page reachable from
the nav, so it has to stand on its own.

### No new dependencies, no animation library

The frozen file's `Reveal` component is an IntersectionObserver wrapper. Do
not port it and do not add a library. If you want entrance motion, a plain CSS
`@keyframes` fade with `prefers-reduced-motion` respected is acceptable —
but static is fine and preferable to fragile.

---

## What to build

### 1 · `src/Services.js` + `src/Services.css` — new files

Three sections on one page.

**Section A — "What we do"**

Eyebrow: `What we do`
Heading: **We tell you what we can see — and what we cannot**

Body, verbatim from the frozen file:

> Most security reports give you a number and let you assume it covers
> everything. Ours does the opposite. Every report carries a section titled
> *"What this does not tell you"*, because a score you trust is worth more
> than a score you like.

Below it, three stat cards using `.ds-grid--3`. Big figure in gold, a mono
label, a line of supporting text:

| Figure | Label | Supporting line |
|---|---|---|
| `23` | Risk domains | Every report shows all of them, including the eighteen a scan cannot reach. |
| `8` | Checks, free | No account, no card, and no limit on how often you run one. |
| `0` | Guesswork | The scoring formula is published. Recompute any grade by hand. |

**Section B — "Services"**

Eyebrow: `Services`
Heading: **When the report is not enough**

Body, verbatim:

> The platform is the first column. Everything to the right is people — our
> engineers, on your side of the problem.

Then eight cards, in this order, each numbered `01`–`08` in mono:

| # | Name | Note |
|---|---|---|
| 01 | Cyber Resilience Check | Our platform. Start free, above. |
| 02 | Technical Assurance | Independent testing of what you built. |
| 03 | Third-Party Risk Management | Know what your suppliers can reach. |
| 04 | SOC Setup & Monitoring | Someone watching, around the clock. |
| 05 | Incident Response & Forensics | When it has already happened, and the clock is running. |
| 06 | Penetration Testing | We try to break in, so nobody else does first. |
| 07 | Continuous GRC | Governance that stays current between audits. |
| 08 | Standards & Compliance Audits | ISO/IEC 27001, SOC 2, PCI DSS, DPDP. |

Card 01 is the platform: gold border, and its action links to `/` reading
**Start free ↑**. Every other card links to `/contact?topic=<slug>` reading
**Enquire →**.

**Note on card 06.** Penetration Testing is a *service*, delivered by people
under a signed engagement. The free scan is passive and never attempts to
break in. Those two facts must not appear to contradict each other, so add
one line of body text beneath the grid:

> Penetration testing is an engagement, carried out by our team with your
> written authorisation. The automated scan on this site is passive and never
> attempts to gain access.

**Section C — "Compliance"**

Eyebrow: `Compliance`
Heading: **The frameworks your clients will ask you about**

Body, verbatim:

> Certification is rarely the real goal — winning the contract is. We get you
> through the audit and keep you there between them.

Two columns, `.ds-grid--2`:

**Standards**
- ISO 27001:2022 — Information security management.
- ISO 9001:2015 — Quality management.
- ISO 42001:2023 — AI management systems.
- ISO/IEC 20000-1:2018 — IT service management.

**Data & privacy**
- SOC 2 Type 1 & Type 2 — Trust services reporting, point-in-time and over a period.
- GDPR — European data protection.
- DPDP Act 2023 — Indian data protection.
- HIPAA — Healthcare information in the United States.

**Add DPDP Act 2023 to the second column.** It is not in the frozen file's
list, which was written for a global audience. Dolluz is in Chennai and every
Indian client will ask about it before they ask about GDPR.

End the page with a call to action: a `.ds-card` containing *"Not sure which
of these you need?"* and a button to `/contact`.

---

### 2 · `src/Coverage.js` — new file

The gap argument, as a standalone page. Reuse `Services.css` — do not create
a third stylesheet.

Eyebrow: `The part nobody shows you first`
Heading: **Six of the eighteen open in two minutes**

Body, verbatim from the frozen file:

> You give us read-only access to something you already use — the same way you
> add any app. You approve it on Microsoft's screen, not ours. We never see
> your password, and you can cut us off whenever you like.

**Then six cards.** These are the heart of the page: each names a system the
customer already runs and states what connecting it would reveal. The frozen
file's `CONNECT` array is not present in the extract, so use these — each one
is drawn from the connector catalogue and the six connector-only questions in
the main product, and each is true:

| System | Would tell you… |
|---|---|
| Microsoft 365 | which of your administrators can sign in with a password alone |
| Microsoft 365 | whether any mailbox is quietly forwarding mail outside the company |
| Google Workspace | which outside apps your staff have granted access to company data |
| Amazon Web Services | which storage buckets can be read by anyone who finds the address |
| GitHub | which repositories are public that were never meant to be |
| Microsoft 365 | which shared links never expire and need no sign-in to open |

Phrase each card as **"Would tell you {text}."** — that grammar is from the
frozen file and it matters: it is conditional, not a claim about what we have
already found.

**Then the closing panel**, gold-bordered, verbatim:

> **We check twice.** The first time we are guessing from the street. The
> second time, with your systems connected, we are not — and your report stops
> saying *"you told us it's partly done"* and starts saying **"four of your six
> administrators have no second step to log in."**

**Then the honest counterweight.** Add a short section the frozen file does
not have, because this page would otherwise imply connectors close the whole
gap. They do not:

Heading: **And twelve that no system can answer**

> Connecting your systems closes six of the eighteen. The other twelve are
> about process and people — whether your backups actually restore, whether a
> junior would challenge a payment request from the CEO, whether someone would
> admit a mistake early enough to matter. No API can answer those. They are
> what the guided assessment and the consultation sessions are for.

This matters. Overstating what connectors reach would undercut the exact
honesty the whole product is sold on.

End with two buttons: **See the tiers** → `/pricing`, and **Talk to us** →
`/contact`.

---

### 3 · Edits to existing files

**`src/App.js`** — add two routes, keeping the `*` catch-all last:

```
/services  → Services
/coverage  → Coverage
```

**`src/Navbar.js`** — the `LINKS` array currently has four entries. Add
**Services** as the first, so the nav reads:

`Services · How it works · Pricing · Free tools · Trust`

Five plus the Free-scan button is the most that fits before the mobile
breakpoint. Do **not** add Coverage to the top nav — it is reached from the
scan result and from the homepage gap card, which is where someone is actually
thinking about it.

**`src/Pages.js`** — in the footer's primary link row, add Services and
Coverage. Leave the legal row from Task 01 as it is.

**`src/Home.js`** — the existing gap card (the `.gap` block with the large
`5 of 23`) currently ends the page with no action. Add a link at the bottom of
that card reading **See what the other eighteen cover →** pointing to
`/coverage`. One line. Do not restructure the card.

**`src/Result.js`** — in the `nextstep` card at the bottom, add a third
button: **What the other 18 cover** → `/coverage`. Someone who has just seen
their grade is the most likely person in the world to click it.

---

### 4 · `src/backend_routes/Lead_server.js` — one edit

The contact form can now arrive with a service in mind. Accept an optional
`topic` field on `POST /api/leads/enquiry`, cleaned to 60 characters, and
store it in the existing `tier_interest` column.

Do **not** add a new column. `tier_interest` already holds a free-text
interest marker, a service slug is the same kind of thing, and a migration for
one string is not worth the schema drift.

**`src/Pages.js`** — the `Contact` component should read `?topic=` from the
query string and pre-fill the "Interested in" selector when it matches, or
show it as a read-only line when it is a service slug rather than a tier. Use
`useSearchParams` from `react-router-dom`, which is already a dependency.

---

## Verification before you finish

Run these and report the real output. Do not report success without running
them.

```bash
# 1 — frontend compiles
npx react-scripts build

# 2 — server boots
node server.js &
curl -s localhost:4008/api/health

# 3 — new routes serve (production mode, SPA fallback)
NODE_ENV=production node server.js &
curl -s -o /dev/null -w "%{http_code}\n" localhost:4008/services
curl -s -o /dev/null -w "%{http_code}\n" localhost:4008/coverage

# 4 — enquiry accepts a topic
curl -s -X POST localhost:4008/api/leads/enquiry \
     -H "Content-Type: application/json" \
     -d '{"email":"t@example.com","topic":"penetration-testing"}'

# 5 — THE SCAN IS UNCHANGED
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"dolluzcorp.com"}'
```

**Step 5 is the one that matters.** The expected result is grade **A**, score
**90**, counts `critical 0 / high 1 / medium 0 / low 0`. If any of those differ,
stop and say so rather than proceeding — certificates and DNS do change over
time, so if you believe the difference is legitimate, say which check moved and
why you think so. Do not assume it.

Delete the test enquiry row from step 4 when you are done.

Also confirm by inspection:

- `git diff --stat` touches only the files listed in this document
- `git diff package.json` is empty — no new dependency
- No file under `src/utils/` appears in the diff
- The words "penetration testing" appear on `/services` **and** the
  clarifying line about the scan being passive appears with them

---

## Report back

1. Which files you created and which you edited
2. The real output of every verification step
3. Any copy you had to write yourself rather than port, and why
4. Anything in these instructions that was wrong, impossible, or conflicted
   with the repository — say so plainly rather than working around it. Task 01
   found a genuine error in its own instructions and was right to say so.

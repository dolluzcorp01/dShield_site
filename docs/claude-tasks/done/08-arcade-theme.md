# Claude Code — dShield Site · Task 08
## The arcade theme

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 07 merged (`765395a`)
**Source of the design:** the v6.3 package,
`CURRENT/frontend/01-customer-website-v5.9-FROZEN.jsx`

**Do not touch, under any circumstances:**
`src/utils/checks/*` · `src/utils/scan_engine.js` · `src/utils/tools_engine.js`
`src/utils/suppression.js` · `src/utils/report_builder.js`
`src/utils/remediation.js` · `src/data/*` · every file in
`src/backend_routes/` · `src/workers/*` · `db/*`

**This task changes appearance only.** Not one line of behaviour, scoring,
pricing, paywall or email. If you find yourself editing a route or a check,
stop — you have gone outside the task.

---

## Why this task exists

The site currently uses near-black and gold. Shoban has reviewed the frozen
v5.9 design and confirmed **the arcade theme is the direction for all dShield
applications** — this site, the customer portal, the employee portal and the
console.

In Task 02 I instructed that only the *copy* be ported from the frozen file and
the styling left alone. That decision is now reversed. The styling is the
thing to port.

---

## The design system

Taken from the frozen file, which is the reference. Read it before starting.

### Palette

```
void      #0B0316    page background, deep purple-black
void2     #16072A    raised surface
panel     rgba(255,255,255,0.045)
edge      rgba(198,255,61,0.22)    hairline, lime at low opacity

lime      #C6FF3D    primary accent, calls to action
magenta   #FF2E9A    secondary accent, "most chosen", critical
cyan      #00E5FF    tertiary, links and highlights
amber     #FFB020    warnings

text      #F4F0FF    headings
body      #B9AEDC    body copy
faint     #6E6193    metadata
```

Note this is **purple-black, not neutral black** — `#0B0316` has a violet cast
and the whole palette depends on it. A neutral `#0A0A0A` kills the effect.

### Typography

```
display   'Orbitron'          headings, the wordmark, numbers
body      'Chakra Petch'      body copy, UI
mono      'JetBrains Mono'    metadata, tickers, check IDs
```

All three are on Google Fonts. Load them in `public/index.html` with the
existing `<link>` pattern, replacing Inter and IBM Plex Mono.

**Orbitron has no lowercase to speak of** — it is a display face. Use it for
headings and short labels only. A paragraph set in Orbitron is unreadable, and
the frozen file never does it.

### Severity mapping

The existing severity colours must map onto the new palette, keeping the same
meaning:

| Severity | New colour |
|---|---|
| critical | `#FF2E9A` magenta |
| high | `#FFB020` amber |
| medium | `#00E5FF` cyan |
| low | `#6E6193` faint |
| pass | `#C6FF3D` lime |

---

## What to port, and what to leave

The frozen file is a 1,954-line prototype with a great deal in it. Port the
design language, not every flourish.

### Port these

**1 · The colour and type system**, as CSS variables in `src/index.css`.
Everything else follows from this. Do this first and check the site before
going further — a large part of the change lands from this alone.

**2 · The top ticker.** A thin scrolling marquee above the header:
`58 CHECKS · NO SIGN-UP · NO CARD · 23 RISK AREAS · 5 VISIBLE FROM OUTSIDE`.
The `marq` keyframe in the frozen file. Pause it on hover, and honour
`prefers-reduced-motion` by stopping it entirely.

**3 · Chunky bordered cards.** 2px borders in `edge`, larger radius, a lime
glow on hover. This is most of the arcade feel.

**4 · The pricing bars** — the strongest idea in the design. Every tier shows
the same 23-segment bar with a different number filled:

| Tier | Filled |
|---|---|
| Free | 5 |
| Basic | 5 |
| Advanced | 8 |
| Full Protection | 21 |
| FP + Extended Support | 21 |

Seeing five identical bars with different fills makes the tier difference
obvious in a way a feature list never does. **Check these numbers against
`src/data/plans.js` and use what is there** — if the data disagrees with this
table, the data wins and you should say so in your report.

**5 · Scanlines and glow.** A subtle CRT scanline overlay on dark sections, and
a soft lime glow on primary buttons. Keep it restrained — this reads as
premium at 8% opacity and as a novelty at 30%.

### Do not port these

**Bolt, the robot mascot.** He is 200 lines of SVG with eye-tracking, four
moods and a typed script. He would need his own task, and he is a bigger
commitment than a repaint — a mascot is a brand decision, not a theme.

Leave a comment in `Home.js` noting where he would sit if Shoban wants him
later.

**The chromatic glitch on the headline.** It looks broken on some displays and
it fights with legibility on the most important sentence on the site.

**The `Reveal` scroll-animation wrapper.** Adds an IntersectionObserver to
every section for a fade. Not worth the complexity. Static is fine.

---

## What to build

### 1 · `src/index.css` — the system

Replace the variable block. **Keep every existing variable name.** `--gold`
becomes `#C6FF3D`, `--ink` becomes `#0B0316`, and so on. Every component
already references these names, so the whole site moves at once and nothing
needs a search-and-replace.

Add the new names alongside: `--magenta`, `--cyan`, `--amber`, `--void2`.

Update the base classes: `.ds-btn`, `.ds-card`, `.ds-input`, `.ds-pill`,
`.ds-note`, `.ds-eyebrow`. Buttons get the lime glow; cards get the 2px border
and the hover lift.

### 2 · `public/index.html`

Swap the font links for Orbitron, Chakra Petch and JetBrains Mono. Update
`theme-color` to `#0B0316`.

Regenerate `og-image.png` in the new palette — the current one is gold on black
and would be the only place the old theme survives, which is exactly where it
would be noticed.

### 3 · Per-page work

Most pages inherit from the variables. These need real attention:

**`Navbar.js`** — the ticker above the header, Orbitron wordmark. Keep every
existing link and the mobile burger behaviour exactly as it is.

**`Home.js`** — the hero headline in Orbitron, the scan box with a lime glow,
the five promise cards in the arcade style.

**`Result.js`** — the grade card, the counts row and the 23-domain coverage map
are the most-seen screens on the site. The coverage grid in particular should
use the lime border for measured and stay dimmed for the rest, as it does now.

**`Pricing.js`** — the 23-segment bars, "Most chosen" in magenta.

**`Report.js`** — the paid report. **Print styles must stay readable**: white
background, dark text. A customer printing a neon-on-black report gets an
unreadable page and a large ink bill.

**`Legal.js` and `Pages.js`** — mostly inherited. Check that long-form text is
still comfortable to read; `#B9AEDC` on `#0B0316` is lower contrast than the
current combination.

### 4 · The PDF is separate — decide and say which

`src/utils/pdf-template.js` renders a document people print and file.

**Recommendation: leave the PDF on the light theme.** A 15-page report on a
near-black background is unprintable and looks wrong in a board pack. Adopt the
new *accent* colours for severity pills and headings on a white page.

If you disagree, say so and explain — do not silently convert it.

---

## Accessibility — check this, do not assume

Lime `#C6FF3D` on void `#0B0316` is a very high contrast ratio and passes
easily. Two combinations are the risk:

- **Lime text on lime-tinted surfaces** — check any button or badge
- **`faint` `#6E6193` on `void`** — measure it. If it is below 4.5:1 for body
  text, lighten it rather than shipping it. It is used for metadata across the
  whole site.

Report the measured ratios for `body`, `faint` and `lime` on `void`. If
anything fails, fix it and say what you changed.

---

## Verification

```bash
# 1 — build
npx react-scripts build

# 2 — boot
node server.js &
curl -s localhost:4008/api/health

# 3 — NOTHING FUNCTIONAL CHANGED
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"github.com"}'

# 4 — both verify scripts
node scripts/verify-checks.js
node scripts/verify-remediation.js
```

Step 3 must be identical to before this task — same grade, same counts, same
keys. A theme change that alters a scan result means something outside the
theme was touched.

**Then look at every page**, headless if you must, and confirm:

- `/` `/tools` `/tools/ssl` `/pricing` `/services` `/coverage`
  `/how-it-works` `/trust` `/legal` `/legal/privacy` `/contact` `/checkout`
- A scan result page
- A report page, and **its print preview**

Report which pages you actually viewed and which you did not.

**Confirm by inspection:**
- `git diff --stat` touches only `.css` files, `index.html`, `og-image.png`
  and the JSX of the pages listed above
- No file under `src/backend_routes/`, `src/utils/checks/`, `src/data/` or
  `db/` appears in the diff
- `git diff package.json` is empty
- The severity colours still map to the same severities — a critical finding
  must not become the same colour as a pass

---

## Report back

1. Files edited
2. The measured contrast ratios, and anything you changed to pass
3. Which pages you viewed, honestly
4. Whether you kept the PDF light, and why
5. Anything that looks wrong in the new theme that the old one hid — long text
   blocks and dense tables are the likeliest
6. Anything wrong or conflicting in these instructions. Tasks 01, 02, 05a, 05c
   and 07 each found genuine errors in theirs.

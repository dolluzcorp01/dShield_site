# Claude Code — dShield Site · Task 09
## Bolt — the guide

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 08 merged (the arcade theme)
**Source:** the v6.3 package,
`CURRENT/frontend/01-customer-website-v5.9-FROZEN.jsx`, lines 372–489

**Do not touch:** `src/utils/checks/*` · `src/utils/scan_engine.js` ·
`src/utils/tools_engine.js` · `src/utils/suppression.js` ·
`src/utils/report_builder.js` · `src/utils/remediation.js` · `src/data/*` ·
everything in `src/backend_routes/` · `src/workers/*` · `db/*`

**Appearance only.** No scan, scoring, pricing, paywall or email behaviour
changes. If you are editing a route or a check, stop.

---

## Why this task exists

Task 08 ported the arcade theme but deliberately left Bolt out, on the grounds
that a mascot is a brand decision rather than a repaint. Shoban has seen the
result and wants him.

He is worth having, and for a reason worth stating so it survives future edits:

> Every line he says is doing a job — telling you what to do next. He is
> navigation wearing a costume, not decoration.

That is the design note in the frozen file, and it is the test for any change
to him later. A mascot that says *"Hi, I'm Bolt!"* has failed. One that says
*"← PSST. DROP YOUR SITE IN HERE"* is a signpost.

---

## What Bolt is

An inline SVG, 200×230, with **four moods** driven entirely by the state the
hero already has. He is stateless — he takes props and renders.

| Mood | When | He says | He does |
|---|---|---|---|
| `greet` | idle, box empty | `← PSST. DROP YOUR SITE IN HERE` | floats, left arm out toward the box, right arm idles |
| `typing` | box has text | `← OOH. KEEP GOING…` | leans in, eyes widen, arm level |
| `scanning` | scan running | `SCANNING… n/4 AREAS IN` | shakes, visor becomes a radar sweep, both arms up, mouth chatters |
| `done` | result ready | `DONE! NOW LOOK DOWN ↓` | arm swings down pointing below the fold, mouth turns magenta |

Two behaviours make him feel alive and both are cheap:

**His pupils follow the cursor.** A `look` prop of `{x, y}` in the range −1..1,
translating the eye group by up to 3.4px horizontally and 2.4px vertically.

**His lines are typed, not printed.** A small `Type` component reveals one
character every 26ms with a blinking magenta caret. That is what makes a line
read as spoken.

### Where the arm points, and why it matters

The frozen file carries this note, and it is the kind of detail that is
invisible when right and ridiculous when wrong:

> Bolt stands to the RIGHT of the input box, so his LEFT arm is the one that
> points at it. Pointing with the right arm aimed him at the WhatsApp button on
> the far edge of the screen — the opposite of the instruction he is giving.

Arm angles, for the **left** arm: greet `−18°`, typing `−6°`, scanning `42°`,
done `−74°`.

**If you place Bolt to the left of the box on any layout, mirror the arm.** A
mascot confidently pointing away from the thing he is telling you to use is
worse than no mascot.

---

## What to build

### 1 · `src/Bolt.js` — new file

Port the SVG from the frozen file, lines 372–489. Two components:

- `Bolt({ mood, look })` — the robot
- `Type({ text, speed })` — the typewriter

**Adapt the palette to CSS variables.** The source uses a local `A` object.
This repo has variables in `index.css` after Task 08. Read them with
`getComputedStyle` once, or accept them as props — do not hardcode a second
copy of the palette. Two palettes drift.

The gradient IDs in the SVG (`bodyG`, `visorG`, `glow`) are global to the
document. If Bolt is ever rendered twice on one page they collide. **Prefix
them uniquely** — a `useId()` suffix — even though today he appears once.

### 2 · `src/Bolt.css` — new file

The eleven keyframes he needs: `boltFloat`, `boltShake`, `blink`, `armIdle`,
`corePulse`, `blip`, `spark`, `thrust`, `sweep`, `chatter`, `caret`.

They are all in the frozen file. Port them as written.

**Wrap every one in a `prefers-reduced-motion` guard.** Bolt floats, shakes,
sparks and pulses continuously. For someone with vestibular sensitivity that is
not a charming detail, it is a reason to leave the page. Under reduced motion
he should render still, in his correct pose, with his line shown complete
rather than typed.

### 3 · `src/Home.js` — place him

Task 08 left a comment marking where he goes. Two-column hero: copy and scan
box on the left, Bolt on the right, with a speech bubble above him and
`BOLT · YOUR GUIDE` beneath in mono.

**Mood comes from state the component already has** — whether the input has
text, whether a scan is running, whether a result arrived. Do not add new
state for Bolt beyond the pointer position.

**Pointer tracking:** one `mousemove` listener on the hero section, not the
window, throttled with `requestAnimationFrame`. Convert to −1..1 relative to
Bolt's centre. Remove the listener on unmount.

**The scanning line says `n/4 AREAS IN`, not `n/5`.** The frozen prototype was
written when the free scan covered five domains. It covers **four** —
External Attack Surface, Encryption & Certificates, Email & Domain Security,
Brand & Digital Risk. Verify this against `src/utils/checks/index.js` before
writing the number, and use what the code says.

A mascot that miscounts the product is worse than no mascot.

### 4 · Mobile

Below 860px, **hide Bolt entirely** — `display: none`, not a scaled-down
version. He is 200×230 plus a speech bubble; on a phone he pushes the scan box
below the fold, and the scan box is the entire purpose of the page.

Most Indian SMB visitors will arrive on a phone. Losing the mascot there costs
nothing; losing the scan box costs everything.

---

## What not to do

**Do not put him on any other page.** Home only. He is a guide to the scan box;
on `/pricing` or `/legal` he is a cartoon in the way.

**Do not give him sound.**

**Do not let him overlap the scan box or the WhatsApp button** at any viewport
width between 860px and 2560px. Check the boundaries, not just your own
screen.

**Do not add a dependency.** No animation library, no Lottie. This is SVG and
CSS.

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

**Then look at him in a browser**, and report honestly whether you did.

Check each mood by driving the state:

| Mood | How to reach it | Confirm |
|---|---|---|
| greet | load the page | floating, arm out **toward the box on his left** |
| typing | type into the box | eyes taller, arm level |
| scanning | run a scan | shaking, radar sweep in the visor, arms up |
| done | wait for the result | arm pointing **down**, mouth magenta |

Then:

- Move the cursor around the hero — **do the pupils follow?**
- Does each line type out character by character with a caret?
- At 1280px, 1024px and 900px, does he overlap anything?
- At 800px and below, is he gone entirely and is the scan box at the top?
- With `prefers-reduced-motion: reduce` set in devtools, is he still, and is
  his line shown complete?

**Confirm by inspection:**
- `git diff --stat` touches only `src/Bolt.js`, `src/Bolt.css`, `src/Home.js`,
  `src/Home.css`
- `git diff package.json` is empty
- No file under `src/backend_routes/`, `src/utils/checks/`, `src/data/` or
  `db/` appears in the diff
- The scanning line matches the real free-tier domain count

---

## Report back

1. Files created and edited
2. Whether you actually viewed him, and how each mood looked
3. The free-tier domain count you found in the code, and what you put in his line
4. What happens at 900px and at 800px
5. Whether reduced-motion works
6. Anything wrong or conflicting in these instructions. Tasks 01, 02, 05a, 05c
   and 07 each found genuine errors in theirs.

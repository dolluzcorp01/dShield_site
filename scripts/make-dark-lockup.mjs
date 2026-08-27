/* ─────────────────────────────────────────────────────────────────────────
   Recolour the Dolluz Corp lockup for a dark ground.

   src/assets/img/DOLLUZ_CORP.png is the artwork as supplied: a gold eagle
   beside a wordmark set in BLACK. Our page background is #0B0316, so the
   wordmark is invisible on it — the eagle floats next to nothing.

   This does two things to it.

   ONE — recolour, exactly as the frozen v5.9 prototype did to produce its
   LOCKUP_SRC constant: near-black pixels become bone, every gold pixel is
   left as supplied. Alpha is preserved untouched, so the antialiased glyph
   edges stay antialiased rather than turning into a ragged bone stencil.

   TWO — drop the vertical rule between the bird and the wordmark. It is a
   separator drawn for a light ground, and against #0B0316 it reads as a
   seam down the middle of the mark rather than as part of it. The frozen
   prototype's lockup has no such rule.

   The rule is FOUND, not hardcoded to an x offset. Columns are grouped into
   runs of ink separated by empty columns; the rule is the narrow, tall one
   that is not the first group. A hardcoded coordinate would silently cut a
   slice out of the bird the first time the artwork is resupplied at a
   different size.

   Erasing it alone leaves a hole: the bird and the wordmark were spaced
   around the rule, so deleting it strands them either side of a gap roughly
   two and a half times what either of them was drawn with. So the wordmark
   is then slid to land on a chosen gap, and the canvas trimmed by whatever
   it moved.

   That gap is GAP_RATIO below, and it is the one number here anybody is
   likely to want to change. It is expressed as a fraction of the image
   HEIGHT rather than as a pixel count, so it survives the artwork being
   resupplied at a different resolution — 0.30 means the same optical gap at
   994px tall and at 4000px tall, where a hardcoded 298 would not.

   A pixel is "the black type" only if it is BOTH dark and near-grey.
   Testing darkness alone would catch the bronze at the bottom of the
   eagle's gradient, which is dark but strongly chromatic — recolouring it
   would put a bone smear through the middle of the bird.

   Run: node scripts/make-dark-lockup.mjs
   Output: src/assets/img/DOLLUZ_CORP_dark.png

   Committed output, re-runnable script. Re-run it if the artwork is ever
   resupplied.
   ───────────────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src", "assets", "img", "DOLLUZ_CORP.png");
const OUT = path.join(HERE, "..", "src", "assets", "img", "DOLLUZ_CORP_dark.png");

const BONE = [0xF4, 0xF0, 0xFF];   // --bone, the site's primary text colour
const MAX_LEVEL = 120;             // "dark"
const MAX_SPREAD = 34;             // "near-grey"

/* THE GAP BETWEEN THE BIRD AND THE WORDMARK, as a fraction of image height.

   Turn this up for more air, down for less, then re-run the script. Nothing
   else needs touching; the canvas is trimmed to suit and Pages.js sizes the
   image by width, so the footer picks up the new proportions on its own.

   Reference points, at the supplied 994px height:
       0.13  the tighter of the two spaces the rule originally sat in
       0.30  a little wider than the bird-rule-wordmark span was in total
   The artwork ships with a rule between the two, so there is no "original"
   gap to be faithful to — the rule was doing the separating. */
const GAP_RATIO = 0.30;

/* What counts as the separator rule rather than as artwork: no wider than
   1.5% of the image and at least 35% of its height. The rule in the supplied
   file is ~6px of 3945 and ~430px of 994; the bird is ~530px wide and the
   narrowest letter in the wordmark is far shorter than a third of the
   canvas, so neither comes close to matching. */
const RULE_MAX_W = 0.015;
const RULE_MIN_H = 0.35;

const dataUrl = "data:image/png;base64," + fs.readFileSync(SRC).toString("base64");

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

const result = await page.evaluate(async (url, bone, maxLevel, maxSpread, ruleMaxW, ruleMinH, gapRatio) => {
    const img = new Image();
    img.src = url;
    await img.decode();

    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    let touched = 0, opaque = 0;

    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;          // fully transparent — leave it
        opaque++;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max <= maxLevel && max - min <= maxSpread) {
            d[i] = bone[0]; d[i + 1] = bone[1]; d[i + 2] = bone[2];
            touched++;
        }
    }

    /* ── find and erase the separator rule ───────────────────────────── */

    const W = c.width, H = c.height;
    const inked = new Array(W);
    for (let x = 0; x < W; x++) {
        let n = 0;
        for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 8) n++;
        inked[x] = n;
    }

    // Contiguous runs of columns that carry ink, split on empty columns.
    const groups = [];
    let start = -1;
    for (let x = 0; x <= W; x++) {
        const on = x < W && inked[x] > 0;
        if (on && start < 0) start = x;
        if (!on && start >= 0) { groups.push([start, x - 1]); start = -1; }
    }

    let ruleAt = null;
    for (let gi = 0; gi < groups.length; gi++) {
        const [a, b] = groups[gi];
        const width = b - a + 1;
        let tallest = 0;
        for (let x = a; x <= b; x++) tallest = Math.max(tallest, inked[x]);
        // Not the first group: that is the bird, and on a narrow crop it
        // could in principle be slim enough to trip the width test.
        if (gi > 0 && width <= W * ruleMaxW && tallest >= H * ruleMinH) {
            ruleAt = { a, b, width, tallest };
            break;
        }
    }

    let cleared = 0;
    let closed = null;

    if (ruleAt) {
        for (let x = ruleAt.a; x <= ruleAt.b; x++) {
            for (let y = 0; y < H; y++) {
                const i = (y * W + x) * 4;
                if (d[i + 3] !== 0) { d[i + 3] = 0; cleared++; }
            }
        }
    }

    ctx.putImageData(id, 0, 0);

    /* ── close the hole the rule left behind ─────────────────────────── */

    if (ruleAt) {
        const gi = groups.findIndex((g) => g[0] === ruleAt.a);
        const before = groups[gi - 1];          // the bird
        const after  = groups[gi + 1];          // first glyph of the wordmark

        if (before && after) {
            const gapLeft  = ruleAt.a - before[1] - 1;
            const gapRight = after[0] - ruleAt.b - 1;
            const want  = Math.round(H * gapRatio);
            const shift = (gapLeft + (ruleAt.b - ruleAt.a + 1) + gapRight) - want;

            /* Works in both directions. A positive shift tightens the gap and
               trims the canvas; a negative one opens it up and grows the
               canvas by the same amount. Getting that second case wrong is
               how you end up with a wordmark clipped at the right edge, so
               the width is derived from the shift rather than assumed. */
            if (shift !== 0) {
                const out = document.createElement("canvas");
                out.width = W - shift;
                out.height = H;
                const octx = out.getContext("2d");
                // everything up to and including the bird, unmoved
                octx.drawImage(c, 0, 0, before[1] + 1, H, 0, 0, before[1] + 1, H);
                // everything from the wordmark on, slid by -shift
                octx.drawImage(c, after[0], 0, W - after[0], H,
                                  after[0] - shift, 0, W - after[0], H);
                closed = { gapLeft, gapRight, want, shift, w: out.width };
                return { png: out.toDataURL("image/png"), touched, opaque,
                         w: out.width, h: H, ruleAt, cleared,
                         groups: groups.length, closed };
            }
        }
    }

    return { png: c.toDataURL("image/png"), touched, opaque, w: W, h: H,
             ruleAt, cleared, groups: groups.length, closed };
}, dataUrl, BONE, MAX_LEVEL, MAX_SPREAD, RULE_MAX_W, RULE_MIN_H, GAP_RATIO);

await browser.close();

fs.writeFileSync(OUT, Buffer.from(result.png.split(",")[1], "base64"));

const pct = ((result.touched / result.opaque) * 100).toFixed(1);
console.log(`✅ ${path.basename(OUT)}  ${result.w}×${result.h}`);
console.log(`   recoloured ${result.touched.toLocaleString()} of ${result.opaque.toLocaleString()} opaque pixels (${pct}%)`);
console.log(`   ink groups found: ${result.groups}`);

/* Loud, not silent. If the artwork is resupplied without a rule this prints
   a warning instead of quietly shipping one; if it is resupplied WITH one
   and the detector misses it, the same warning says so. */
if (result.ruleAt) {
    const r = result.ruleAt;
    console.log(`   removed separator rule at x=${r.a}–${r.b} (${r.width}px wide, ${r.tallest}px tall), ${result.cleared.toLocaleString()} px cleared`);
} else {
    console.warn("   ⚠️  no separator rule matched — check the output before shipping it");
}

if (result.closed) {
    const g = result.closed;
    const dir = g.shift > 0 ? `${g.shift}px left` : `${-g.shift}px right`;
    console.log(`   gap was ${g.gapLeft}px | rule | ${g.gapRight}px  →  ${g.want}px (moved wordmark ${dir}, canvas now ${g.w}px)`);
}

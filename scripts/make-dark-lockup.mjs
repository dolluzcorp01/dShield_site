/* ─────────────────────────────────────────────────────────────────────────
   Recolour the Dolluz Corp lockup for a dark ground.

   src/assets/img/DOLLUZ_CORP.png is the artwork as supplied: a gold eagle
   beside a wordmark set in BLACK. Our page background is #0B0316, so the
   wordmark is invisible on it — the eagle floats next to nothing.

   This does exactly what the frozen v5.9 prototype did to produce its
   LOCKUP_SRC constant: recolour the near-black pixels to bone and leave
   every gold pixel exactly as supplied. Alpha is preserved untouched, so
   the antialiased glyph edges stay antialiased rather than turning into a
   ragged bone stencil.

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

const dataUrl = "data:image/png;base64," + fs.readFileSync(SRC).toString("base64");

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

const result = await page.evaluate(async (url, bone, maxLevel, maxSpread) => {
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

    ctx.putImageData(id, 0, 0);
    return { png: c.toDataURL("image/png"), touched, opaque, w: c.width, h: c.height };
}, dataUrl, BONE, MAX_LEVEL, MAX_SPREAD);

await browser.close();

fs.writeFileSync(OUT, Buffer.from(result.png.split(",")[1], "base64"));

const pct = ((result.touched / result.opaque) * 100).toFixed(1);
console.log(`✅ ${path.basename(OUT)}  ${result.w}×${result.h}`);
console.log(`   recoloured ${result.touched.toLocaleString()} of ${result.opaque.toLocaleString()} opaque pixels (${pct}%)`);

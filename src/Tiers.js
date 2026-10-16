import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "./Motion";
import { TIERS, DOMAINS } from "./data/site-content";
import "./Tiers.css";

/* ─────────────────────────────────────────────────────────────────────────
   TIERS - the plan cards, from the prototype's section of the same name
   (line 1429 of 01-customer-website-v5.9-FROZEN.jsx).

   The device that makes this table work is the bar: twenty-three segments,
   one per risk area, filled up to what that tier covers. Five prices in a
   row tell you nothing about what separates them; five bars of 5, 5, 8, 21
   and 21 segments tell you immediately, and they are all measuring the same
   thing - which is why the heading is "Every bar is the same 23 areas".

   Hover or focus reveals what a tier includes; clicking pins it open, so a
   touch device - which has no hover - reaches the same list.

   THE SEGMENT COUNT IS NOT A LITERAL 23. It is DOMAINS.length, so a bar can
   never disagree with the grid above it. verify-site-content.mjs already
   asserts that the free tier's `covers` equals the number of areas a free
   scan actually reaches.
   ───────────────────────────────────────────────────────────────────────── */

function Tiers() {
    const [pinned, setPinned] = useState(null);
    const [hovered, setHovered] = useState(null);

    return (
        <section id="plans" className="ds-section ds-wrap tiers">
            <Reveal>
                <p className="ds-eyebrow">Choose how much you want to see</p>
                <h2 className="ds-shout tiers__h2">Every bar is the same 23 areas</h2>
            </Reveal>

            <div className="tiers__grid">
                {TIERS.map((t, i) => {
                    const isPinned = pinned === t.key;
                    const open = isPinned || hovered === t.key;

                    return (
                        <Reveal key={t.key} delay={i * 65}>
                            <button
                                type="button"
                                className={`tier${t.star ? " tier--star" : ""}${open ? " tier--open" : ""}`}
                                aria-expanded={open}
                                onClick={() => setPinned(isPinned ? null : t.key)}
                                onMouseEnter={() => setHovered(t.key)}
                                onMouseLeave={() => setHovered((h) => (h === t.key ? null : h))}
                                onFocus={() => setHovered(t.key)}
                                onBlur={() => setHovered((h) => (h === t.key ? null : h))}
                            >
                                {t.star && <span className="tier__star">MOST CHOSEN</span>}

                                <span className="tier__name">{t.name}</span>
                                <span className="tier__price">{t.price}</span>

                                {/* One segment per risk area. aria-hidden because
                                    the figure underneath already says "5/23
                                    areas" - twenty-three empty spans would be
                                    read out as noise. */}
                                <span className="tier__bar" aria-hidden="true">
                                    {DOMAINS.map((d, k) => (
                                        <span key={d.n} className={k < t.covers ? "is-on" : ""} />
                                    ))}
                                </span>

                                <span className="tier__covers">
                                    {t.covers}/{DOMAINS.length} AREAS
                                </span>

                                <span className="tier__line">{t.line}</span>

                                <span className={`tier__gets${open ? " is-open" : ""}`}>
                                    <span className="tier__gets-inner">
                                        {(t.gets || []).map((g) => (
                                            <span className="tier__get" key={g}>
                                                <span className="tier__tick" aria-hidden="true">▸</span>
                                                {g}
                                            </span>
                                        ))}
                                    </span>
                                </span>

                                {!open && (
                                    <span className="tier__hint">HOVER FOR WHAT IS INCLUDED</span>
                                )}
                            </button>
                        </Reveal>
                    );
                })}
            </div>

            {/* The way out of this section.

                The prototype's tier cards are inert - it has no pricing page
                to send anybody to. We do, and until now nothing in this
                section pointed at it: the cards expand to show what a tier
                includes and then stop.

                That was survivable while the result page carried a "Get the
                full report" button. It no longer does, so without this line
                the only route from a finished scan to /pricing is the footer,
                and /pricing is where the live on-sale state and the notify-me
                form actually live. */}
            <Link className="ds-btn ds-btn--ghost tiers__more" to="/pricing">
                Full pricing, and what is on sale today →
            </Link>
        </section>
    );
}

export default Tiers;

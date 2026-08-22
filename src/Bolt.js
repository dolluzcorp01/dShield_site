import React, { useEffect, useId, useState } from "react";
import "./Bolt.css";

/* ─────────────────────────────────────────────────────────────────────────
   Bolt — the guide.

   Ported from the frozen v5.9 prototype. The design note there is the test
   for any future change to him, so it is repeated here:

     Every line he says is doing a job — telling you what to do next. He is
     navigation wearing a costume, not decoration.

   A mascot that says "Hi, I'm Bolt!" has failed. One that says
   "← PSST. DROP YOUR SITE IN HERE" is a signpost.

   He is stateless. Mood and pointer position come in as props; he owns
   nothing. Colours come from the CSS variables in index.css via Bolt.css —
   there is deliberately no palette object in this file.
   ───────────────────────────────────────────────────────────────────────── */

/** True when the visitor has asked their system to stop moving things. */
function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(() =>
        typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const on = (e) => setReduced(e.matches);
        mq.addEventListener("change", on);
        return () => mq.removeEventListener("change", on);
    }, []);

    return reduced;
}

/* ─────────────────────────────────────────────────────────────────────────
   Type — the typewriter.

   His lines are typed rather than printed because that is what makes a line
   read as spoken. Under reduced motion the whole line is shown at once: the
   point is the sentence, not the animation.
   ───────────────────────────────────────────────────────────────────────── */
export function Type({ text, speed = 26 }) {
    const reduced = usePrefersReducedMotion();
    const [n, setN] = useState(0);

    useEffect(() => { setN(0); }, [text]);

    useEffect(() => {
        if (reduced || n >= text.length) return;
        const t = setTimeout(() => setN((v) => v + 1), speed);
        return () => clearTimeout(t);
    }, [n, text, speed, reduced]);

    if (reduced) return <>{text}</>;

    return (
        <>
            {text.slice(0, n)}
            <span className="boltbox__caret">█</span>
        </>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
   Bolt himself.

   BOLT STANDS TO THE RIGHT OF THE INPUT BOX, SO HIS LEFT ARM IS THE ONE
   THAT POINTS AT IT. In the prototype, pointing with the right arm aimed
   him at a button on the far edge of the screen — the exact opposite of the
   instruction he was giving.

   If he is ever moved to the left of the box on some other layout, mirror
   the arm. A mascot confidently pointing away from the thing he is telling
   you to use is worse than no mascot.
   ───────────────────────────────────────────────────────────────────────── */
function Bolt({ mood = "greet", look = { x: 0, y: 0 } }) {
    // Gradient and filter ids are global to the document. If Bolt is ever
    // rendered twice on one page, unprefixed ids collide and the second
    // instance silently steals the first one's fills.
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const bodyG = `boltBody-${uid}`;
    const visorG = `boltVisor-${uid}`;
    const glow = `boltGlow-${uid}`;

    // Pupils follow the pointer, clamped so they stay inside the eye.
    const px = Math.max(-3.4, Math.min(3.4, (look?.x ?? 0) * 3.4));
    const py = Math.max(-2.4, Math.min(2.4, (look?.y ?? 0) * 2.4));

    /* Angles are for the LEFT arm, which extends leftward from its shoulder:
         greet     slightly down-left, toward the box
         typing    level, holding the gesture
         scanning  both arms thrown up
         done      swung down, pointing below the fold */
    const armAngle = mood === "done" ? -74
        : mood === "scanning" ? 42
            : mood === "typing" ? -6
                : -18;

    return (
        <svg
            className={`bolt bolt--${mood}`}
            width="200" height="230" viewBox="0 0 200 230"
            aria-hidden="true" focusable="false"
        >
            <defs>
                <linearGradient id={bodyG} x1="0" y1="0" x2="0" y2="1">
                    <stop className="bolt__shell-a" offset="0%" />
                    <stop className="bolt__shell-b" offset="100%" />
                </linearGradient>
                <linearGradient id={visorG} x1="0" y1="0" x2="1" y2="1">
                    <stop className="bolt__visor-a" offset="0%" />
                    <stop className="bolt__visor-b" offset="100%" />
                </linearGradient>
                <filter id={glow}>
                    <feGaussianBlur stdDeviation="3.2" result="b" />
                    <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* thruster */}
            <ellipse className="bolt__cyan bolt__thrust" cx="100" cy="206" rx="30" ry="6" opacity=".2" />
            {[0, 1, 2].map((i) => (
                <circle
                    key={i}
                    className="bolt__cyan bolt__spark"
                    cx={88 + i * 12} cy="198" r="2.4" opacity=".7"
                    style={{ animationDelay: `${i * 0.28}s` }}
                />
            ))}

            {/* antenna */}
            <line x1="100" y1="34" x2="100" y2="18"
                  className="bolt__stroke-lime" strokeWidth="2.6" strokeLinecap="round" />
            <circle className="bolt__magenta bolt__blip" cx="100" cy="13" r="6" filter={`url(#${glow})`} />

            {/* body */}
            <rect x="62" y="122" width="76" height="70" rx="18"
                  fill={`url(#${bodyG})`} className="bolt__stroke-lime" strokeWidth="2.2" />
            <circle cx="100" cy="152" r="13" fill="none"
                    className="bolt__stroke-cyan" strokeWidth="2" opacity=".8" />
            <circle className="bolt__cyan bolt__core" cx="100" cy="152" r="6.5" filter={`url(#${glow})`} />
            <rect className="bolt__magenta" x="80" y="174" width="40" height="4" rx="2" opacity=".55" />

            {/* LEFT ARM — the one that points, because the box is to his left */}
            <g className="bolt__arm-l"
               style={{ transformOrigin: "68px 136px", transform: `rotate(${armAngle}deg)` }}>
                <rect className="bolt__metal" x="36" y="132" width="32" height="9" rx="4.5" strokeWidth="1.8" />
                <circle className="bolt__lime bolt__stroke-lime" cx="34" cy="136.5" r="7.5" strokeWidth="1.8" />
                {/* finger, extended leftward */}
                <rect className="bolt__lime" x="19" y="134" width="9" height="5" rx="2.5" />
            </g>

            {/* right arm — idle, and mirrors upward when he gets excited */}
            <g className="bolt__arm-r"
               style={{
                   transformOrigin: "132px 136px",
                   transform: `rotate(${mood === "scanning" ? -42 : 0}deg)`,
               }}>
                <rect className="bolt__metal" x="132" y="132" width="28" height="9" rx="4.5" strokeWidth="1.8" />
                <circle className="bolt__metal" cx="160" cy="136.5" r="7" strokeWidth="1.8" />
            </g>

            {/* head */}
            <rect x="54" y="34" width="92" height="80" rx="24"
                  fill={`url(#${bodyG})`} className="bolt__stroke-lime" strokeWidth="2.4" />
            {/* visor */}
            <rect x="63" y="48" width="74" height="46" rx="18"
                  fill={`url(#${visorG})`} className="bolt__stroke-cyan" strokeWidth="1.6" opacity=".9" />

            {mood === "scanning" ? (
                <>
                    {/* the visor becomes a radar */}
                    <circle cx="100" cy="71" r="17" fill="none"
                            className="bolt__stroke-cyan" strokeWidth="1.2" opacity=".5" />
                    <circle cx="100" cy="71" r="9" fill="none"
                            className="bolt__stroke-cyan" strokeWidth="1.2" opacity=".4" />
                    <line className="bolt__stroke-cyan bolt__sweep"
                          x1="100" y1="71" x2="117" y2="71"
                          strokeWidth="2.4" strokeLinecap="round" filter={`url(#${glow})`}
                          style={{ transformOrigin: "100px 71px" }} />
                </>
            ) : (
                <g className="bolt__eyes" style={{ transform: `translate(${px}px, ${py}px)` }}>
                    <ellipse className="bolt__eye" cx="84" cy="71" rx="9"
                             ry={mood === "typing" ? 11 : 9.5} filter={`url(#${glow})`} />
                    <ellipse className="bolt__eye" cx="116" cy="71" rx="9"
                             ry={mood === "typing" ? 11 : 9.5} filter={`url(#${glow})`} />
                    <circle className="bolt__pupil" cx="86.5" cy="68.5" r="2.6" />
                    <circle className="bolt__pupil" cx="118.5" cy="68.5" r="2.6" />
                </g>
            )}

            {/* mouth bar */}
            <rect className="bolt__mouth" x="86" y="102" width="28" height="5" rx="2.5" />

            {/* ear pods */}
            <rect className="bolt__metal" x="44" y="62" width="10" height="26" rx="5" strokeWidth="1.8" />
            <rect className="bolt__metal" x="146" y="62" width="10" height="26" rx="5" strokeWidth="1.8" />
        </svg>
    );
}

export default Bolt;

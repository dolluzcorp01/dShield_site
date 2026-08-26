import React, { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   Motion — the three animation primitives the site shares.

   Ported from the frozen v5.9 prototype, where Count and Reveal sit at lines
   504 and 517 as local helpers inside the single-file component. They are
   here rather than inside a page because the tile grid, the pricing table
   and the proof block all use them, and the reduced-motion hook that guards
   them was already living privately in Bolt.js.

   One copy of each. Two copies of a palette is how a product ends up with
   two design systems — the prototype's own comment, and it applies just as
   well to two copies of a hook.
   ───────────────────────────────────────────────────────────────────────── */

/* Does this person want us to stop moving things?

   Read live rather than once: somebody can turn the setting on while the
   page is open, and a page that keeps animating after they did is the
   failure this hook exists to prevent. */
export function usePrefersReducedMotion() {
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
   Count — a number that counts up to itself.

   Quartic ease-out, so it moves fast and settles slowly. That is what makes
   a score feel arrived-at rather than merely displayed.

   THE PROTOTYPE'S VERSION IGNORES REDUCED MOTION. It animates unconditionally
   from 0. A number sprinting upward is exactly the kind of movement the
   setting is asking us to stop, and this one carries a security grade — the
   single most important figure on the page. Under reduced motion the final
   value is printed immediately.

   It also starts from 0 on every mount, which means a score of 0 animates
   from 0 to 0 and looks identical to a tile that never loaded. Real scans
   produce 0 — dolluzcorp.com scores 0 on domain 20 today — so the final
   value is committed synchronously when it is already correct.
   ───────────────────────────────────────────────────────────────────────── */
export function Count({ to, dur = 900 }) {
    const reduced = usePrefersReducedMotion();
    const [v, setV] = useState(to === 0 ? 0 : 0);

    useEffect(() => {
        if (reduced || to === 0) { setV(to); return; }

        let raf = 0;
        let t0 = 0;
        const frame = (t) => {
            if (!t0) t0 = t;
            const p = Math.min(1, (t - t0) / dur);
            setV(Math.round(to * (1 - Math.pow(1 - p, 4))));
            if (p < 1) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [to, dur, reduced]);

    return <>{v}</>;
}

/* ─────────────────────────────────────────────────────────────────────────
   Reveal — fades a block in when it scrolls into view.

   Under reduced motion the child is rendered plainly, with no wrapper
   transition and no observer attached at all.

   The observer disconnects after the first intersection. The prototype
   leaves it running for the life of the page, so every one of the twenty-odd
   Reveals keeps firing callbacks on every scroll long after it has finished
   its one job.
   ───────────────────────────────────────────────────────────────────────── */
export function Reveal({ children, delay = 0, className = "" }) {
    const reduced = usePrefersReducedMotion();
    const ref = useRef(null);
    const [on, setOn] = useState(false);

    useEffect(() => {
        if (reduced) return;
        const el = ref.current;
        if (!el || typeof IntersectionObserver !== "function") { setOn(true); return; }

        const io = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            setOn(true);
            io.disconnect();
        }, { threshold: 0.1 });

        io.observe(el);
        return () => io.disconnect();
    }, [reduced]);

    if (reduced) return <div className={className}>{children}</div>;

    return (
        <div
            ref={ref}
            className={`reveal${on ? " reveal--on" : ""}${className ? ` ${className}` : ""}`}
            style={delay ? { transitionDelay: `${delay}ms` } : undefined}
        >
            {children}
        </div>
    );
}

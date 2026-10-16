import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiStream } from "./utils/api";
import "./Home.css";
import { useDocumentMeta } from "./utils/meta";
import Bolt, { Type } from "./Bolt";
import TwentyThree from "./TwentyThree";
import { Connect, WhatWeDo, SmartChecks, ServicesBlock, Compliance, Faq } from "./Sections";
import { SEEN_DOMAINS, DOMAIN_LABELS } from "./data/site-content";
import Tiers from "./Tiers";
import { ContactSection } from "./Pages";

/* The rotating PROMISED list and the interval that drove it are gone. They
   paced the scanning screen from a timer because there was no per-area
   progress to show; there is now - Scan_server streams the engine's own
   onProgress events and `measuring` below is built from them. */

function Home() {
    useDocumentMeta({
        title: "Free Security Scan - See What an Attacker Sees | dShield",
        description: "Check your company's security from the outside in under a minute. Email spoofing, certificates, exposed files and lookalike domains. No sign-up, no card.",
        canonical: "/",
    });

    const [domain, setDomain] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    /* Bolt's pointer tracking is the ONLY state he adds. His mood is derived
       from the state this component already had. */
    const [look, setLook] = useState({ x: 0, y: 0 });
    const heroRef = useRef(null);
    const boltRef = useRef(null);

    /* Pupils follow the cursor.

       The listener is on the hero rather than the window: below the fold he
       is not on screen and there is nothing to aim. It is throttled through
       requestAnimationFrame so a fast mouse cannot queue a re-render per
       pixel, and it is skipped entirely under reduced motion - eyes that
       track the pointer are exactly the kind of movement that setting is
       asking us to stop. */
    useEffect(() => {
        const hero = heroRef.current;
        if (!hero) return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

        let raf = 0;
        let pending = null;

        const apply = () => {
            raf = 0;
            const el = boltRef.current;
            if (!el || !pending) return;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const clamp = (v) => Math.max(-1, Math.min(1, v));
            setLook({
                x: clamp((pending.x - cx) / (r.width * 1.6)),
                y: clamp((pending.y - cy) / (r.height * 1.6)),
            });
        };

        const onMove = (e) => {
            pending = { x: e.clientX, y: e.clientY };
            if (!raf) raf = requestAnimationFrame(apply);
        };

        hero.addEventListener("pointermove", onMove, { passive: true });
        return () => {
            hero.removeEventListener("pointermove", onMove);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);

    /* Areas the engine has started work on, in the order it reached them.
       Driven by real progress events from the engine, not a timer - see
       apiStream in utils/api.js and the streaming block in Scan_server.js. */
    const [measuring, setMeasuring] = useState([]);

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!domain.trim()) return setError("Enter a domain to scan.");

        setBusy(true);
        setMeasuring([]);

        const res = await apiStream("/api/scan", { domain: domain.trim() }, (ev) => {
            if (ev.type !== "progress" || ev.domain == null) return;
            setMeasuring((m) => (m.includes(ev.domain) ? m : [...m, ev.domain]));
        });

        setBusy(false);
        setMeasuring([]);

        if (!res.success) return setError(res.message || "The scan could not be completed.");
        navigate(`/result/${res.scanId}`, { state: { result: res.result } });
    };

    /* The screenplay. Every mood is derived - no state exists for Bolt.

       THERE IS NO "done" MOOD ON THIS PAGE. In the frozen prototype the
       result appeared below the fold, so Bolt could point down at it and say
       "NOW LOOK DOWN". Here a finished scan navigates to /result/:id, so the
       homepage unmounts the instant the result exists and there is nothing
       below to point at. He keeps the pose in Bolt.js for whichever app
       shows a result in place; it is simply unreachable from here. */
    const mood = busy ? "scanning"
        : domain.trim().length > 0 ? "typing"
            : "greet";

    /* His scanning line still does NOT count areas.

       The prototype said "n/5 AREAS IN" from a simulated counter. We now
       have real per-area progress and could show a true count - but the
       tiles and the level meter already say which areas are done, and a
       third counter saying the same thing in a speech bubble is noise.
       "HOLD ON" is the frozen file's own line. */
    const boltLine = {
        greet: "← PSST. DROP YOUR SITE IN HERE",
        typing: "← OOH. KEEP GOING…",
        scanning: "SCANNING… HOLD ON",
        done: "DONE! NOW LOOK DOWN ↓",
    }[mood];

    return (
        <div className="home">
            <section className="hero" ref={heroRef}>
                <div className="hero__glow" aria-hidden="true" />
                <div className="ds-wrap hero__inner">
                  <div className="hero__cols">
                   <div className="hero__copy">
                    {/* The prototype's chip, dot and all - the product name
                        rather than a list of what it does not cost. */}
                    <p className="hero__chip">
                        <span className="hero__dot" aria-hidden="true" />
                        Cyber Resilience Check
                    </p>
                    <h1 className="hero__title ds-shout">
                        Five ways in<br />from the street.<br />
                        <span className="hero__title-lime">Eighteen behind<br />your door.</span>
                    </h1>
                    <p className="ds-lead hero__lead">
                        Give us your website address. In about half a minute we check the five
                        things a stranger can see from outside - then we name the other
                        eighteen, and show you what it takes to look inside.
                    </p>

                    {/* THE ADDRESS IS NOT ASKED FOR HERE.

                        This box used to carry a second field, "Email (optional
                        - we will send you the result)". The prototype has no
                        such field: one input, one GO, and the address is
                        requested AFTER the result, in the block its own comment
                        explains -

                          Offered after the result, never before it. The scan is
                          free and the result is theirs whether or not they give
                          us an address - asking first would make the address
                          the price of the check.

                        A free check that opens by asking who you are is not the
                        same offer. The capture now lives on the result page. */}
                    <form className="scanbox" onSubmit={submit}>
                        <div className="scanbox__row">
                            <input
                                id="scan-box"
                                className="ds-input scanbox__domain"
                                placeholder="yourcompany.com"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                disabled={busy}
                                autoComplete="off"
                                spellCheck="false"
                                aria-label="Your website address"
                            />
                            <button className="ds-btn scanbox__go" disabled={busy}>
                                {busy ? "Scanning" : "Go"}
                            </button>
                        </div>

                        {error && <div className="ds-error">{error}</div>}

                        {/* The level meter - one bar per area a free check
                            reaches, filling from REAL progress events now
                            rather than a rotating timer. A bar lights when
                            the engine actually starts that area. */}
                        {busy && (
                            <div className="scanbox__meter" aria-hidden="true">
                                {SEEN_DOMAINS.map((d, i) => (
                                    <span key={d.n} className={i < measuring.length ? "is-lit" : ""} />
                                ))}
                            </div>
                        )}
                        {busy && (
                            <p className="scanbox__progress" role="status">
                                {measuring.length
                                    ? `Checking ${DOMAIN_LABELS[measuring[measuring.length - 1]].toLowerCase()}…`
                                    : "Starting the check…"}
                            </p>
                        )}
                    </form>
                   </div>

                    {/* Bolt stands to the RIGHT of the box, which is why his LEFT
                        arm is the one that points. The whole block is hidden from
                        assistive technology: his line is a typed animation that
                        would be re-announced character by character, and every
                        instruction he gives is already in the label and the
                        fineprint beside him. */}
                    <div className="hero__bolt" aria-hidden="true">
                        <div className="boltbox">
                            <div className={`boltbox__bubble ${mood === "done" ? "is-done" : ""}`}>
                                <div className="boltbox__line">
                                    <span><Type text={boltLine} /></span>
                                </div>
                                <span className="boltbox__tail" />
                            </div>
                            <div ref={boltRef}>
                                <Bolt mood={mood} look={look} />
                            </div>
                            <div className="boltbox__label">BOLT · YOUR GUIDE</div>
                        </div>
                    </div>
                  </div>
                </div>
            </section>

            {/* The five-card "Five ways in from the street" block that used to
                sit here is gone. It repeated the hero headline word for word,
                two screens apart, and listed five of the areas the grid below
                already names all twenty-three of. */}

            {/* THE 23, in its idle state. The frozen prototype puts the full
                grid on the home page before anything has been scanned - every
                tile dim with a "?" - so the size of what a free check does
                NOT cover is visible before you run one. That is the whole
                commercial argument, and it is also the honest one.

                It takes result={null} here. The same component renders the
                real thing on /result, so the two can never drift into showing
                different numbers of areas. */}
            <TwentyThree result={null} measuring={measuring} />

            <section className="ds-section ds-section--tight">
                <div className="ds-wrap">
                    <div className="ds-card gap">
                        <div className="gap__figure">
                            <div className="gap__num">5</div>
                            <div className="gap__of">of 23</div>
                        </div>
                        <div className="gap__body">
                            <p className="ds-eyebrow" style={{ marginBottom: 8 }}>The honest part</p>
                            <h2 className="ds-shout" style={{ fontSize: "1.7rem" }}>A scan sees about a quarter of your risk.</h2>
                            <p className="ds-muted" style={{ marginBottom: 0 }}>
                                We measure five risk domains from outside. Eighteen more - whether your
                                backups actually restore, whether a junior would challenge a payment
                                request from the CEO, whether staff feel able to admit a mistake - no
                                scanner can reach. Your report shows all twenty-three, and marks plainly
                                which ones we could not measure. Most tools show you the five and let
                                you assume that is everything.
                            </p>
                            <Link to="/coverage" className="gap__more">
                                See what the other eighteen cover →
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* The rest of the frozen prototype's page, in its order:
                CONNECT · WHAT WE DO · SPOT CHECKS · SERVICES · COMPLIANCE ·
                FAQ. Each is a section in Sections.js reading the shared
                tables, so /services, /tools and /pricing show the same words
                as the home page rather than a second copy of them.

                TIERS and CONTACT are not here. They already exist as
                /pricing and /contact and are reached from the nav - putting
                a second pricing table and a second enquiry form on this page
                would mean two of each to keep in step, which is the failure
                this whole port is arranged against. */}
            <Connect />
            <Tiers />
            <WhatWeDo />
            <SmartChecks />
            <ServicesBlock />
            <Compliance />
            <Faq />
            <ContactSection />
        </div>
    );
}

export default Home;

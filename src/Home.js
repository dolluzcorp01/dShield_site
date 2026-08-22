import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "./utils/api";
import "./Home.css";
import { useDocumentMeta } from "./utils/meta";
import Bolt, { Type } from "./Bolt";

/* The five things a free scan actually looks at.
   These must stay in step with the eight checks in scan_engine.js. A site
   that promises five areas while the engine covers two is the defect that
   journey testing caught in the main product — three tiles dark, nothing
   explaining why, under a headline promising five. */
const PROMISED = [
    { key: "surface", title: "Your website from outside", line: "Files and folders that should never have been published." },
    { key: "certs", title: "Your certificates", line: "Whether encryption is valid, current, and about to lapse." },
    { key: "email", title: "Your email", line: "Whether anyone can send mail that appears to come from you." },
    { key: "exposure", title: "What is already public", line: "Internal hostnames leaking through public certificate logs." },
    { key: "brand", title: "Fake versions of you", line: "Misspellings of your domain that can send invoices today." },
];

function Home() {
    useDocumentMeta({
        title: "Free Security Scan — See What an Attacker Sees | dShield",
        description: "Check your company's security from the outside in under a minute. Email spoofing, certificates, exposed files and lookalike domains. No sign-up, no card.",
        canonical: "/",
    });

    const [domain, setDomain] = useState("");
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [phase, setPhase] = useState(0);
    const navigate = useNavigate();
    const timer = useRef(null);

    /* Bolt's pointer tracking is the ONLY state he adds. His mood is derived
       from the state this component already had. */
    const [look, setLook] = useState({ x: 0, y: 0 });
    const heroRef = useRef(null);
    const boltRef = useRef(null);

    /* Progress is theatre, and deliberately so. The scan takes twenty to
       sixty seconds depending on how quickly the other end answers, and a
       blank screen for that long reads as broken however well it works. */
    useEffect(() => {
        if (busy) {
            setPhase(0);
            timer.current = setInterval(() => setPhase((p) => (p + 1) % PROMISED.length), 2600);
        } else if (timer.current) {
            clearInterval(timer.current);
        }
        return () => timer.current && clearInterval(timer.current);
    }, [busy]);

    /* Pupils follow the cursor.

       The listener is on the hero rather than the window: below the fold he
       is not on screen and there is nothing to aim. It is throttled through
       requestAnimationFrame so a fast mouse cannot queue a re-render per
       pixel, and it is skipped entirely under reduced motion — eyes that
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

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!domain.trim()) return setError("Enter a domain to scan.");

        setBusy(true);
        const res = await apiPost("/api/scan", {
            domain: domain.trim(),
            email: email.trim() || undefined,
        });
        setBusy(false);

        if (!res.success) return setError(res.message || "The scan could not be completed.");
        navigate(`/result/${res.scanId}`, { state: { result: res.result } });
    };

    /* The screenplay. Every mood is derived — no state exists for Bolt.

       THERE IS NO "done" MOOD ON THIS PAGE. In the frozen prototype the
       result appeared below the fold, so Bolt could point down at it and say
       "NOW LOOK DOWN". Here a finished scan navigates to /result/:id, so the
       homepage unmounts the instant the result exists and there is nothing
       below to point at. He keeps the pose in Bolt.js for whichever app
       shows a result in place; it is simply unreachable from here. */
    const mood = busy ? "scanning"
        : domain.trim().length > 0 ? "typing"
            : "greet";

    /* His scanning line does NOT count areas.

       The prototype said "n/5 AREAS IN" because it drove that number from a
       simulated counter. The real scan returns everything at once — there is
       no per-area progress from the server — and `phase` below is a rotating
       index for the "Checking your email…" theatre, so it wraps back to 1
       partway through. A counter driven from it would run backwards, and a
       counter driven from nothing would be a fabricated progress figure on a
       product whose whole argument is that it tells you what it actually
       measured. "HOLD ON" is the frozen file's own screenplay line. */
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
                    <p className="ds-eyebrow">Free · No sign-up · No card</p>
                    <h1 className="hero__title ds-shout">
                        See what an attacker<br />sees of your company.
                    </h1>
                    <p className="ds-lead hero__lead">
                        Enter your domain. In under a minute you will know your grade, how many
                        problems are visible from the public internet, and — just as
                        importantly — how much of your risk a scan like this cannot reach.
                    </p>

                    <form className="scanbox" onSubmit={submit}>
                        <div className="scanbox__row">
                            <input
                                className="ds-input scanbox__domain"
                                placeholder="yourcompany.com"
                                value={domain}
                                onChange={(e) => setDomain(e.target.value)}
                                disabled={busy}
                                autoComplete="off"
                                spellCheck="false"
                                aria-label="Your domain"
                            />
                            <button className="ds-btn scanbox__go" disabled={busy}>
                                {busy ? <><span className="ds-spin" /> Scanning…</> : "Run free scan"}
                            </button>
                        </div>

                        <input
                            className="ds-input scanbox__email"
                            placeholder="Email (optional — we will send you the result)"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={busy}
                            type="email"
                            aria-label="Email address, optional"
                        />

                        {error && <div className="ds-error">{error}</div>}

                        {busy && (
                            <div className="scanbox__progress">
                                <span className="scanbox__dot" />
                                Checking {PROMISED[phase].title.toLowerCase()}…
                            </div>
                        )}

                        <p className="scanbox__fineprint">
                            We only read what your servers already publish to anyone who asks.
                            Nothing is probed, nothing is attacked, and no account is required.
                        </p>
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

            <section className="ds-section ds-wrap">
                <p className="ds-eyebrow">What the free scan covers</p>
                <h2 className="ds-shout">Five ways in from the street</h2>
                <p className="ds-lead" style={{ marginBottom: 34 }}>
                    Eight checks across the five areas that need nothing from you but a web
                    address.
                </p>

                <div className="ds-grid ds-grid--3">
                    {PROMISED.map((c) => (
                        <div className="ds-card ds-card--live promise" key={c.key}>
                            <h3>{c.title}</h3>
                            <p className="ds-muted" style={{ margin: 0 }}>{c.line}</p>
                        </div>
                    ))}
                </div>
            </section>

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
                                We measure five risk domains from outside. Eighteen more — whether your
                                backups actually restore, whether a junior would challenge a payment
                                request from the CEO, whether staff feel able to admit a mistake — no
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
        </div>
    );
}

export default Home;

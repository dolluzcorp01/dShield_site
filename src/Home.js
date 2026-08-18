import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "./utils/api";
import "./Home.css";
import { useDocumentMeta } from "./utils/meta";

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

    return (
        <div className="home">
            <section className="hero">
                <div className="hero__glow" aria-hidden="true" />
                <div className="ds-wrap hero__inner">
                    <p className="ds-eyebrow">Free · No sign-up · No card</p>
                    <h1 className="hero__title">
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
            </section>

            <section className="ds-section ds-wrap">
                <p className="ds-eyebrow">What the free scan covers</p>
                <h2>Five ways in from the street</h2>
                <p className="ds-lead" style={{ marginBottom: 34 }}>
                    Eight checks across the five areas that need nothing from you but a web
                    address.
                </p>

                <div className="ds-grid ds-grid--3">
                    {PROMISED.map((c) => (
                        <div className="ds-card promise" key={c.key}>
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
                            <h2 style={{ fontSize: "1.7rem" }}>A scan sees about a quarter of your risk.</h2>
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

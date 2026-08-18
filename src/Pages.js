import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "./utils/api";
import "./Pages.css";

/* ── Contact ─────────────────────────────────────────────────────────── */

export function Contact() {
    const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", domain: "", tier: "", message: "" });
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!form.email.trim()) return setError("Enter your email address so we can reply.");
        setBusy(true);
        const res = await apiPost("/api/leads/enquiry", form);
        setBusy(false);
        if (!res.success) return setError(res.message || "That could not be sent.");
        setSent(true);
    };

    if (sent) {
        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card" style={{ maxWidth: 620 }}>
                    <h1>Thank you</h1>
                    <p className="ds-muted">
                        We have your message and somebody will be in touch. If it is urgent, the free
                        scan and all five tools are available now while you wait.
                    </p>
                    <Link to="/" className="ds-btn">Run a free scan</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">Contact</p>
            <h1>Talk to us</h1>
            <p className="ds-lead" style={{ marginBottom: 30 }}>
                For Full Protection, Extended Support, or anything you would rather discuss with a
                person than read on a page.
            </p>

            <form className="ds-card contactform" onSubmit={submit}>
                <div className="ds-grid ds-grid--2">
                    <div className="ds-field">
                        <label className="ds-label">Your name</label>
                        <input className="ds-input" value={form.name} onChange={set("name")} disabled={busy} />
                    </div>
                    <div className="ds-field">
                        <label className="ds-label">Email <span className="req">*</span></label>
                        <input className="ds-input" type="email" value={form.email} onChange={set("email")} disabled={busy} />
                    </div>
                    <div className="ds-field">
                        <label className="ds-label">Company</label>
                        <input className="ds-input" value={form.company} onChange={set("company")} disabled={busy} />
                    </div>
                    <div className="ds-field">
                        <label className="ds-label">Phone</label>
                        <input className="ds-input" value={form.phone} onChange={set("phone")} disabled={busy} />
                    </div>
                    <div className="ds-field">
                        <label className="ds-label">Your domain</label>
                        <input className="ds-input" placeholder="yourcompany.com" value={form.domain} onChange={set("domain")} disabled={busy} />
                    </div>
                    <div className="ds-field">
                        <label className="ds-label">Interested in</label>
                        <select className="ds-input" value={form.tier} onChange={set("tier")} disabled={busy}>
                            <option value="">Not sure yet</option>
                            <option value="basic">Basic — $49</option>
                            <option value="advanced">Advanced — $199</option>
                            <option value="full_protection">Full Protection — $499</option>
                            <option value="extended_support">Full Protection + Extended Support — $999+/month</option>
                        </select>
                    </div>
                </div>

                <div className="ds-field">
                    <label className="ds-label">What would you like to talk about?</label>
                    <textarea className="ds-input" value={form.message} onChange={set("message")} disabled={busy} />
                </div>

                {error && <div className="ds-error">{error}</div>}

                <button className="ds-btn" disabled={busy}>
                    {busy ? <span className="ds-spin" /> : "Send enquiry"}
                </button>
            </form>
        </div>
    );
}

/* ── How it works ────────────────────────────────────────────────────── */

export function HowItWorks() {
    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">How it works</p>
            <h1>A scan, and then the honest part</h1>
            <p className="ds-lead">
                dShield assesses. It does not defend, block or fix anything — and it is worth
                being plain about that, because a great many products in this market are vague
                on the point.
            </p>

            <div className="steps">
                {[
                    { n: "01", t: "You enter a domain", d: "Nothing else. No account, no card, no agent to install, and no access to anything of yours." },
                    { n: "02", t: "We read what is already public", d: "DNS records, your certificate, your page headers, public certificate logs, and common misspellings of your name. All of it is information your servers hand to anyone who asks." },
                    { n: "03", t: "You get a grade", d: "Across the five risk domains a scan can reach, with how many issues and how serious. The formula is published, so you can recompute any grade by hand." },
                    { n: "04", t: "And a map of what we could not see", d: "All twenty-three risk domains, with the eighteen we did not measure marked plainly. That is the part most tools leave out." },
                ].map((s) => (
                    <div className="step" key={s.n}>
                        <div className="step__n ds-mono">{s.n}</div>
                        <div>
                            <h3>{s.t}</h3>
                            <p className="ds-muted" style={{ margin: 0 }}>{s.d}</p>
                        </div>
                    </div>
                ))}
            </div>

            <h2 style={{ marginTop: 48 }}>What we will never do</h2>
            <div className="ds-grid ds-grid--2" style={{ marginTop: 18 }}>
                {[
                    ["No port scanning", "Scanning ports is active reconnaissance. It sets off intrusion detection and it is not what a customer agreed to when they typed a domain."],
                    ["No attempts to break in", "We never try a login, never send input designed to find a weakness by breaking something, never touch anything we are not invited to."],
                    ["No write access, ever", "Even at the highest tier, every connection to a customer's systems is read-only. A token carrying write access is refused by the code."],
                    ["No grade from a partial scan", "If too few checks complete, no score is published at all. A number built on checks that never ran is worse than no number."],
                ].map(([t, d]) => (
                    <div className="ds-card" key={t}>
                        <h3>{t}</h3>
                        <p className="ds-muted" style={{ margin: 0 }}>{d}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── Trust ───────────────────────────────────────────────────────────── */

export function Trust() {
    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">Trust</p>
            <h1>How we score, and what we hold</h1>
            <p className="ds-lead">
                A security company asking to be trusted should show its working. Here is ours.
            </p>

            <h2 style={{ marginTop: 40 }}>The scoring formula</h2>
            <p className="ds-muted">
                Published deliberately, so any grade we issue can be checked by hand.
            </p>
            <div className="formula ds-mono">
                domainScore = 100 − (failedWeight ÷ applicableWeight × 100)
            </div>
            <div className="weights">
                {[["Critical", 10, "critical"], ["High", 6, "high"], ["Medium", 3, "medium"], ["Low", 1, "low"]].map(([l, w, c]) => (
                    <div className="weights__item" key={l}>
                        <span className={`ds-pill ds-pill--${c}`}>{l}</span>
                        <span className="ds-mono">weight {w}</span>
                    </div>
                ))}
            </div>

            <div className="ds-note" style={{ marginTop: 22 }}>
                <strong>A check that could not run is excluded from both sides of that sum.</strong>{" "}
                It never counts as a pass. "We looked and found nothing wrong" and "we could not
                look" are different sentences, and a customer told the first when the second is
                true has been misled about their own safety by a product they came to for the
                opposite.
            </div>

            <h2 style={{ marginTop: 44 }}>Your password never reaches us</h2>
            <p className="ds-muted">
                The Password Exposure Check hashes your password inside your browser and sends
                only the first five characters of that hash. We receive back several hundred
                possible matches and compare them on your machine. We never see your password,
                never see the full hash, and could not reconstruct either from what we do see.
            </p>

            <h2 style={{ marginTop: 44 }}>What we store from a free scan</h2>
            <ul className="plainlist">
                <li>The domain you entered, and the result we showed you.</li>
                <li>Your email address, only if you chose to give it.</li>
                <li>Your IP address, to stop one person scanning thousands of domains through us.</li>
            </ul>
            <p className="ds-muted">
                We do not store passwords or password hashes from the tool, and we do not sell or
                share any of it. Write to us and we will delete your record.
            </p>

            <h2 style={{ marginTop: 44 }}>Grade caps</h2>
            <p className="ds-muted">
                One critical finding caps the grade at D. Three or more cap it at E. A company
                with a critical hole and otherwise good hygiene is not a B, and averaging it away
                would make the grade useless at exactly the moment it matters.
            </p>
        </div>
    );
}

/* ── Footer ──────────────────────────────────────────────────────────── */

export function Footer() {
    return (
        <footer className="footer">
            <div className="ds-wrap footer__inner">
                <div className="footer__brand">
                    <strong>dShield</strong>
                    <span className="ds-faint">by Dolluz Corp · Chennai</span>
                </div>
                <nav className="footer__links">
                    <Link to="/how-it-works">How it works</Link>
                    <Link to="/pricing">Pricing</Link>
                    <Link to="/tools">Free tools</Link>
                    <Link to="/trust">Trust</Link>
                    <Link to="/contact">Contact</Link>
                </nav>

                {/* Kept as a separate, lighter row rather than merged into the
                    nav above. Nine links of equal weight is a list nobody
                    reads; the legal row needs to be findable, not prominent. */}
                <nav className="footer__legal">
                    <Link to="/legal/terms">Terms</Link>
                    <Link to="/legal/privacy">Privacy</Link>
                    <Link to="/legal/refunds">Refunds</Link>
                    <Link to="/legal/cookies">Cookies</Link>
                    <Link to="/data-request">Your data</Link>
                </nav>
                <p className="ds-faint footer__note">
                    dShield assesses security posture from publicly available information. It does
                    not defend, block or remediate, and no assessment can guarantee that a system
                    is secure.
                </p>
            </div>
        </footer>
    );
}

/* ── 404 ─────────────────────────────────────────────────────────────── */

export function NotFound() {
    return (
        <div className="ds-wrap ds-section ds-center">
            <p className="ds-eyebrow">404</p>
            <h1>That page does not exist</h1>
            <Link to="/" className="ds-btn" style={{ marginTop: 12 }}>Back to the scan</Link>
        </div>
    );
}

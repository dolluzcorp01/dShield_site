import React, { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { apiPost } from "./utils/api";
import "./Pages.css";
import { useDocumentMeta } from "./utils/meta";
/* The lockup, not the bare eagle. DOLLUZ_CORP.png is the artwork as
   supplied — gold bird, wordmark set in BLACK — which is invisible against
   #0B0316. DOLLUZ_CORP_dark.png is that same file with its near-black pixels
   recoloured to bone and every gold pixel left exactly as supplied, which is
   what the frozen prototype does to produce its own lockup. It is generated
   by scripts/make-dark-lockup.mjs; re-run that if the artwork is resupplied. */
import lockup from "./assets/img/DOLLUZ_CORP_dark.png";
import { OFFICE, TIERS, SERVICES, COMPLIANCE, SMART_BUILT, WHATSAPP_HREF } from "./data/site-content";

/* ── Contact ─────────────────────────────────────────────────────────── */

/* The tier selector's own values. A ?topic= matching one of these pre-fills
   the selector; anything else is a service slug from a card on /services and
   is shown as a read-only line instead — putting a service into a dropdown
   of prices would misrepresent it as something with a list price. */
const TIER_VALUES = ["basic", "advanced", "full_protection", "extended_support"];

const SERVICE_LABELS = {
    "technical-assurance": "Technical Assurance",
    "third-party-risk-management": "Third-Party Risk Management",
    "soc-setup-monitoring": "SOC Setup & Monitoring",
    "incident-response-forensics": "Incident Response & Forensics",
    "penetration-testing": "Penetration Testing",
    "continuous-grc": "Continuous GRC",
    "standards-compliance-audits": "Standards & Compliance Audits",
};

/* ─────────────────────────────────────────────────────────────────────────
   The enquiry form, shared by the /contact page and the section on the home
   page. One component, so the two cannot drift into asking different
   questions or posting different fields.

   It keeps its own `sent` state, which is why the thank-you renders in
   place: somebody who fills this in halfway down the home page should not be
   thrown to another route to be told it worked.
   ───────────────────────────────────────────────────────────────────────── */

function ContactForm() {
    const [params] = useSearchParams();
    const topic = (params.get("topic") || "").trim().slice(0, 40);
    const topicIsTier = TIER_VALUES.includes(topic);
    const serviceLabel = topicIsTier ? null : (SERVICE_LABELS[topic] || null);

    const [form, setForm] = useState({
        name: "", email: "", company: "", phone: "", domain: "",
        tier: topicIsTier ? topic : "",
        message: "",
    });
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!form.email.trim()) return setError("Enter your email address so we can reply.");
        setBusy(true);
        // Send the slug only when it names a real service. An unrecognised
        // ?topic= is somebody editing the URL, and it should not be recorded
        // as an interest we can act on.
        const res = await apiPost("/api/leads/enquiry", serviceLabel ? { ...form, topic } : form);
        setBusy(false);
        if (!res.success) return setError(res.message || "That could not be sent.");
        setSent(true);
    };

    if (sent) {
        return (
            <div className="ds-card" style={{ maxWidth: 620 }}>
                <h2>Thank you</h2>
                <p className="ds-muted">
                    We have your message and somebody will be in touch. If it is urgent, the free
                    scan and all five tools are available now while you wait.
                </p>
                <Link to="/" className="ds-btn">Run a free scan</Link>
            </div>
        );
    }

    return (
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
                    {serviceLabel ? (
                        <>
                            <div className="ds-input contact__topic" aria-readonly="true">{serviceLabel}</div>
                            <p className="ds-faint" style={{ margin: "8px 0 0" }}>
                                From the service you came in on. Tell us more below, or{" "}
                                <Link to="/services">pick a different one</Link>.
                            </p>
                        </>
                    ) : (
                        <select className="ds-input" value={form.tier} onChange={set("tier")} disabled={busy}>
                            <option value="">Not sure yet</option>
                            <option value="basic">Basic — $49</option>
                            <option value="advanced">Advanced — $199</option>
                            <option value="full_protection">Full Protection — $499</option>
                            <option value="extended_support">Full Protection + Extended Support — $999+/month</option>
                        </select>
                    )}
                </div>
            </div>

            <div className="ds-field">
                <label className="ds-label">What would you like to talk about?</label>
                <textarea className="ds-input" value={form.message} onChange={set("message")} disabled={busy} />
            </div>

            {error && <div className="ds-error">{error}</div>}

            {/* Disabled until there is an address to reply to. The form has
                always refused to submit without one — it just did it by
                showing an error AFTER the click, which teaches somebody that
                the button is unreliable rather than that the field is
                required. The gradient draining out of the button says the
                same thing before the click instead. */}
            <button className="ds-btn ds-btn--send" disabled={busy || !form.email.trim()}>
                {busy ? <span className="ds-spin" /> : "Send enquiry"}
            </button>

            {/* The two questions everybody has about a form like this, and
                the reason they do not fill it in. Both are true: enquiries
                are alerted to a monitored inbox, and nothing here is sold or
                passed on. */}
            <p className="contactform__note">
                We reply within one working day. We never pass your details to anyone.
            </p>
        </form>
    );
}

/* The /contact route. Kept as a real page with its own canonical URL and
   meta even though the form now also sits on the home page — it is a
   deep link people are sent, and it is what the footer and the nav point at
   from every route that is not "/". */
export function Contact() {
    useDocumentMeta({
        title: "Contact Dolluz Corp — Security Services | dShield",
        description: "Talk to our engineers about audits, penetration testing, incident response or compliance.",
        canonical: "/contact",
    });

    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">Contact</p>
            <h1>Talk to us</h1>
            <p className="ds-lead" style={{ marginBottom: 30 }}>
                For Full Protection, Extended Support, or anything you would rather discuss with a
                person than read on a page.
            </p>
            {/* The same pairing as the home page section. Somebody who
                followed a footer link here should not get less than somebody
                who scrolled. */}
            <div className="contact__split">
                <ContactForm />
                <OfficeCard />
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
   The office card that sits beside the form.

   IT IS NOT DECORATION. A page that asks for your name and email and offers
   nothing back is a lead-capture form; the same page next to an address, a
   number and opening hours is a company you can reach whether or not you
   fill anything in. The frozen prototype pairs the two for that reason, and
   dropping it left the section's whole right half empty.

   Rows render only where there is something real to print. The prototype
   ships a "PHONE" row reading "+91 00000 00000", which under a FAQ
   promising "a phone number that a person answers" is worse than no row at
   all — so there is no phone field in OFFICE and no phone row here. WhatsApp
   is a real number, so it is a real link.
   ───────────────────────────────────────────────────────────────────────── */
function OfficeCard() {
    const { pathname } = useLocation();

    /* Only intercept when there is nothing to navigate to. Anywhere other
       than "/" this stays a plain link, so the route change carries the
       reader to the top of the home page on its own. */
    const toScanBox = (e) => {
        if (pathname !== "/") return;
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <aside className="office">
            <p className="office__company">{OFFICE.company}</p>

            <div className="office__row">
                <p className="office__k">Where</p>
                <p className="office__v">{OFFICE.line1}, {OFFICE.country}</p>
            </div>

            <div className="office__row">
                <p className="office__k">Email</p>
                <p className="office__v">
                    <a href={`mailto:${OFFICE.email}`}>{OFFICE.email}</a>
                </p>
            </div>

            {WHATSAPP_HREF && (
                <div className="office__row">
                    <p className="office__k">WhatsApp</p>
                    <p className="office__v">
                        <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
                            {OFFICE.whatsappDisplay}
                        </a>
                    </p>
                </div>
            )}

            <div className="office__row">
                <p className="office__k">Hours</p>
                <p className="office__v">{OFFICE.hours}</p>
            </div>

            {/* The way out for somebody who opened the form and would rather
                not talk to anybody yet. Losing them to a form they did not
                want to fill in costs us a scan they would have run. */}
            <div className="office__foot">
                <p className="ds-muted office__nudge">
                    Prefer to just look first? The free check needs nothing from you but a
                    website address.
                </p>
                {/* THIS DID NOTHING ON THE HOME PAGE.

                    It is a <Link to="/">, and the app scrolls to the top on
                    pathname CHANGE. Clicked from the contact section of the
                    home page the pathname is already "/", so React Router
                    re-rendered the same route, the scroll effect never fired,
                    and the arrow pointed up at a page that did not move.

                    The scan box is the whole point of the arrow, so it now
                    scrolls there itself when it is already home, and falls
                    through to ordinary navigation from /contact. */}
                <Link className="office__go" to="/" onClick={toScanBox}>
                    Run the free check ↑
                </Link>
            </div>
        </aside>
    );
}

/* Section 12 of the home page, with the prototype's own headings. The
   header's "Talk to experts" scrolls here rather than leaving the page. */
export function ContactSection() {
    return (
        <section id="contact" className="ds-section ds-wrap">
            <p className="ds-eyebrow ds-eyebrow--magenta contact__eyebrow">Talk to a person</p>
            <h2 className="ds-shout contact__h2">Tell us what is worrying you</h2>
            <div className="contact__split">
                <ContactForm />
                <OfficeCard />
            </div>
        </section>
    );
}

/* ── How it works ────────────────────────────────────────────────────── */

export function HowItWorks() {
    useDocumentMeta({
        title: "How the dShield Security Scan Works | dShield",
        description: "We read only what your servers already publish. No port scanning, no login attempts, no access to your systems. Here is exactly what we check.",
        canonical: "/how-it-works",
    });

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
                    /* Corrected. The previous wording — "never touch anything we
                       are not invited to" — was literally true and gave a false
                       impression: we do request common paths, and nobody invited
                       us to ask for /wp-config.php.bak. For a company selling
                       honesty about what it can and cannot see, a true-but-
                       misleading claim is worse than an unflattering one. */
                    ["No attempts to break in", "We never try a login, never submit input designed to make something fail, and never attempt to gain access. We do request a small number of common web paths — the sort an attacker checks first — because finding an exposed backup file or an open admin page is the point."],
                    ["No write access, ever", "Even at the highest tier, every connection to a customer's systems is read-only. A token carrying write access is refused by the code."],
                    ["No grade from a partial scan", "If too few checks complete, no score is published at all. A number built on checks that never ran is worse than no number."],
                    ["We are not invisible, and we do not pretend to be", "Our scanner identifies itself in every request and comes from a fixed address. Your security tools may log the scan, and some firewalls will block it — if that happens we stop, and say so rather than pressing on. A tool that tried to hide from your defences would be a strange thing to buy from a security company."],
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
    useDocumentMeta({
        title: "Our Scoring Formula, Published | dShield",
        description: "The formula behind every grade, what we store, and why a check that could not run never counts as a pass.",
        canonical: "/trust",
    });

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
            <p className="ds-muted">
                Every request we make identifies itself as dShield and links back to this site, so
                anyone reviewing their own logs can see exactly who we were.
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

/* ─────────────────────────────────────────────────────────────────────────
   The footer, from the prototype's section of the same name (line 1851).

   A brand column, five link columns, a legal strip, and the oversized
   outlined wordmark that signs the page off.

   EVERY LINK HERE GOES SOMEWHERE. The prototype's footer is ninety-odd
   <button> elements with a hover colour and no handler — the Platform
   column, the Services column, Compliance, Careers, Blog, and all five
   legal links included. A footer of dead links is worse than a short one:
   it is the part of a page people go to when they are looking for the terms
   or the privacy notice, and finding neither is the moment they stop
   trusting the site.

   So the columns are built from what exists. Services and Compliance are
   headings with real destinations; Careers and Blog are dropped because
   there is no careers page and no blog; Responsible Disclosure and Data
   Processing are dropped because those documents are not written. The four
   legal documents that DO exist are linked, and so is /data-request.
   ───────────────────────────────────────────────────────────────────────── */

export function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="footer">
            <div className="ds-wrap">
                <div className="footer__top">
                    <div className="footer__brand">
                        <p className="footer__mark">dShield</p>

                        {/* The full lockup: bird, wordmark and tagline in one
                            asset. It replaces the eagle-plus-typed-company-name
                            pairing that was here, which set "Dolluz Corp" in
                            Orbitron beside artwork that already says "DOLLUZ
                            CORP" in the real brand face — the same words twice,
                            in two different typefaces, six pixels apart.

                            alt carries the wordmark AND the tagline because
                            that is what the image says; a screen reader gets
                            the same sign-off a sighted reader does. */}
                        <img
                            className="footer__lockup"
                            src={lockup}
                            alt="Dolluz Corp — One Place. One Start. One Team."
                            width="3950"
                            height="994"
                        />

                        <p className="footer__line">
                            We tell you what we can see, and we are honest about what we cannot.
                        </p>

                        <div className="footer__reach">
                            <a className="footer__email" href={`mailto:${OFFICE.email}`}>
                                {OFFICE.email}
                            </a>
                            {/* Under the address, because the two together are
                                "here is how you reach us" and a number stranded
                                below the postal address reads as part of it.
                                Renders only when there is a real number — see
                                WHATSAPP_HREF in site-content.js. */}
                            {WHATSAPP_HREF && (
                                <a
                                    className="footer__wa"
                                    href={WHATSAPP_HREF}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <svg className="footer__waicon" viewBox="0 0 24 24"
                                         width="13" height="13" fill="currentColor" aria-hidden="true">
                                        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.42 1.27 4.86L2 22l5.28-1.24A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.2c-1.6 0-3.09-.47-4.34-1.28l-.31-.19-3.13.74.75-3.05-.2-.32A8.16 8.16 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2z" />
                                        <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
                                    </svg>
                                    {OFFICE.whatsappDisplay}
                                </a>
                            )}
                        </div>

                        <p className="footer__addr">
                            {OFFICE.line1}<br />{OFFICE.country}
                        </p>
                        <p className="footer__addr">{OFFICE.hours}</p>
                    </div>

                    <div className="footer__col">
                        <p className="footer__head">Platform</p>
                        {TIERS.map((t) => (
                            <Link key={t.key} to="/pricing">{t.name}</Link>
                        ))}
                    </div>

                    <div className="footer__col">
                        <p className="footer__head">Services</p>
                        {SERVICES.map((x) => (
                            <Link key={x.name} to="/services">{x.name}</Link>
                        ))}
                    </div>

                    <div className="footer__col">
                        <p className="footer__head">Smart Checks</p>
                        {/* SMART_BUILT, not SMART. The two paid tools the
                            prototype lists have no engine behind them, and a
                            footer link to a tool that does not exist is the
                            same defect as a dead button. */}
                        {SMART_BUILT.map((t) => (
                            <Link key={t.slug} to={`/tools/${t.slug}`}>{t.name}</Link>
                        ))}
                    </div>

                    <div className="footer__col">
                        <p className="footer__head">Compliance</p>
                        {COMPLIANCE.map((x) => (
                            <Link key={x.name} to="/services">{x.name}</Link>
                        ))}
                    </div>

                    <div className="footer__col">
                        <p className="footer__head">Company</p>
                        <Link to="/how-it-works">How it works</Link>
                        <Link to="/coverage">Coverage</Link>
                        <Link to="/trust">Trust</Link>
                        <Link to="/contact">Contact</Link>
                    </div>
                </div>

                <div className="footer__legal">
                    <p className="footer__copy">© {year} {OFFICE.company}. All rights reserved.</p>
                    <nav className="footer__legallinks">
                        <Link to="/legal/terms">Terms of Service</Link>
                        <Link to="/legal/privacy">Privacy Notice</Link>
                        <Link to="/legal/cookies">Cookie Notice</Link>
                        <Link to="/legal/refunds">Refund &amp; Cancellation</Link>
                        <Link to="/data-request">Your data</Link>
                    </nav>
                </div>

                <p className="ds-faint footer__note">
                    dShield assesses security posture from publicly available information. It does
                    not defend, block or remediate, and no assessment can guarantee that a system
                    is secure.
                </p>

                {/* The arcade sign-off — outlined, oversized, decorative.
                    aria-hidden because it is the word "dShield" for the fourth
                    time on this page and carries nothing a reader needs. */}
                <p className="footer__sign" aria-hidden="true">dShield</p>
            </div>
        </footer>
    );
}

/* ── 404 ─────────────────────────────────────────────────────────────── */

export function NotFound() {
    useDocumentMeta({
        title: "Page Not Found | dShield",
        description: "That page does not exist.",
        noindex: true,
    });

    return (
        <div className="ds-wrap ds-section ds-center">
            <p className="ds-eyebrow">404</p>
            <h1>That page does not exist</h1>
            <Link to="/" className="ds-btn" style={{ marginTop: 12 }}>Back to the scan</Link>
        </div>
    );
}

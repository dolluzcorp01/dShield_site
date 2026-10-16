import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import { apiGet, apiPost, apiStream } from "./utils/api";
import "./Result.css";
import { useDocumentMeta } from "./utils/meta";
import TwentyThree from "./TwentyThree";
import { OPT_IN_TEXT } from "./data/site-content";
import { Connect, WhatWeDo, SmartChecks, ServicesBlock, Compliance, Faq } from "./Sections";
import { ContactSection } from "./Pages";
import Tiers from "./Tiers";

const GRADE_WORD = {
    A: "Strong", B: "Good", C: "Mixed", D: "Weak", E: "Poor",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

/* ─────────────────────────────────────────────────────────────────────────
   "Send me a copy of this" - the lead capture, from the prototype's
   #leadoptin block (line 1320 of 01-customer-website-v5.9-FROZEN.jsx).

   IT IS HERE AND NOT IN THE HERO, WHICH IS THE WHOLE POINT. The prototype's
   comment on this block:

     Offered after the result, never before it. The scan is free and the
     result is theirs whether or not they give us an address - asking first
     would make the address the price of the check.

   The scan box used to carry an optional email field. Removing it without
   building this left the site capturing no leads at all; this closes that.

   It posts to /api/leads/notify with source 'free_scan' rather than
   re-posting to /api/scan. Re-posting would run a SECOND live scan of the
   same domain, spend the visitor's rate-limit allowance and take another
   thirty seconds to tell them something they are already looking at.
   Scan_server.js is unchanged.

   A FAILURE HERE IS NEVER SHOWN. They already have their result; this is us
   asking for an address. An error on a courtesy step reads as a broken
   product, so the thank-you renders either way and the problem goes to the
   console. That is the prototype's behaviour too, and it is the right one -
   nothing the visitor could do about it, and nothing they lose.
   ───────────────────────────────────────────────────────────────────────── */

const LEAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ScanLeadCapture({ domain, scanId }) {
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    /* UNTICKED ON LOAD - a literal false, not a prop a caller could set.
       A pre-ticked box is not consent under DPDP or GDPR, and a form that
       ships one has poisoned every contact captured before anybody noticed.

       Deliberately NOT required: the button below gates on the email alone.
       Somebody asking for a copy of their own scan result should not have to
       accept marketing to receive it. */
    const [optIn, setOptIn] = useState(false);

    const valid = LEAD_EMAIL_RE.test(email.trim());

    const send = async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        try {
            await apiPost("/api/leads/notify", {
                email: email.trim(),
                name: name.trim() || undefined,
                domain,
                scanId,
                source: "free_scan",
                marketingOptIn: optIn,
                /* The exact wording they read, sent with the tick, so the
                   record shows what was on screen rather than what we believe
                   the form said that day. Nothing is sent when the box is
                   clear - a consent record carrying wording but no tick reads
                   as consent to whoever audits it later. */
                consentText: optIn ? OPT_IN_TEXT : undefined,
            });
        } catch (err) {
            console.error("⚠️  Scan lead could not be sent:", err.message);
        } finally {
            setBusy(false);
            setSent(true);
        }
    };

    if (sent) {
        return (
            <section className="ds-wrap ds-section ds-section--tight">
                <div className="ds-card leadcap leadcap--done">
                    <p className="ds-eyebrow">On its way</p>
                    <h2 className="leadcap__title">Check your inbox</h2>
                    <p className="ds-muted leadcap__sub">
                        We have sent this result to {email.trim()}. Every message we send carries
                        an unsubscribe link, and it works.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="ds-wrap ds-section ds-section--tight">
            <form className="ds-card leadcap" onSubmit={send}>
                <p className="ds-eyebrow">Send me a copy of this</p>
                <h2 className="leadcap__title">The result above is yours either way</h2>
                <p className="ds-muted leadcap__sub">
                    This just puts it in your inbox.
                </p>

                <div className="leadcap__row">
                    <input
                        className="ds-input"
                        type="email"
                        value={email}
                        onChange={(ev) => setEmail(ev.target.value)}
                        placeholder="you@company.com"
                        aria-label="Your email address"
                        disabled={busy}
                    />
                    <input
                        className="ds-input"
                        value={name}
                        onChange={(ev) => setName(ev.target.value)}
                        placeholder="Your name (optional)"
                        aria-label="Your name, optional"
                        disabled={busy}
                    />
                </div>

                <label className={`leadcap__optin${optIn ? " is-on" : ""}`} htmlFor="leadoptin">
                    <span className="leadcap__box">
                        <input
                            id="leadoptin"
                            type="checkbox"
                            checked={optIn}
                            onChange={(ev) => setOptIn(ev.target.checked)}
                            disabled={busy}
                        />
                        {optIn && <span className="leadcap__tick" aria-hidden="true">✓</span>}
                    </span>
                    <span className="leadcap__consent">{OPT_IN_TEXT}</span>
                </label>

                <button className="ds-btn ds-btn--send leadcap__go" disabled={!valid || busy}>
                    {busy ? "Sending…" : "Send me the result"}
                </button>
            </form>
        </section>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
   A compact scan box, so a second domain does not mean going home first.

   The prototype keeps its input on screen after a scan because its result
   appears on the same page. Ours is its own route - /result/:id is
   shareable, is what the result emails link to, and carries its own
   noindex - so the page stays a page and only the box comes across.

   It streams like the home page's does, but shows no per-area progress:
   there is no grid above it to fill, and a second progress display arguing
   with the one already on the page is worse than none. Just a disabled
   button that says what is happening.
   ───────────────────────────────────────────────────────────────────────── */
function RescanBox() {
    const [domain, setDomain] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!domain.trim()) return setError("Enter a domain to scan.");
        setBusy(true);
        const res = await apiStream("/api/scan", { domain: domain.trim() });
        setBusy(false);
        if (!res.success) return setError(res.message || "The scan could not be completed.");
        setDomain("");
        navigate(`/result/${res.scanId}`, { state: { result: res.result } });
    };

    return (
        <form className="rescan" onSubmit={submit}>
            <input
                className="ds-input rescan__domain"
                placeholder="Scan another domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck="false"
                aria-label="Scan another domain"
            />
            <button className="ds-btn rescan__go" disabled={busy}>
                {busy ? "Scanning" : "Go"}
            </button>
            {error && <p className="ds-error rescan__error">{error}</p>}
        </form>
    );
}

/* Smooth-scroll to the plan bars, with the plain hash jump left intact as
   the fallback: the href is real, so the link works with JavaScript broken,
   can be opened in a new tab, and reads correctly to a screen reader.
   preventDefault only fires once we know the target is actually there. */
function toPlans(e) {
    const el = document.getElementById("plans");
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Result() {
    const { id } = useParams();
    const location = useLocation();
    // Coming straight from a scan we already have the result; a shared link
    // has to fetch it. Same document either way.
    const [result, setResult] = useState(location.state?.result || null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(!location.state?.result);

    /* noindex, and a GENERIC title with no domain in it.
       A result is an assessment of somebody else's company and often carries
       a poor grade. Letting Google index "acme.com - Grade D" would publish a
       security assessment of a third party under our name. */
    useDocumentMeta({
        title: "Scan Result | dShield",
        description: "A dShield free security scan result.",
        noindex: true,
    });

    useEffect(() => {
        if (result) return;
        (async () => {
            const res = await apiGet(`/api/scan/${id}`);
            setLoading(false);
            if (!res.success) return setError(res.message || "That scan could not be found.");
            setResult(res.result);
        })();
    }, [id, result]);

    if (loading) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <span className="ds-spin" style={{ margin: "0 auto" }} />
                <p className="ds-muted" style={{ marginTop: 16 }}>Loading that result…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <h2>We could not open that result</h2>
                <p className="ds-muted">{error}</p>
                <Link to="/" className="ds-btn" style={{ marginTop: 16 }}>Run a new scan</Link>
            </div>
        );
    }

    /* An inconclusive scan gets no grade at all.
       This is not a degraded case to paper over - it is the rule. In earlier
       testing of the main engine, a scan where every check errored reported
       grade A, score 100, zero findings, because with nothing running there
       was nothing left to fail. A customer behind a firewall would have been
       told they were secure. Saying "we could not measure this" is the only
       honest output, and it is the product's whole argument. */
    if (result.status === "inconclusive") {
        /* A blocked scan and a slow one look the same in the numbers and are
           completely different to the reader. If a firewall identified us and
           stopped answering, say so - that is their protection working, not a
           fault on either side, and it has a different remedy. */
        const wasBlocked = (result.inconclusive || []).some((i) =>
            /stopped responding|scanning was stopped/i.test(i.reason || ""));

        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card inconclusive">
                    <p className="ds-eyebrow">No grade issued</p>
                    {wasBlocked ? (
                        <>
                            <h2>{result.domain} stopped responding to us partway through.</h2>
                            <p className="ds-muted">
                                This usually means a firewall or security service identified the scan
                                and blocked it - which is your protection working. We stopped rather
                                than pressing on. Trying again in an hour usually succeeds, and if you
                                own this domain you can allow our scanner instead.
                            </p>
                            <p className="ds-muted">
                                {result.checksCompleted} of {result.checksRun} checks completed before
                                that happened. We will not publish a score from a partial scan.
                            </p>
                        </>
                    ) : (
                        <>
                            <h2>We could not see enough of {result.domain} to grade it.</h2>
                            <p className="ds-muted">
                                Only {result.checksCompleted} of {result.checksRun} checks completed. We
                                will not publish a score from a partial scan, because a number built on
                                checks that never ran would tell you that you are safe when what actually
                                happened is that we could not look.
                            </p>
                        </>
                    )}
                    {result.inconclusive?.length > 0 && (
                        <ul className="inconclusive__list">
                            {result.inconclusive.map((i) => (
                                <li key={i.checkId}>
                                    <strong>{i.title}</strong>
                                    <span className="ds-faint"> - {i.reason}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {/* Only for the ordinary case - the blocked wording above
                        already explains itself, and repeating it would read as
                        though we had not understood our own result. */}
                    {!wasBlocked && (
                        <p className="ds-muted">
                            This usually means a firewall is blocking us, the domain is behind a
                            service that refuses unknown clients, or DNS is slow to answer. Trying
                            again in a few minutes often works.
                        </p>
                    )}
                    <Link to="/" className="ds-btn">Try again</Link>
                </div>
            </div>
        );
    }

    /* WHAT WE ACTUALLY MEASURED, not what we set out to measure.

       coverageMap.filter(d => d.scanned) counts the domains this tier
       ATTEMPTS - a fixed five, always. domainScores holds the ones that
       produced a number, which is a smaller set whenever a check could not
       run: a scan of dolluzcorp.com attempts five and scores four, because
       crt.sh answered 404 and domain 10 was excluded from the grade.

       Counting attempts and calling them measurements is the same mistake
       the old coverage grid below made. The sentence a customer reads has to
       be the true one, so `scanned` is derived from results, and the ones
       that were tried and failed get counted and named separately. */
    const total = result.coverageMap.length;
    const scanned = Object.keys(result.domainScores || {}).length;
    const attempted = result.coverageMap.filter((d) => d.scanned).length;
    const unreachable = attempted - scanned;
    const unscanned = total - attempted;
    /* pct describes `unscanned` and nothing else - the areas no outside scan
       can reach. Deriving it from `scanned` instead would fold the
       unreachable ones in and quietly disagree with the number printed
       beside it. */
    const pct = Math.round((unscanned / total) * 100);

    return (
        <div className="result">
            <section className="ds-wrap result__head">
                <RescanBox />
                <p className="ds-eyebrow">Free scan · {new Date(result.scannedAt).toLocaleDateString()}</p>
                <h1 className="result__domain">{result.domain}</h1>

                <div className="result__summary">
                    <div className={`gradecard gradecard--${result.grade}`}>
                        <div className="gradecard__letter">{result.grade}</div>
                        <div className="gradecard__meta">
                            <div className="gradecard__word">{GRADE_WORD[result.grade]}</div>
                            <div className="ds-faint">{result.score} / 100</div>
                        </div>
                    </div>

                    <div className="counts">
                        {SEVERITY_ORDER.map((sev) => (
                            <div className="counts__item" key={sev}>
                                <div className={`counts__n counts__n--${sev}`}>{result.counts[sev]}</div>
                                <div className="counts__label">{sev}</div>
                            </div>
                        ))}
                        <div className="counts__item">
                            <div className="counts__n counts__n--pass">{result.passedCount}</div>
                            <div className="counts__label">passed</div>
                        </div>
                    </div>
                </div>

                {result.capped && (
                    <div className="ds-note result__cap">
                        The grade is capped at {result.grade} because of {result.capReason}. A
                        single critical issue is enough to undo otherwise good hygiene, so we do
                        not average it away.
                    </div>
                )}

                {result.inconclusive?.length > 0 && (
                    <p className="ds-faint result__incon">
                        {result.inconclusive.length} check
                        {result.inconclusive.length > 1 ? "s" : ""} could not complete and{" "}
                        {result.inconclusive.length > 1 ? "were" : "was"} excluded from the score
                        rather than counted as a pass.
                    </p>
                )}
            </section>

            {/* What we found - counts and areas only. No titles, no evidence.
                The paywall is enforced on the server: withheld detail is never
                sent to the browser, so it cannot be read out of the page. */}
            <section className="ds-wrap ds-section ds-section--tight">
                <h2>What we found</h2>
                <p className="ds-lead" style={{ marginBottom: 26 }}>
                    {result.totalIssues === 0
                        ? "Nothing failed in the five areas a free scan can measure. That is a good result, and it covers a fifth of the picture."
                        : `${result.totalIssues} issue${result.totalIssues > 1 ? "s" : ""} across the areas below. The free scan shows where and how serious. What each one is, and what to do about it, is in the paid report.`}
                </p>

                <div className="ds-grid ds-grid--2">
                    {Object.entries(result.domainScores).map(([no, d]) => (
                        <div className="ds-card domainrow" key={no}>
                            <div className="domainrow__top">
                                <h3>{d.name}</h3>
                                <span className={`domainrow__score ${d.score >= 75 ? "is-ok" : d.score >= 50 ? "is-mid" : "is-bad"}`}>
                                    {d.score}
                                </span>
                            </div>
                            <div className="domainrow__bar">
                                <span style={{ width: `${d.score}%` }} />
                            </div>
                            <p className="ds-faint" style={{ margin: "10px 0 0" }}>
                                {d.findings === 0
                                    ? "No issues found here."
                                    : `${d.findings} issue${d.findings > 1 ? "s" : ""} found.`}
                            </p>
                        </div>
                    ))}
                </div>

                {result.totalIssues > 0 && (
                    <div className="locked">
                        <div className="locked__icon" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
                                <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.7" />
                            </svg>
                        </div>
                        <div>
                            <strong>The detail is not in this page.</strong>
                            <p className="ds-muted" style={{ margin: "6px 0 0" }}>
                                Not hidden in the source, not greyed out - never sent. Each finding
                                names the exact host, file or record, what an attacker could do with
                                it, and the steps to close it.
                            </p>
                        </div>
                    </div>
                )}
            </section>

            {/* The coverage map - the entire commercial argument, and the
                reason the free scan is worth giving away. */}
            <section className="ds-wrap ds-section ds-section--tight">
                <p className="ds-eyebrow">Coverage</p>
                <h2>What this score does not tell you</h2>
                <p className="ds-lead" style={{ marginBottom: 26 }}>
                    We measured {scanned} of 23 risk domains
                    {unreachable > 0 && (
                        <>
                            {" "}and could not reach {unreachable} more that we tried
                        </>
                    )}. The other {unscanned} - {pct}% of what determines whether an incident
                    becomes a crisis - cannot be seen from outside by anyone, including us.
                </p>

                {/* THIS USED TO SAY "Measured" FOR A DOMAIN NOTHING MEASURED.

                    The old grid here rendered coverageMap with two states and
                    labelled them "Measured" / "Assessment required":

                        {d.scanned ? "Measured" : "Assessment required"}

                    coverageMap is ALL_DOMAINS - a static list where 1, 4, 6,
                    10 and 20 are permanently scanned:true. It records which
                    domains the tier ATTEMPTS, not which ones returned an
                    answer. So a scan of dolluzcorp.com printed "Measured" for
                    domain 10, whose only snapshot check is BREACH-METADATA-55
                    and whose actual result was "crt.sh returned HTTP 404" -
                    recorded inconclusive and excluded from the grade.

                    An inconclusive check shown as measured is the rule this
                    product exists to hold. It was also visibly inconsistent:
                    the domain rows above come from domainScores, which drops
                    domain 10 correctly, so the page showed four scored areas
                    and five marked Measured.

                    TwentyThree reads coverageMap, domainScores and
                    inconclusive together and can tell the three cases apart.
                    It is the same component the home page renders in its idle
                    state, so the two cannot drift. */}
                <TwentyThree result={result} />
            </section>

            <ScanLeadCapture domain={result.domain} scanId={id} />

            {/* ─────────────────────────────────────────────────────────────
                THE NUDGE. One line, and it replaces a card.

                What stood here was a "What happens next" panel carrying three
                buttons and a hardcoded sentence reading "Paid reports are not
                on sale yet". That sentence was a lie waiting to happen: the
                button beside it was driven by a live canBuy flag from the
                server, so the moment payments opened the card would offer
                "Get the full report" directly underneath a paragraph telling
                the reader they could not buy one.

                /pricing already carries that message, driven by the same
                server flag rather than typed into the JSX, so it cannot fall
                out of step. Deleting the duplicate removes the contradiction
                and the extra request that fed it.

                What the prototype does at this point in the flow is simply
                point downward: the page continues into the plan bars, the
                eighteen unreachable areas and the contact form, and the one
                thing a reader needs is to be told to keep going. A person who
                has just been handed a grade is reading, not deciding.
                ───────────────────────────────────────────────────────────── */}
            <p className="ds-wrap nudge">
                <a className="nudge__link" href="#plans" onClick={toPlans}>
                    ↓ Full report and what else we can do, below
                </a>
            </p>

            {/* THE PAGE CONTINUES BELOW THE RESULT.

                It used to stop here and drop straight into the footer, so
                somebody who had just been shown eighteen dark tiles scrolled
                down and found nothing - the moment they are most likely to
                want to know what is in those tiles.

                The prototype does not end after a result either: CONNECT and
                TIERS appear only once a scan has run (its `phase === "done"`
                gate), and the rest of the page follows. This route is the
                equivalent of that state, so it carries the same run of
                sections, from the same components the home page uses. */}
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

export default Result;

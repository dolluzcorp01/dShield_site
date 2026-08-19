import React, { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { apiGet } from "./utils/api";
import "./Result.css";
import { useDocumentMeta } from "./utils/meta";

const GRADE_WORD = {
    A: "Strong", B: "Good", C: "Mixed", D: "Weak", E: "Poor",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function Result() {
    const { id } = useParams();
    const location = useLocation();
    // Coming straight from a scan we already have the result; a shared link
    // has to fetch it. Same document either way.
    const [result, setResult] = useState(location.state?.result || null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(!location.state?.result);
    const [canBuy, setCanBuy] = useState(false);

    /* noindex, and a GENERIC title with no domain in it.
       A result is an assessment of somebody else's company and often carries
       a poor grade. Letting Google index "acme.com — Grade D" would publish a
       security assessment of a third party under our name. */
    useDocumentMeta({
        title: "Scan Result | dShield",
        description: "A dShield free security scan result.",
        noindex: true,
    });

    // Is anything actually on sale? The server decides; the page only asks.
    useEffect(() => {
        (async () => {
            const res = await apiGet("/api/leads/pricing");
            if (res.success) setCanBuy((res.plans || []).some((p) => p.available && p.key === "advanced"));
        })();
    }, []);

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
       This is not a degraded case to paper over — it is the rule. In earlier
       testing of the main engine, a scan where every check errored reported
       grade A, score 100, zero findings, because with nothing running there
       was nothing left to fail. A customer behind a firewall would have been
       told they were secure. Saying "we could not measure this" is the only
       honest output, and it is the product's whole argument. */
    if (result.status === "inconclusive") {
        /* A blocked scan and a slow one look the same in the numbers and are
           completely different to the reader. If a firewall identified us and
           stopped answering, say so — that is their protection working, not a
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
                                and blocked it — which is your protection working. We stopped rather
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
                                    <span className="ds-faint"> — {i.reason}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {/* Only for the ordinary case — the blocked wording above
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

    const scanned = result.coverageMap.filter((d) => d.scanned).length;
    const unscanned = result.coverageMap.length - scanned;
    const pct = Math.round((unscanned / result.coverageMap.length) * 100);

    return (
        <div className="result">
            <section className="ds-wrap result__head">
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

            {/* What we found — counts and areas only. No titles, no evidence.
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
                                Not hidden in the source, not greyed out — never sent. Each finding
                                names the exact host, file or record, what an attacker could do with
                                it, and the steps to close it.
                            </p>
                        </div>
                    </div>
                )}
            </section>

            {/* The coverage map — the entire commercial argument, and the
                reason the free scan is worth giving away. */}
            <section className="ds-wrap ds-section ds-section--tight">
                <p className="ds-eyebrow">Coverage</p>
                <h2>What this score does not tell you</h2>
                <p className="ds-lead" style={{ marginBottom: 26 }}>
                    We measured {scanned} of 23 risk domains. The other {unscanned} — {pct}% of
                    what determines whether an incident becomes a crisis — cannot be seen from
                    outside by anyone, including us.
                </p>

                <div className="covermap">
                    {result.coverageMap.map((d) => (
                        <div key={d.no} className={`covertile ${d.scanned ? "is-scanned" : "is-dark"}`}>
                            <span className="covertile__no ds-mono">{String(d.no).padStart(2, "0")}</span>
                            <span className="covertile__name">{d.name}</span>
                            <span className="covertile__state">
                                {d.scanned ? "Measured" : "Assessment required"}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="ds-wrap ds-section">
                <div className="ds-card nextstep">
                    <h2>What happens next</h2>
                    <p className="ds-muted">
                        Paid reports are not on sale yet — our payment onboarding is still in
                        progress. Leave your address on the pricing page and we will write the
                        moment they open, or talk to us now if you would rather move sooner.
                    </p>
                    <div className="nextstep__actions">
                        {/* Carry the domain they just scanned into checkout, so
                            nobody has to type it a second time. Falls back to
                            /pricing until a tier is actually buyable. */}
                        {canBuy
                            ? <Link to={`/checkout?tier=advanced&domain=${encodeURIComponent(result.domain)}`} className="ds-btn">Get the full report</Link>
                            : <Link to="/pricing" className="ds-btn">See what a full report covers</Link>}
                        {/* Somebody who has just been shown 18 dark tiles is the most
                            likely person on the site to want to know what is in them. */}
                        <Link to="/coverage" className="ds-btn ds-btn--ghost">What the other 18 cover</Link>
                        <Link to="/contact" className="ds-btn ds-btn--ghost">Talk to us</Link>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default Result;

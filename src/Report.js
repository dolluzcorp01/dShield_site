import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet } from "./utils/api";
import { useDocumentMeta } from "./utils/meta";
import "./Report.css";

/* ─────────────────────────────────────────────────────────────────────────
   The paid report.

   Renders whatever the server put in the report object and nothing more.
   THE PAYWALL IS NOT DECIDED HERE — report_builder.js decides it, and this
   page simply shows what arrived. A tier that did not pay for remediation
   does not receive it in the response, so there is nothing here to hide.

   Report.css carries a print stylesheet: Ctrl+P is the interim answer for
   customers who want a file until PDF export exists.
   ───────────────────────────────────────────────────────────────────────── */

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];
const GRADE_WORD = { A: "Strong", B: "Good", C: "Mixed", D: "Weak", E: "Poor" };

function Report() {
    const { token } = useParams();
    const [state, setState] = useState({ loading: true, report: null, error: "", expired: false });

    useDocumentMeta({ title: "Your dShield report", description: "A dShield security assessment report.", noindex: true });

    useEffect(() => {
        (async () => {
            const res = await apiGet(`/api/reports/${token}`);
            if (!res.success) {
                return setState({ loading: false, report: null, error: res.message || "That report could not be opened.", expired: !!res.expired });
            }
            setState({ loading: false, report: res.report, error: "", expired: false, expiresAt: res.expiresAt });
        })();
    }, [token]);

    if (state.loading) {
        return <div className="ds-wrap ds-section ds-center"><span className="ds-spin" style={{ margin: "0 auto" }} /></div>;
    }

    if (state.error) {
        /* An expired link belongs to a PAYING CUSTOMER, not an intruder. Say
           what happened and how to get a new one. */
        return (
            <div className="ds-wrap ds-section ds-center">
                <h2>{state.expired ? "This report link has expired" : "We could not open that report"}</h2>
                <p className="ds-muted" style={{ maxWidth: 520, margin: "0 auto" }}>{state.error}</p>
                <Link to="/contact" className="ds-btn" style={{ marginTop: 18 }}>Ask us for a fresh link</Link>
            </div>
        );
    }

    const r = state.report;
    const findings = r.findings || [];
    const hasRemediation = findings.some((f) => f.remediation);

    return (
        <div className="ds-wrap ds-section report">
            <header className="report__head">
                <p className="ds-eyebrow">
                    {r.tier === "basic" ? "Basic report" : r.tier === "advanced" ? "Advanced report" : "Full Protection report"}
                    {" · "}{new Date(r.scannedAt).toLocaleDateString()}
                </p>
                <h1>{r.domain}</h1>

                <div className="report__summary">
                    <div className={`gradecard gradecard--${r.grade}`}>
                        <div className="gradecard__letter">{r.grade}</div>
                        <div className="gradecard__meta">
                            <div className="gradecard__word">{GRADE_WORD[r.grade]}</div>
                            <div className="ds-faint">{r.score} / 100</div>
                        </div>
                    </div>
                    <div className="counts">
                        {SEVERITY_ORDER.map((s) => (
                            <div className="counts__item" key={s}>
                                <div className={`counts__n counts__n--${s}`}>{r.counts?.[s] ?? 0}</div>
                                <div className="counts__label">{s}</div>
                            </div>
                        ))}
                        <div className="counts__item">
                            <div className="counts__n counts__n--pass">{r.passedCount}</div>
                            <div className="counts__label">passed</div>
                        </div>
                    </div>
                </div>

                {r.capped && (
                    <div className="ds-note">
                        The grade is capped at {r.grade} because of {r.capReason}. A single critical issue is
                        enough to undo otherwise good hygiene, so we do not average it away.
                    </div>
                )}

                <button className="ds-btn ds-btn--ghost report__print" onClick={() => window.print()}>
                    Print or save as PDF
                </button>
            </header>

            {/* ── the roadmap, advanced only ─────────────────────────── */}
            {r.roadmap?.length > 0 && (
                <section className="report__section">
                    <h2>What to do, in order</h2>
                    <p className="ds-lead">
                        {r.effortTotalHours} hours of hands-on work in total. Within each band the heaviest
                        findings come first, and the cheapest of those first again.
                    </p>
                    {r.roadmap.map((band) => (
                        <div className="ds-card band" key={band.key}>
                            <div className="band__head">
                                <h3>{band.label}</h3>
                                <span className="ds-faint">{band.count} finding{band.count > 1 ? "s" : ""} · {band.totalHours}h</span>
                            </div>
                            <p className="ds-muted band__blurb">{band.blurb}</p>
                            <ol className="band__list">
                                {band.items.map((i) => (
                                    <li key={i.checkId}>
                                        <span className={`sev sev--${i.severity}`}>{i.severity}</span>
                                        <a href={`#${i.checkId}`}>{i.title}</a>
                                        <span className="ds-faint"> — {i.effortHours}h · {i.skill}</span>
                                    </li>
                                ))}
                            </ol>
                            {band.notes?.length > 0 && (
                                <ul className="band__notes">
                                    {band.notes.map((n) => <li key={n.checkId} className="ds-faint">{n.note}</li>)}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {/* ── findings ──────────────────────────────────────────── */}
            {findings.length > 0 && (
                <section className="report__section">
                    <h2>What we found</h2>
                    {findings.map((f) => (
                        <article className="ds-card finding" id={f.checkId} key={f.checkId}>
                            <div className="finding__head">
                                <span className={`sev sev--${f.severity}`}>{f.severity}</span>
                                <h3>{f.title}</h3>
                            </div>
                            <p className="ds-faint finding__id ds-mono">{f.checkId}</p>

                            {f.evidence && (
                                <div className="finding__evidence">
                                    <span className="finding__label">What we saw</span>
                                    <p>{f.evidence}</p>
                                </div>
                            )}

                            {f.finding && <p className="finding__body">{f.finding}</p>}

                            {f.impact && (
                                <div className="finding__block">
                                    <span className="finding__label">Why it matters</span>
                                    <p>{f.impact}</p>
                                </div>
                            )}

                            {f.remediation && (
                                <div className="finding__block finding__fix">
                                    <span className="finding__label">How to fix it</span>
                                    <p className="finding__summary">{f.remediation.summary}</p>
                                    <ol>
                                        {f.remediation.steps.map((s, i) => <li key={i}>{s}</li>)}
                                    </ol>
                                    <p className="finding__verify">
                                        <strong>How to confirm it is fixed:</strong> {f.remediation.verification}
                                    </p>
                                    <p className="ds-faint finding__effort">
                                        About {f.effortHours} hours · {f.skill}
                                        {f.effortNote ? ` — ${f.effortNote}` : ""}
                                    </p>
                                </div>
                            )}
                        </article>
                    ))}
                </section>
            )}

            {/* Basic buys the findings; the fixes are the next tier up. Said
                plainly rather than shown greyed out. */}
            {!hasRemediation && findings.length > 0 && (
                <section className="report__section">
                    <div className="ds-card upsell">
                        <h3>How to fix these</h3>
                        <p className="ds-muted">
                            This report names every finding and the evidence behind it. Step-by-step remediation,
                            the effort each takes and a prioritised roadmap are part of the Advanced report.
                        </p>
                        <Link to="/pricing" className="ds-btn ds-btn--sm">See what Advanced adds</Link>
                    </div>
                </section>
            )}

            {/* ── what could not be measured ────────────────────────── */}
            {r.inconclusive?.length > 0 && (
                <section className="report__section">
                    <h2>What we could not measure</h2>
                    <p className="ds-lead">
                        These checks did not complete. They are excluded from your score entirely rather than
                        counted as passes — a number built on checks that never ran would tell you that you are
                        safe when what actually happened is that we could not look.
                    </p>
                    <ul className="incon__list">
                        {r.inconclusive.map((i) => (
                            <li key={i.checkId}>
                                <strong>{i.title}</strong>
                                <span className="ds-faint"> — {i.reason}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* ── coverage ──────────────────────────────────────────── */}
            {r.coverageMap?.length > 0 && (
                <section className="report__section">
                    <h2>What a scan cannot reach</h2>
                    <p className="ds-lead">
                        We measured {r.coverageMap.filter((d) => d.scanned).length} of {r.coverageMap.length} risk
                        domains. The rest cannot be seen from outside by anyone, including us.
                    </p>
                    <div className="covermap">
                        {r.coverageMap.map((d) => (
                            <div key={d.no} className={`covertile ${d.scanned ? "is-scanned" : "is-dark"}`}>
                                <span className="covertile__no ds-mono">{String(d.no).padStart(2, "0")}</span>
                                <span className="covertile__name">{d.name}</span>
                                <span className="covertile__state">{d.scanned ? "Measured" : "Assessment required"}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <footer className="report__foot ds-faint">
                dShield by Dolluz Corp · This report describes what was observable at the time of the scan.
                It does not defend, block or remediate, and no assessment can guarantee that a system is secure.
            </footer>
        </div>
    );
}

export default Report;

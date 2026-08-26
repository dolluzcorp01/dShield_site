import React from "react";
import { Link } from "react-router-dom";
import { Reveal } from "./Motion";
import {
    PROOF, CONNECT_DOMAINS, SMART, SMART_BUILT,
    SERVICES_LEFT, SERVICES_RIGHT, COMPLY_LEFT, COMPLY_RIGHT, FAQ,
} from "./data/site-content";
import "./Sections.css";

/* ─────────────────────────────────────────────────────────────────────────
   The content sections of the home page, ported from the frozen prototype:

     WhatWeDo      its "WHAT WE DO" (line 1507) plus the PROOF figures
     Connect       "CONNECT"        (1390)
     SmartChecks   "SPOT CHECKS"    (1534)
     ServicesBlock "SERVICES"       (1568)
     Compliance    "COMPLIANCE"     (1611)
     Faq           "FAQ"            (1651)

   The copy is the prototype's, sentence for sentence. What changed is the
   plumbing: these are components in one file rather than inline JSX inside a
   1,954-line function, the tables come from data/site-content.js so the
   standalone routes render the same words, and the hover states are CSS
   rather than the prototype's onMouseEnter/onMouseLeave handlers writing to
   element.style — which never fire for a keyboard user, so the cards it
   applies them to had no focus appearance at all.
   ───────────────────────────────────────────────────────────────────────── */

/* ── WHAT WE DO ──────────────────────────────────────────────────────────
   The four PROOF figures sit under it. They are checkable claims, which is
   the point — 58 and 23 are asserted against the real catalogue by
   scripts/verify-site-content.mjs, so this block cannot drift away from the
   engine without the verifier failing. */
export function WhatWeDo() {
    return (
        <section id="what-we-do" className="ds-section ds-wrap sec">
            <Reveal>
                <h2 className="ds-shout sec__h2">
                    We tell you what we can see —<br />and what we cannot
                </h2>
                <p className="ds-lead sec__lead">
                    Most security reports give you a number and let you assume it covers
                    everything. Ours does the opposite. Every report carries a section titled
                    <em className="sec__em"> “What this does not tell you”</em>, because a score
                    you trust is worth more than a score you like.
                </p>
            </Reveal>

            <div className="proof">
                {PROOF.map((x, i) => (
                    <Reveal key={x.label} delay={i * 60}>
                        <div className="proof__cell">
                            <div className="proof__big">{x.big}</div>
                            <div className="proof__label">{x.label}</div>
                            <p className="ds-muted proof__sub">{x.sub}</p>
                        </div>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

/* ── CONNECT ─────────────────────────────────────────────────────────────
   In the prototype this section renders only after a scan finishes. On the
   home page there is no scan to finish, so it stands on its own — it is an
   argument about the eighteen areas a scan cannot reach, and that argument
   is true before anybody types a domain. */
export function Connect() {
    return (
        <section id="connect-more" className="ds-section ds-wrap sec">
            <Reveal>
                <h2 className="ds-shout sec__h2">
                    Six of the eighteen<br />open in two minutes
                </h2>
                <p className="ds-lead sec__lead">
                    You give us read-only access to something you already use — the same way you
                    add any app. You approve it on Microsoft’s screen, not ours. We never see
                    your password, and you can cut us off whenever you like.
                </p>
            </Reveal>

            <div className="conn">
                {CONNECT_DOMAINS.map((d, i) => (
                    <Reveal key={d.n} delay={i * 65}>
                        <div className="conn__card">
                            <p className="conn__tool">{d.tool.toUpperCase()}</p>
                            <h3 className="conn__name">{d.name}</h3>
                            <p className="ds-muted conn__hides">We cannot tell you {d.hides}.</p>
                        </div>
                    </Reveal>
                ))}
            </div>

            <Reveal delay={110}>
                <div className="conn__twice">
                    <strong className="conn__twice-lead">We check twice.</strong> The first time
                    we are guessing from the street. The second time, with your systems
                    connected, we are not — and your report stops saying{" "}
                    <em className="ds-faint">“you told us it’s partly done”</em> and starts
                    saying <strong>“four of your six administrators have no second step to log
                    in.”</strong>
                </div>
            </Reveal>
        </section>
    );
}

/* ── SPOT CHECKS ─────────────────────────────────────────────────────────

   THE PROTOTYPE LISTS SEVEN AND LINKS NONE OF THEM. Its cards are buttons
   with a hover effect and no handler — including the two paid ones, which
   have no engine behind them anywhere in this repository.

   Here the five built tools link to their pages. The two unbuilt ones are
   rendered as plainly unavailable rather than as buttons that do nothing:
   a card that looks clickable and is not reads as a broken site, and a card
   that takes money for a check nothing performs is the fifty-connectors
   defect in miniature.

   SMART_BUILT is derived in site-content.js, so a tool cannot reach a
   customer by being forgotten in a list. */
export function SmartChecks() {
    const unbuilt = SMART.filter((t) => !t.built);

    return (
        <section id="smart-checks" className="ds-section ds-wrap sec">
            <Reveal>
                <p className="ds-eyebrow">Smart Checks</p>
                <h2 className="ds-shout sec__h2">One worry at a time</h2>
            </Reveal>

            <div className="smart">
                {SMART_BUILT.map((s, i) => (
                    <Reveal key={s.slug} delay={i * 50}>
                        <Link className="smart__card" to={`/tools/${s.slug}`}>
                            <span className="smart__name">{s.name}</span>
                            <span className="smart__price">{s.price}</span>
                        </Link>
                    </Reveal>
                ))}
            </div>

            {unbuilt.length > 0 && (
                <p className="ds-faint smart__soon">
                    {unbuilt.map((t) => t.name).join(" · ")} — {unbuilt.length === 1 ? "is" : "are"}{" "}
                    not built yet. When {unbuilt.length === 1 ? "it is" : "they are"}, {unbuilt.length === 1 ? "it" : "they"}{" "}
                    will appear here and not before.
                </p>
            )}
        </section>
    );
}

/* ── SERVICES ────────────────────────────────────────────────────────────
   Two columns, and the split carries meaning: the left is what we run
   continuously, the right is what we do when something needs proving or has
   already gone wrong. */
export function ServicesBlock() {
    return (
        <section id="services" className="ds-section ds-wrap sec">
            <Reveal>
                <h2 className="ds-shout sec__h2">When the report is not enough</h2>
                <p className="ds-lead sec__lead">
                    The platform is the first column. Everything to the right is people — our
                    engineers, on your side of the problem.
                </p>
            </Reveal>

            <div className="two">
                {[["Running", SERVICES_LEFT], ["When it matters", SERVICES_RIGHT]].map(([label, items], ci) => (
                    <div className="two__col" key={label}>
                        <p className={`two__label${ci ? " two__label--alt" : ""}`}>{label}</p>
                        {items.map((s, i) => (
                            <Reveal key={s.name} delay={i * 45}>
                                <div className={`two__row${s.platform ? " two__row--platform" : ""}`}>
                                    <h3 className="two__name">{s.name}</h3>
                                    <p className="ds-muted two__note">{s.note}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                ))}
            </div>

            <Link className="ds-btn ds-btn--ghost sec__more" to="/services">
                All eight services →
            </Link>
        </section>
    );
}

/* ── COMPLIANCE ──────────────────────────────────────────────────────────
   Left is the certifiable standards, right the privacy and reporting
   regimes. Same logic as the services split. */
export function Compliance() {
    return (
        <section id="compliance" className="ds-section ds-wrap sec">
            <Reveal>
                <h2 className="ds-shout sec__h2">
                    The frameworks your clients<br />will ask you about
                </h2>
                <p className="ds-lead sec__lead">
                    Certification is rarely the real goal — winning the contract is. We get you
                    through the audit and keep you there between them.
                </p>
            </Reveal>

            <div className="two">
                {[["Standards", COMPLY_LEFT], ["Data & privacy", COMPLY_RIGHT]].map(([label, items], ci) => (
                    <div className="two__col" key={label}>
                        <p className={`two__label${ci ? " two__label--alt" : ""}`}>{label}</p>
                        {items.map((s, i) => (
                            <Reveal key={s.name} delay={i * 45}>
                                <div className="two__row">
                                    <h3 className="two__name">{s.name}</h3>
                                    <p className="ds-muted two__note">{s.note}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                ))}
            </div>
        </section>
    );
}

/* ── FAQ ─────────────────────────────────────────────────────────────────

   The prototype builds this from a button plus a conditionally-rendered div
   and no ARIA at all, so a screen reader is told nothing about what the
   button does or whether the answer is showing.

   <details>/<summary> is the same interaction with the semantics already
   attached, keyboard behaviour included, and it stays open when the page is
   printed — which matters, because Ctrl+P is currently how a customer gets
   a file out of the report. */
export function Faq() {
    return (
        <section id="faq" className="ds-section ds-wrap sec">
            <Reveal>
                <p className="ds-eyebrow">Straight answers</p>
                <h2 className="ds-shout sec__h2">The things people ask first</h2>
            </Reveal>

            <div className="faq">
                {FAQ.map((f, i) => (
                    <Reveal key={f.q} delay={i * 50}>
                        <details className="faq__item">
                            <summary className="faq__q">{f.q}</summary>
                            <p className="faq__a ds-muted">{f.a}</p>
                        </details>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

/* Kept for the rare case where a page wants the whole run in the frozen
   file's order. Home composes them individually so it can put the tile grid
   between the hero and the rest. */
export default function Sections() {
    return (
        <>
            <Connect />
            <WhatWeDo />
            <SmartChecks />
            <ServicesBlock />
            <Compliance />
            <Faq />
        </>
    );
}

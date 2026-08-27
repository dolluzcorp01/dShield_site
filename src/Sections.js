import React from "react";
import { Link } from "react-router-dom";
import { Reveal } from "./Motion";
import {
    PROOF, CONNECT_DOMAINS, SMART,
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
                <p className="ds-eyebrow">What we do</p>
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
                <p className="ds-eyebrow ds-eyebrow--magenta">The part nobody shows you first</p>
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

   All seven are cards here too, so the grid matches the prototype. What
   differs is what a card IS. The five built tools are links to their tool
   pages. The two unbuilt ones are plain divs: dimmed, no hover lift, no
   pointer, and outside the tab order because a div with no handler and no
   tabindex simply is — nothing to click, nothing to tab to, nothing to buy.
   Their badge carries "SOON" and the price is not rendered at all, so no
   figure on those two cards reads as a thing you can pay for today.

   A card that looks clickable and is not reads as a broken site, and a card
   that takes money for a check nothing performs is the fifty-connectors
   defect in miniature.

   Which of the two a tool gets is derived from `built` in
   data/site-content.js, never written out here, so a tool cannot reach a
   customer as a buyable card by being forgotten in a list. */
export function SmartChecks() {
    return (
        <section id="smart-checks" className="ds-section ds-wrap sec">
            <Reveal>
                <p className="ds-eyebrow">Smart Checks</p>
                <h2 className="ds-shout sec__h2">One worry at a time</h2>
            </Reveal>

            <div className="smart">
                {SMART.map((s, i) => (
                    <Reveal key={s.slug} delay={i * 50}>
                        {s.built ? (
                            <Link className="smart__card" to={`/tools/${s.slug}`}>
                                <span className="smart__name">{s.name}</span>
                                <span className="smart__price">{s.price}</span>
                            </Link>
                        ) : (
                            /* No aria-disabled: it is not a control, and on a
                               generic div assistive tech drops it. "SOON" in
                               the badge is read out with the name, which is
                               the same sentence the dimming tells everyone
                               else. */
                            <div className="smart__card smart__card--soon">
                                <span className="smart__name">{s.name}</span>
                                <span className="smart__price">SOON</span>
                            </div>
                        )}
                    </Reveal>
                ))}
            </div>
        </section>
    );
}

/* ── SERVICES ────────────────────────────────────────────────────────────
   Two columns, and the split carries meaning: the left is what we run
   continuously, the right is what we do when something needs proving or has
   already gone wrong. */
export function ServicesBlock() {
    /* One flat run of eight, laid out two-up. The prototype numbers them
       01–08 straight through, which only works if the left and right halves
       are cells of ONE grid rather than two independent lists — numbering
       per column would restart at 01 halfway across the row. */
    const all = [...SERVICES_LEFT, ...SERVICES_RIGHT];

    return (
        <section id="services" className="ds-section ds-wrap sec">
            <Reveal>
                <p className="ds-eyebrow">Services</p>
                <h2 className="ds-shout sec__h2">When the report is not enough</h2>
                <p className="ds-lead sec__lead">
                    The platform is the first card. Everything after it is people — our
                    engineers, on your side of the problem.
                </p>
            </Reveal>

            <div className="svc2">
                {all.map((s, i) => (
                    <Reveal key={s.name} delay={i * 65}>
                        {/* A real destination, not the prototype's <button> with a
                            hover effect and no handler. The platform card goes to
                            the scan at the top of this page; every other card
                            carries its slug into the enquiry form, which then
                            names the service instead of asking the person to find
                            it a second time in a dropdown. */}
                        <Link
                            className={`svc${s.platform ? " svc--platform" : ""}`}
                            to={s.platform ? "/" : `/contact?topic=${s.slug}`}
                        >
                            <span className="svc__no">
                                {String(i + 1).padStart(2, "0")}
                                {s.platform && <span className="svc__tag"> / PLATFORM</span>}
                            </span>
                            <h3 className="svc__name">{s.name}</h3>
                            <p className="ds-muted svc__note">{s.note}</p>
                            <span className="svc__go">
                                {s.platform ? "Start free ↑" : "Enquire →"}
                            </span>
                        </Link>
                    </Reveal>
                ))}
            </div>

            <Link className="ds-btn ds-btn--ghost sec__more" to="/services">
                All eight services in full →
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
                <p className="ds-eyebrow ds-eyebrow--cyan">Compliance</p>
                <h2 className="ds-shout sec__h2">
                    The frameworks your clients<br />will ask you about
                </h2>
                <p className="ds-lead sec__lead">
                    Certification is rarely the real goal — winning the contract is. We get you
                    through the audit and keep you there between them.
                </p>
            </Reveal>

            {/* Two panels, not two bare columns. Each framework is a row that
                reacts to the pointer and carries its index on the right —
                01–04 down the left panel, 05–08 down the right, which is why
                the counter is offset by the panel index rather than restarting.

                Every row is a link. The prototype's rows are buttons that
                scroll to the contact form; here they carry the audits slug
                into it, so somebody who clicked "SOC 2" arrives at a form that
                already knows what they came about. */}
            <div className="svc2">
                {[["Standards", COMPLY_LEFT], ["Data & privacy", COMPLY_RIGHT]].map(([label, items], ci) => (
                    <Reveal key={label} delay={ci * 80}>
                        <div className="frame">
                            <p className={`frame__label${ci ? " frame__label--alt" : ""}`}>{label}</p>
                            {items.map((s, i) => (
                                <Link
                                    className="frame__row"
                                    key={s.name}
                                    to="/contact?topic=standards-compliance-audits"
                                >
                                    <span className="frame__head">
                                        <span className="frame__name">{s.name}</span>
                                        <span className="frame__no">
                                            {String(ci * items.length + i + 1).padStart(2, "0")}
                                        </span>
                                    </span>
                                    <span className="ds-muted frame__note">{s.note}</span>
                                </Link>
                            ))}
                        </div>
                    </Reveal>
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

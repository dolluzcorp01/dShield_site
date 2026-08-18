import React from "react";
import { Link } from "react-router-dom";
import "./Services.css";
import { useDocumentMeta } from "./utils/meta";

/* ─────────────────────────────────────────────────────────────────────────
   What we do · Services · Compliance.

   Copy ported from the frozen customer site. The words were written and
   approved there; the styling was not — that file is a standalone prototype
   in neon cyan and magenta with inline styles. This uses the live site's
   tokens and existing classes, and nothing else.

   The scan sells the score. These pages sell the services, which is where
   the actual business is.
   ───────────────────────────────────────────────────────────────────────── */

const STATS = [
    { figure: "23", label: "Risk domains", line: "Every report shows all of them, including the eighteen a scan cannot reach." },
    { figure: "8", label: "Checks, free", line: "No account, no card, and no limit on how often you run one." },
    { figure: "0", label: "Guesswork", line: "The scoring formula is published. Recompute any grade by hand." },
];

/* Card 01 is our own platform and points back at the free scan rather than
   at a contact form — asking someone to enquire about the thing they can
   simply use, for nothing, right now, would be absurd. */
const SERVICES = [
    { no: "01", name: "Cyber Resilience Check", note: "Our platform. Start free, above.", platform: true },
    { no: "02", name: "Technical Assurance", note: "Independent testing of what you built.", slug: "technical-assurance" },
    { no: "03", name: "Third-Party Risk Management", note: "Know what your suppliers can reach.", slug: "third-party-risk-management" },
    { no: "04", name: "SOC Setup & Monitoring", note: "Someone watching, around the clock.", slug: "soc-setup-monitoring" },
    { no: "05", name: "Incident Response & Forensics", note: "When it has already happened, and the clock is running.", slug: "incident-response-forensics" },
    { no: "06", name: "Penetration Testing", note: "We try to break in, so nobody else does first.", slug: "penetration-testing" },
    { no: "07", name: "Continuous GRC", note: "Governance that stays current between audits.", slug: "continuous-grc" },
    { no: "08", name: "Standards & Compliance Audits", note: "ISO/IEC 27001, SOC 2, PCI DSS, DPDP.", slug: "standards-compliance-audits" },
];

const STANDARDS = [
    ["ISO 27001:2022", "Information security management."],
    ["ISO 9001:2015", "Quality management."],
    ["ISO 42001:2023", "AI management systems."],
    ["ISO/IEC 20000-1:2018", "IT service management."],
];

/* DPDP Act 2023 is not in the frozen file's list, which was written for a
   global audience. Dolluz is in Chennai and every Indian client asks about
   it before they ask about GDPR. */
const PRIVACY = [
    ["SOC 2 Type 1 & Type 2", "Trust services reporting, point-in-time and over a period."],
    ["GDPR", "European data protection."],
    ["DPDP Act 2023", "Indian data protection."],
    ["HIPAA", "Healthcare information in the United States."],
];

function Services() {
    useDocumentMeta({
        title: "Cybersecurity Services — Audits, Testing, Compliance | dShield",
        description: "Penetration testing, incident response, SOC setup, third-party risk and ISO 27001, SOC 2 and DPDP compliance, delivered by Dolluz Corp engineers.",
        canonical: "/services",
    });

    return (
        <div className="services">

            {/* ── A · What we do ─────────────────────────────────────── */}
            <section className="ds-wrap ds-section">
                <p className="ds-eyebrow">What we do</p>
                <h1>We tell you what we can see — and what we cannot</h1>
                <p className="ds-lead" style={{ marginBottom: 34 }}>
                    Most security reports give you a number and let you assume it covers
                    everything. Ours does the opposite. Every report carries a section titled
                    “What this does not tell you”, because a score you trust is worth more than
                    a score you like.
                </p>

                <div className="ds-grid ds-grid--3">
                    {STATS.map((s) => (
                        <div className="ds-card stat" key={s.label}>
                            <div className="stat__figure">{s.figure}</div>
                            <div className="stat__label ds-mono">{s.label}</div>
                            <p className="ds-faint" style={{ margin: 0 }}>{s.line}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── B · Services ───────────────────────────────────────── */}
            <section className="ds-wrap ds-section ds-section--tight">
                <p className="ds-eyebrow">Services</p>
                <h2>When the report is not enough</h2>
                <p className="ds-lead" style={{ marginBottom: 30 }}>
                    The platform is the first column. Everything to the right is people — our
                    engineers, on your side of the problem.
                </p>

                <div className="ds-grid ds-grid--3">
                    {SERVICES.map((s) => (
                        <div className={`ds-card service ${s.platform ? "service--platform" : ""}`} key={s.no}>
                            <span className="service__no ds-mono">{s.no}</span>
                            <h3 className="service__name">{s.name}</h3>
                            <p className="ds-faint service__note">{s.note}</p>
                            {s.platform
                                ? <Link to="/" className="service__go">Start free ↑</Link>
                                : <Link to={`/contact?topic=${s.slug}`} className="service__go">Enquire →</Link>}
                        </div>
                    ))}
                </div>

                {/* Penetration testing is a service delivered by people under a
                    signed engagement. The free scan is passive and never attempts
                    to break in. Both are true, and printed together they must not
                    look like a contradiction. */}
                <p className="ds-muted services__pentest-note">
                    Penetration testing is an engagement, carried out by our team with your
                    written authorisation. The automated scan on this site is passive and never
                    attempts to gain access.
                </p>
            </section>

            {/* ── C · Compliance ─────────────────────────────────────── */}
            <section className="ds-wrap ds-section ds-section--tight">
                <p className="ds-eyebrow">Compliance</p>
                <h2>The frameworks your clients will ask you about</h2>
                <p className="ds-lead" style={{ marginBottom: 30 }}>
                    Certification is rarely the real goal — winning the contract is. We get you
                    through the audit and keep you there between them.
                </p>

                <div className="ds-grid ds-grid--2">
                    <div className="ds-card framework">
                        <h3>Standards</h3>
                        <ul className="framework__list">
                            {STANDARDS.map(([name, what]) => (
                                <li key={name}>
                                    <strong>{name}</strong>
                                    <span className="ds-faint"> — {what}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="ds-card framework">
                        <h3>Data &amp; privacy</h3>
                        <ul className="framework__list">
                            {PRIVACY.map(([name, what]) => (
                                <li key={name}>
                                    <strong>{name}</strong>
                                    <span className="ds-faint"> — {what}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <section className="ds-wrap ds-section ds-section--tight">
                <div className="ds-card services__cta">
                    <h2 style={{ fontSize: "1.5rem" }}>Not sure which of these you need?</h2>
                    <p className="ds-muted" style={{ margin: "0 0 18px" }}>
                        Most people are not, and working that out is the first part of the job.
                        Tell us what you are worried about and we will tell you what it needs.
                    </p>
                    <Link to="/contact" className="ds-btn">Talk to us</Link>
                </div>
            </section>
        </div>
    );
}

export default Services;

import React from "react";
import { Link } from "react-router-dom";
import "./Services.css";

/* ─────────────────────────────────────────────────────────────────────────
   The gap argument, as a standalone page.

   In the frozen prototype this section only rendered after a scan finished.
   Here it is reachable from the nav, the homepage and a result, so it has to
   stand on its own for somebody who has never run a scan and may not yet
   know what the eighteen are.

   Stylesheet is Services.css on purpose — there is no third stylesheet.
   ───────────────────────────────────────────────────────────────────────── */

/* Each names a system the customer already runs and states what connecting
   it would reveal. Phrased "Would tell you …" throughout: it is conditional,
   a description of what the connector can answer, NOT a claim about
   something we have already found. That grammar is from the frozen file and
   it is the difference between an honest offer and a scare. */
const CONNECT = [
    { system: "Microsoft 365", would: "which of your administrators can sign in with a password alone" },
    { system: "Microsoft 365", would: "whether any mailbox is quietly forwarding mail outside the company" },
    { system: "Google Workspace", would: "which outside apps your staff have granted access to company data" },
    { system: "Amazon Web Services", would: "which storage buckets can be read by anyone who finds the address" },
    { system: "GitHub", would: "which repositories are public that were never meant to be" },
    { system: "Microsoft 365", would: "which shared links never expire and need no sign-in to open" },
];

function Coverage() {
    return (
        <div className="coverage">
            <section className="ds-wrap ds-section">
                <p className="ds-eyebrow">The part nobody shows you first</p>
                <h1>Six of the eighteen open in two minutes</h1>
                <p className="ds-lead coverage__lead" style={{ marginBottom: 34 }}>
                    You give us read-only access to something you already use — the same way you
                    add any app. You approve it on Microsoft’s screen, not ours. We never see
                    your password, and you can cut us off whenever you like.
                </p>

                <div className="ds-grid ds-grid--3">
                    {CONNECT.map((c, i) => (
                        <div className="ds-card connect" key={i}>
                            <span className="connect__system ds-mono">{c.system}</span>
                            <p className="connect__would">Would tell you {c.would}.</p>
                        </div>
                    ))}
                </div>

                <div className="ds-card checktwice">
                    <p>
                        <strong>We check twice.</strong> The first time we are guessing from the
                        street. The second time, with your systems connected, we are not — and
                        your report stops saying “you told us it’s partly done” and starts saying{" "}
                        <strong>“four of your six administrators have no second step to log in.”</strong>
                    </p>
                </div>
            </section>

            {/* The counterweight. Without this the page implies connectors close
                the whole gap, and they do not — they close six of eighteen.
                Overstating that would undercut the exact honesty the entire
                product is sold on, which is a bad trade for one page of copy. */}
            <section className="ds-wrap ds-section ds-section--tight">
                <h2>And twelve that no system can answer</h2>
                <p className="ds-lead coverage__counterweight">
                    Connecting your systems closes six of the eighteen. The other twelve are
                    about process and people — whether your backups actually restore, whether a
                    junior would challenge a payment request from the CEO, whether someone would
                    admit a mistake early enough to matter. No API can answer those. They are
                    what the guided assessment and the consultation sessions are for.
                </p>

                <div className="coverage__actions">
                    <Link to="/pricing" className="ds-btn">See the tiers</Link>
                    <Link to="/contact" className="ds-btn ds-btn--ghost">Talk to us</Link>
                </div>
            </section>
        </div>
    );
}

export default Coverage;

import React, { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet } from "./utils/api";
import { useDocumentMeta } from "./utils/meta";
import "./Checkout.css";

/* ─────────────────────────────────────────────────────────────────────────
   The page after payment.

   Polls until the report exists. The scan takes twenty seconds to a couple
   of minutes depending on the tier and how quickly the target answers, and
   a customer who has just paid should be told what is happening rather than
   left looking at a spinner with no explanation.

   The failure state is deliberately calm and says a person has been told.
   Somebody who has paid and hit a problem needs to know a human is involved,
   not to be shown an error code.
   ───────────────────────────────────────────────────────────────────────── */

const POLL_MS = 3000;
const GIVE_UP_MS = 180000;

const STAGES = [
    "Confirming your payment",
    "Running the assessment",
    "Building your report",
];

function OrderStatus() {
    const { ref } = useParams();
    const [state, setState] = useState({ loading: true, order: null, error: "" });
    const [stage, setStage] = useState(0);
    const [timedOut, setTimedOut] = useState(false);
    const started = useRef(Date.now());

    useDocumentMeta({ title: "Your order | dShield", description: "Order status.", noindex: true });

    useEffect(() => {
        let timer, stageTimer, stopped = false;

        const poll = async () => {
            const res = await apiGet(`/api/payments/order/${ref}`);
            if (stopped) return;

            if (!res.success) {
                setState({ loading: false, order: null, error: res.message || "We could not find that order." });
                return;
            }
            setState({ loading: false, order: res, error: "" });

            const done = res.fulfilment === "delivered" || res.fulfilment === "failed";
            if (done) return;

            if (Date.now() - started.current > GIVE_UP_MS) { setTimedOut(true); return; }
            timer = setTimeout(poll, POLL_MS);
        };

        poll();
        stageTimer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 12000);
        return () => { stopped = true; clearTimeout(timer); clearInterval(stageTimer); };
    }, [ref]);

    if (state.loading) {
        return <div className="ds-wrap ds-section ds-center"><span className="ds-spin" style={{ margin: "0 auto" }} /></div>;
    }

    if (state.error) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <h2>We could not find that order</h2>
                <p className="ds-muted">{state.error}</p>
                <Link to="/contact" className="ds-btn" style={{ marginTop: 14 }}>Talk to us</Link>
            </div>
        );
    }

    const o = state.order;

    if (o.fulfilment === "delivered" && o.reportUrl) {
        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card orderdone">
                    <p className="ds-eyebrow">Payment received</p>
                    <h1>Your report for {o.domain} is ready.</h1>
                    <p className="ds-muted">
                        We have also emailed the link. It works until{" "}
                        {o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : "its expiry date"} — treat it as
                        you would the report itself, since anyone holding it can read it.
                    </p>
                    <div className="orderdone__actions">
                        <Link to={o.reportUrl} className="ds-btn">Open your report</Link>
                        <Link to="/contact" className="ds-btn ds-btn--ghost">Talk to us</Link>
                    </div>
                    <p className="ds-faint" style={{ marginTop: 18 }}>Order reference {o.orderRef}</p>
                </div>
            </div>
        );
    }

    if (o.fulfilment === "failed") {
        /* Calm, and honest that a person is involved. No internal error text:
           the customer cannot act on it and it is not theirs to debug. */
        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card orderfail">
                    <p className="ds-eyebrow">Payment received</p>
                    <h1>We have your payment, and something went wrong.</h1>
                    <p className="ds-muted">
                        We could not complete the assessment of {o.domain}. This is ours to fix, not yours —
                        somebody here has already been alerted and will be in touch. You do not need to do
                        anything, and you have not lost your order.
                    </p>
                    <p className="ds-muted">
                        The most common cause is a firewall stopping the scan partway through, which is your
                        protection working rather than a fault on your side.
                    </p>
                    <div className="orderdone__actions">
                        <Link to="/contact" className="ds-btn">Talk to us</Link>
                    </div>
                    <p className="ds-faint" style={{ marginTop: 18 }}>Order reference {o.orderRef}</p>
                </div>
            </div>
        );
    }

    if (timedOut) {
        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card orderfail">
                    <h1>This is taking longer than expected.</h1>
                    <p className="ds-muted">
                        Your payment is safe and your order is recorded. The report is still being produced, and
                        we will email the link the moment it is ready — you can close this page.
                    </p>
                    <p className="ds-faint">Order reference {o.orderRef}</p>
                    <div className="orderdone__actions">
                        <Link to="/contact" className="ds-btn ds-btn--ghost">Talk to us</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ds-wrap ds-section">
            <div className="ds-card orderwait">
                <p className="ds-eyebrow">Payment received</p>
                <h1>We are assessing {o.domain}.</h1>
                <div className="orderwait__stage">
                    <span className="ds-spin" />
                    <span>{STAGES[stage]}…</span>
                </div>
                <p className="ds-muted">
                    This usually takes under two minutes. You can close this page — the report link is emailed
                    to you either way.
                </p>
                <p className="ds-faint">Order reference {o.orderRef}</p>
            </div>
        </div>
    );
}

export default OrderStatus;

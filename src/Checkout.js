import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { apiPost, apiGet } from "./utils/api";
import { useDocumentMeta } from "./utils/meta";
import "./Checkout.css";

/* ─────────────────────────────────────────────────────────────────────────
   Checkout.

   The Razorpay script is loaded ON DEMAND rather than from index.html.
   Putting a third-party payment script in the document head would load it
   on every page — including the free scan, which most visitors use and
   which has nothing to do with payment.

   The browser never sends a price. It sends a tier key, and the server
   reads the amount from its own list. A checkout that accepts an amount
   from the page is a checkout that can be bought from at any price.
   ───────────────────────────────────────────────────────────────────────── */

const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay() {
    return new Promise((resolve, reject) => {
        if (window.Razorpay) return resolve(window.Razorpay);
        const existing = document.querySelector(`script[src="${RAZORPAY_SRC}"]`);
        if (existing) {
            existing.addEventListener("load", () => resolve(window.Razorpay));
            existing.addEventListener("error", () => reject(new Error("script failed")));
            return;
        }
        const el = document.createElement("script");
        el.src = RAZORPAY_SRC;
        el.async = true;
        el.onload = () => resolve(window.Razorpay);
        el.onerror = () => reject(new Error("Could not load the payment window."));
        document.body.appendChild(el);
    });
}

function Checkout() {
    const [params] = useSearchParams();
    const navigate = useNavigate();

    const tier = (params.get("tier") || "").trim();
    const domainParam = (params.get("domain") || "").trim();

    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ email: "", name: "", company: "", domain: domainParam });
    const [accepted, setAccepted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useDocumentMeta({
        title: "Checkout | dShield",
        description: "Buy a dShield security assessment report.",
        noindex: true,
    });

    useEffect(() => {
        (async () => {
            const res = await apiGet("/api/leads/pricing");
            setLoading(false);
            if (!res.success) return setError("We could not load the price list.");
            const p = (res.plans || []).find((x) => x.key === tier);
            if (!p) return setError("That is not something you can buy.");
            if (!p.available) return setError("That tier is not on sale yet.");
            setPlan(p);
        })();
    }, [tier]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const pay = async (e) => {
        e.preventDefault();
        setError("");

        if (!form.email.trim()) return setError("Enter your email address — this is where the report is sent.");
        if (!form.domain.trim()) return setError("Enter the domain you want assessed.");
        if (!accepted) return setError("Please accept the Terms of Service and Privacy Notice to continue.");

        setBusy(true);
        const order = await apiPost("/api/payments/checkout", {
            tier,
            domain: form.domain.trim(),
            email: form.email.trim(),
            name: form.name.trim() || undefined,
            company: form.company.trim() || undefined,
            termsAccepted: true,
        });

        if (!order.success) { setBusy(false); return setError(order.message || "We could not start the payment."); }

        let Razorpay;
        try { Razorpay = await loadRazorpay(); }
        catch (err) { setBusy(false); return setError("We could not open the payment window. Check your connection and try again."); }

        const rzp = new Razorpay({
            key: order.key_id,               // public by design; the secret never leaves the server
            order_id: order.razorpay_order_id,
            amount: order.amount,
            currency: order.currency,
            name: "dShield",
            description: `${order.planName} — ${order.domain}`,
            prefill: { email: form.email.trim(), name: form.name.trim() || undefined },
            theme: { color: "#C6FF3D" },
            handler: async (response) => {
                /* This only makes the customer wait less. The webhook is the
                   authority and will fulfil the order regardless of what the
                   browser reports — including if this callback never runs
                   because the tab was closed. */
                await apiPost("/api/payments/verify", {
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                });
                navigate(`/order/${order.order_ref}`);
            },
            modal: {
                ondismiss: () => {
                    setBusy(false);
                    setError("The payment window was closed. Nothing has been charged.");
                },
            },
        });

        rzp.on("payment.failed", (resp) => {
            setBusy(false);
            setError(resp?.error?.description || "That payment did not go through. Nothing has been charged.");
        });

        rzp.open();
    };

    if (loading) {
        return <div className="ds-wrap ds-section ds-center"><span className="ds-spin" style={{ margin: "0 auto" }} /></div>;
    }

    if (error && !plan) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <h2>We cannot take that order</h2>
                <p className="ds-muted">{error}</p>
                <Link to="/pricing" className="ds-btn" style={{ marginTop: 14 }}>See the tiers</Link>
            </div>
        );
    }

    return (
        <div className="ds-wrap ds-section checkout">
            <p className="ds-eyebrow">Checkout</p>
            <h1>{plan.name}</h1>
            <p className="ds-lead" style={{ marginBottom: 26 }}>{plan.tagline}</p>

            <div className="ds-grid ds-grid--2 checkout__grid">
                <form className="ds-card checkout__form" onSubmit={pay}>
                    <div className="ds-field">
                        <label className="ds-label">Domain to assess <span className="req">*</span></label>
                        <input className="ds-input" value={form.domain} onChange={set("domain")}
                               placeholder="yourcompany.com" disabled={busy} spellCheck="false" autoComplete="off" />
                    </div>
                    <div className="ds-field">
                        <label className="ds-label">Email <span className="req">*</span></label>
                        <input className="ds-input" type="email" value={form.email} onChange={set("email")} disabled={busy} />
                        <p className="ds-faint" style={{ margin: "8px 0 0" }}>The report link is sent here.</p>
                    </div>
                    <div className="ds-grid ds-grid--2" style={{ gap: 16 }}>
                        <div className="ds-field">
                            <label className="ds-label">Your name</label>
                            <input className="ds-input" value={form.name} onChange={set("name")} disabled={busy} />
                        </div>
                        <div className="ds-field">
                            <label className="ds-label">Company</label>
                            <input className="ds-input" value={form.company} onChange={set("company")} disabled={busy} />
                        </div>
                    </div>

                    <label className="checkout__terms">
                        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={busy} />
                        <span>
                            I have read and accept the <Link to="/legal/terms">Terms of Service</Link> and{" "}
                            <Link to="/legal/privacy">Privacy Notice</Link>.
                        </span>
                    </label>

                    {error && <div className="ds-error">{error}</div>}

                    <button className="ds-btn ds-btn--block" disabled={busy}>
                        {busy ? <><span className="ds-spin" /> Opening payment…</> : `Pay ₹${plan.amountInr.toLocaleString("en-IN")}`}
                    </button>
                    <p className="ds-faint checkout__fine">
                        Payment is handled by Razorpay. We never see your card details.
                    </p>
                </form>

                <div className="ds-card checkout__summary">
                    <h3>What you get</h3>
                    <ul className="checkout__list">
                        {(plan.features || []).map((f) => <li key={f}>{f}</li>)}
                    </ul>
                    {plan.notIncluded?.length > 0 && (
                        <>
                            <h3 style={{ marginTop: 22 }}>What it does not include</h3>
                            <ul className="checkout__list checkout__list--no">
                                {plan.notIncluded.map((f) => <li key={f}>{f}</li>)}
                            </ul>
                        </>
                    )}
                    <div className="checkout__total">
                        <span>Total</span>
                        <strong>₹{plan.amountInr.toLocaleString("en-IN")}</strong>
                    </div>
                    <p className="ds-faint" style={{ margin: "10px 0 0" }}>
                        Charged in Indian rupees. The scan starts the moment payment clears.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Checkout;

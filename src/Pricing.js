import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "./utils/api";
import "./Pricing.css";
import { useDocumentMeta } from "./utils/meta";

function Pricing() {
    useDocumentMeta({
        title: "Pricing — Security Assessment Reports | dShield",
        description: "From a free grade to full remediation. See what each level covers, what a report contains, and where the free scan stops.",
        canonical: "/pricing",
    });

    const [plans, setPlans] = useState([]);
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(true);

    const [email, setEmail] = useState("");
    const [tier, setTier] = useState("");
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            const res = await apiGet("/api/leads/pricing");
            setLoading(false);
            if (res.success) { setPlans(res.plans); setNote(res.note); }
        })();
    }, []);

    /* Split on price, not on `available`. When Basic goes on sale it belongs
       in the paid row with a working checkout button, not promoted up into
       the free band — which is what splitting on availability would do. */
    const free = plans.find((p) => p.price === 0);
    const paid = plans.filter((p) => p.price > 0);

    const notify = async (e) => {
        e.preventDefault();
        setError("");
        if (!email.trim()) return setError("Enter your email address.");
        setBusy(true);
        const res = await apiPost("/api/leads/notify", { email: email.trim(), tier: tier || undefined });
        setBusy(false);
        if (!res.success) return setError(res.message || "That could not be saved.");
        setSent(true);
    };

    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">Pricing</p>
            <h1>What each level gives you</h1>
            <p className="ds-lead" style={{ marginBottom: 14 }}>
                The free scan tells you your grade. Everything above it tells you what the
                problems actually are, and how to close them.
            </p>

            {note && (
                <div className="ds-note pricing__note">
                    <strong>Reports are not on sale yet.</strong> {note}
                </div>
            )}

            {loading ? (
                <div className="ds-center" style={{ padding: 40 }}><span className="ds-spin" style={{ margin: "0 auto" }} /></div>
            ) : (
                <>
                {/* The free scan sits above the paid row rather than inside it.
                    It is not a fifth option competing with the other four — it
                    is the thing everybody starts with, and putting it in the
                    grid squeezed the four paid tiers onto two lines. */}
                {free && (
                    <div className="ds-card freeband">
                        <div className="freeband__lead">
                            <div className="freeband__head">
                                <h3 className="freeband__name">{free.name}</h3>
                                <span className="freeband__price">{free.display}</span>
                            </div>
                            <p className="ds-faint freeband__billing">{free.billing}</p>
                            <p className="freeband__tagline">{free.tagline}</p>
                        </div>

                        <ul className="freeband__features">
                            {free.features.map((f, i) => (
                                <li key={i}><span className="plan__tick">▸</span>{f}</li>
                            ))}
                        </ul>

                        <div className="freeband__action">
                            <Link to="/" className="ds-btn">{free.cta}</Link>
                            {free.notIncluded?.length > 0 && (
                                <p className="ds-faint freeband__not">
                                    <span className="plan__cross">×</span> {free.notIncluded.join(" · ")}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <p className="ds-eyebrow plans__label">Paid reports</p>

                <div className="plans">
                    {paid.map((p) => (
                        <div className={`ds-card plan ${p.highlight ? "is-highlight" : ""}`} key={p.key}>
                            {p.highlight && <span className="plan__flag">Most chosen</span>}

                            <h3 className="plan__name">{p.name}</h3>
                            <div className="plan__price">{p.display}</div>
                            <div className="plan__billing ds-faint">{p.billing}</div>

                            <p className="plan__tagline">{p.tagline}</p>

                            <ul className="plan__features">
                                {p.features.map((f, i) => (
                                    <li key={i}><span className="plan__tick">▸</span>{f}</li>
                                ))}
                            </ul>

                            {p.notIncluded?.length > 0 && (
                                <ul className="plan__features plan__features--not">
                                    {p.notIncluded.map((f, i) => (
                                        <li key={i}><span className="plan__cross">×</span>{f}</li>
                                    ))}
                                </ul>
                            )}

                            {p.available ? (
                                <Link to="/" className="ds-btn ds-btn--block plan__cta">{p.cta}</Link>
                            ) : p.cta === "Talk to us" ? (
                                <Link to="/contact" className="ds-btn ds-btn--ghost ds-btn--block plan__cta">{p.cta}</Link>
                            ) : (
                                <button
                                    className="ds-btn ds-btn--ghost ds-btn--block plan__cta"
                                    onClick={() => {
                                        setTier(p.key);
                                        document.getElementById("notify")?.scrollIntoView({ behavior: "smooth" });
                                    }}
                                >
                                    {p.cta}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                </>
            )}

            <div className="ds-card notify" id="notify">
                {sent ? (
                    <>
                        <h2>You are on the list</h2>
                        <p className="ds-muted" style={{ marginBottom: 0 }}>
                            A confirmation email is on its way. We will write again the moment
                            reports open. In the meantime the free scan and all five tools are
                            yours to use as often as you like.
                        </p>
                    </>
                ) : (
                    <>
                        <h2>Tell me when reports open</h2>
                        <p className="ds-muted">
                            One email when paid reports go live. Nothing else, and no list we sell on.
                        </p>
                        <form onSubmit={notify} className="notify__form">
                            <input
                                className="ds-input"
                                type="email"
                                placeholder="you@yourcompany.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={busy}
                            />
                            <select className="ds-input notify__tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                                <option value="">Which level interests you?</option>
                                {plans.filter((p) => !p.available).map((p) => (
                                    <option value={p.key} key={p.key}>{p.name}</option>
                                ))}
                            </select>
                            <button className="ds-btn" disabled={busy}>
                                {busy ? <span className="ds-spin" /> : "Notify me"}
                            </button>
                        </form>
                        {error && <div className="ds-error">{error}</div>}
                    </>
                )}
            </div>

            <div className="faq">
                <h2>Questions people ask</h2>

                <div className="faq__item">
                    <h3>Why is the scan free?</h3>
                    <p className="ds-muted">
                        Because it costs us almost nothing to run. It reads what your servers already
                        publish to anyone who asks — no third-party service, no per-scan fee. We would
                        rather you saw the quality of the work before deciding whether to pay for more of it.
                    </p>
                </div>

                <div className="faq__item">
                    <h3>What do I get for $49 that I do not get free?</h3>
                    <p className="ds-muted">
                        Every problem named, with the exact host, file or record, how serious it is, and
                        what an attacker could do with it. What you do not get at $49 is how to fix it.
                        That is $199.
                    </p>
                </div>

                <div className="faq__item">
                    <h3>Why $199 rather than $99?</h3>
                    <p className="ds-muted">
                        Because at $199 we stop guessing. You connect your Microsoft 365 or your AWS,
                        read-only, and we measure what you actually run instead of asking you about it.
                        The report stops saying "you told us MFA is partial" and starts saying "these
                        four administrators have no MFA".
                    </p>
                </div>

                <div className="faq__item">
                    <h3>Is a scan safe? Will it break anything?</h3>
                    <p className="ds-muted">
                        No. dShield is entirely passive. We make ordinary requests of the kind any
                        visitor makes, and read public DNS and certificate records. We never scan
                        ports, never attempt a login, never send traffic designed to find a weakness by
                        breaking something.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Pricing;

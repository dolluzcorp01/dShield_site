import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet, apiPost } from "./utils/api";
import "./Legal.css";
import { useDocumentMeta } from "./utils/meta";

/* ─────────────────────────────────────────────────────────────────────────
   Legal documents.

   No markdown library. The bodies are headings and paragraphs and nothing
   else, and the dependency list on this project is deliberately short — a
   parser for `## ` and blank lines is twelve lines, which is cheaper than a
   dependency to audit, update and ship to every visitor.
   ───────────────────────────────────────────────────────────────────────── */

function renderMarkdown(text) {
    return String(text || "")
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, i) =>
            block.startsWith("## ")
                ? <h2 key={i}>{block.slice(3).trim()}</h2>
                : <p key={i}>{block.replace(/\n/g, " ")}</p>
        );
}

const formatDate = (v) => {
    const d = new Date(v);
    return isNaN(d) ? null : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

/* ── The index ───────────────────────────────────────────────────────── */

export function LegalIndex() {
    useDocumentMeta({
        title: "Legal Documents | dShield",
        description: "Terms of Service, Privacy Notice, Refund Policy and Cookie Notice.",
        canonical: "/legal",
    });

    const [docs, setDocs] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const res = await apiGet("/api/legal");
            setLoading(false);
            if (!res.success) return setError(res.message || "Those documents could not be loaded.");
            setDocs(res.documents || []);
        })();
    }, []);

    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">Legal</p>
            <h1>Policies and terms</h1>
            <p className="ds-lead" style={{ marginBottom: 30 }}>
                What we collect, what we promise, and how to ask us to stop. Every document
                here is currently awaiting legal review, and each one says so on its face.
            </p>

            {loading && <span className="ds-spin" />}
            {error && <div className="ds-error">{error}</div>}

            {!loading && !error && (
                <div className="ds-grid ds-grid--2">
                    {docs.map((d) => (
                        <Link to={`/legal/${d.key}`} className="ds-card legalcard" key={d.key}>
                            <h3>{d.title}</h3>
                            {d.isPlaceholder && (
                                <span className="legalcard__flag">Awaiting legal review</span>
                            )}
                            <span className="legalcard__go">Read →</span>
                        </Link>
                    ))}
                </div>
            )}

            <div className="ds-card legalcard legalcard--data">
                <h3>Your data</h3>
                <p className="ds-muted" style={{ margin: "0 0 14px" }}>
                    Ask what we hold about you, ask for it to be corrected, or ask for it to be
                    erased.
                </p>
                <Link to="/data-request" className="ds-btn ds-btn--sm">Make a request</Link>
            </div>
        </div>
    );
}

/* ── One document ────────────────────────────────────────────────────── */

export function Legal() {
    const { key } = useParams();
    const [doc, setDoc] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useDocumentMeta({
        title: doc ? `${doc.title} | dShield` : "Legal Documents | dShield",
        description: doc
            ? `${doc.title} for dShield, by Dolluz Corp.`
            : "Terms of Service, Privacy Notice, Refund Policy and Cookie Notice.",
        canonical: `/legal/${key}`,
    });

    useEffect(() => {
        setLoading(true); setError(""); setDoc(null);
        (async () => {
            const res = await apiGet(`/api/legal/${key}`);
            setLoading(false);
            if (!res.success) return setError(res.message || "That document could not be loaded.");
            setDoc(res.document);
        })();
    }, [key]);

    if (loading) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <span className="ds-spin" style={{ margin: "0 auto" }} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <h2>We could not open that document</h2>
                <p className="ds-muted">{error}</p>
                <Link to="/legal" className="ds-btn" style={{ marginTop: 16 }}>All documents</Link>
            </div>
        );
    }

    const effective = formatDate(doc.effectiveFrom);

    return (
        <div className="ds-wrap ds-section legal">
            <Link to="/legal" className="ds-faint">← All documents</Link>
            <h1 style={{ marginTop: 14 }}>{doc.title}</h1>

            <p className="ds-faint legal__meta">
                {effective && <>Effective from {effective} · </>}Version {doc.version}
            </p>

            {/* The banner is the point of shipping placeholders at all. A
                visitor must not be able to mistake this for a policy that
                binds anybody — an invented policy people rely on is worse
                than an obviously unfinished one. */}
            {doc.isPlaceholder && (
                <div className="ds-note legal__placeholder">
                    This document is awaiting legal review and is not yet binding.
                </div>
            )}

            <div className="legal__body">{renderMarkdown(doc.content)}</div>

            <div className="ds-card legal__foot">
                <p className="ds-muted" style={{ margin: "0 0 14px" }}>
                    To ask what we hold about you, or to have it corrected or erased:
                </p>
                <Link to="/data-request" className="ds-btn ds-btn--sm">Make a data request</Link>
            </div>
        </div>
    );
}

/* ── DPDP data request ───────────────────────────────────────────────── */

const REQUEST_TYPES = [
    { value: "access", label: "Tell me what you hold about me" },
    { value: "correction", label: "Correct something you hold" },
    { value: "erasure", label: "Erase what you hold about me" },
];

export function DataRequest() {
    useDocumentMeta({
        title: "Ask About Your Data | dShield",
        description: "Ask what we hold about you, ask for it to be corrected, or ask for it to be erased.",
        noindex: true,
    });

    const [form, setForm] = useState({ email: "", request_type: "access", details: "" });
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!form.email.trim()) return setError("Enter your email address so we can find your records and reply.");
        setBusy(true);
        const res = await apiPost("/api/data-request", form);
        setBusy(false);
        if (!res.success) return setError(res.message || "That could not be sent.");
        setSent(true);
    };

    if (sent) {
        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card" style={{ maxWidth: 620 }}>
                    <h1>Request received</h1>
                    <p className="ds-muted">
                        We have your request and will reply to the address you gave within the
                        period the DPDP Act allows.
                    </p>
                    <Link to="/legal" className="ds-btn">Back to policies</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">Your data</p>
            <h1>Ask about your data</h1>
            <p className="ds-lead" style={{ marginBottom: 30 }}>
                Under the DPDP Act 2023 you may ask what we hold about you, ask for it to be
                corrected, or ask for it to be erased. Use this form and we will reply to the
                address you give.
            </p>

            <form className="ds-card datareq" onSubmit={submit}>
                <div className="ds-field">
                    <label className="ds-label">Your email <span className="req">*</span></label>
                    <input
                        className="ds-input"
                        type="email"
                        value={form.email}
                        onChange={set("email")}
                        disabled={busy}
                        placeholder="The address you used with us"
                    />
                    <p className="ds-faint" style={{ margin: "8px 0 0" }}>
                        We need this to find your records. It is the address we will reply to.
                    </p>
                </div>

                <div className="ds-field">
                    <label className="ds-label">What are you asking for? <span className="req">*</span></label>
                    <select
                        className="ds-input"
                        value={form.request_type}
                        onChange={set("request_type")}
                        disabled={busy}
                    >
                        {REQUEST_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>

                <div className="ds-field">
                    <label className="ds-label">Anything else we should know</label>
                    <textarea
                        className="ds-input"
                        rows={5}
                        value={form.details}
                        onChange={set("details")}
                        disabled={busy}
                        placeholder="Optional. If you are asking for a correction, tell us what is wrong."
                    />
                </div>

                {error && <div className="ds-error">{error}</div>}

                <button className="ds-btn" disabled={busy}>
                    {busy ? <><span className="ds-spin" /> Sending…</> : "Send request"}
                </button>
            </form>
        </div>
    );
}

import React, { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { apiPost, apiFetch } from "./utils/api";
import "./Tools.css";

/* Each tool is its own page and its own front door. Not a dropdown:
   somebody searching "can people fake email from my domain" should land on a
   page that answers exactly that, and leave knowing our name. */
const TOOLS = [
    {
        slug: "email-spoofing", name: "Email Spoofing Test", endpoint: "/api/tools/email-spoofing",
        blurb: "Can anyone send email that looks like it came from you?",
        detail: "Checks SPF, DKIM, DMARC and MTA-STS — the records that tell the rest of the world which servers may send mail using your name.",
        input: "domain",
    },
    {
        slug: "ssl", name: "SSL / TLS Test", endpoint: "/api/tools/ssl",
        blurb: "Is your encryption valid, current, and trusted?",
        detail: "Reads your certificate the way a browser does: who issued it, what it covers, when it expires, and which protocol you negotiate.",
        input: "domain",
    },
    {
        slug: "headers", name: "Security Headers Test", endpoint: "/api/tools/headers",
        blurb: "Are your pages telling browsers how to protect your visitors?",
        detail: "Six headers and your cookie flags. Missing ones are the difference between an injected script being blocked and being executed.",
        input: "domain",
    },
    {
        slug: "lookalike", name: "Lookalike Domain Check", endpoint: "/api/tools/lookalike",
        blurb: "Which misspellings of your domain can send invoices today?",
        detail: "A registered typo is a nuisance. One with mail servers configured is an invoice-fraud campaign waiting to be sent.",
        input: "domain",
    },
    {
        slug: "password", name: "Password Exposure Check", endpoint: null,
        blurb: "Has this password appeared in a known breach?",
        detail: "Your password never leaves your browser. It is hashed here, and only the first five characters of that hash are ever sent.",
        input: "password",
    },
];

/* ── Password check ───────────────────────────────────────────────────────
   The privacy promise is the product here, so the mechanism matters.

   SHA-1 is computed in the browser using the Web Crypto API. Only the first
   five characters of the hash are sent to our server, which forwards them to
   the range API and returns every hash SUFFIX beginning with those five
   characters — typically several hundred. We compare locally.

   We never see the password. We never see the full hash. Nobody reading our
   logs could reconstruct either. If this ever changes so the password is
   posted to the server, the sentence printed on the page becomes a lie. */
async function sha1Hex(text) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function PasswordTool() {
    const [pw, setPw] = useState("");
    const [busy, setBusy] = useState(false);
    const [out, setOut] = useState(null);
    const [error, setError] = useState("");

    const check = async (e) => {
        e.preventDefault();
        setError(""); setOut(null);
        if (!pw) return setError("Type a password to check.");
        if (!window.crypto?.subtle) {
            return setError("This browser cannot hash locally, so we will not send the password at all.");
        }

        setBusy(true);
        try {
            const hash = await sha1Hex(pw);
            const prefix = hash.slice(0, 5);
            const suffix = hash.slice(5);

            const res = await apiFetch(`/api/tools/password/${prefix}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.message || "The check could not be completed.");

            const count = data.result.suffixes[suffix] || 0;
            setOut({ count, checked: Object.keys(data.result.suffixes).length });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
            setPw("");   // do not leave it sitting in the field
        }
    };

    return (
        <div className="tool">
            <form onSubmit={check}>
                <div className="tool__row">
                    <input
                        className="ds-input"
                        type="password"
                        placeholder="Type a password"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        disabled={busy}
                        autoComplete="off"
                    />
                    <button className="ds-btn" disabled={busy}>
                        {busy ? <span className="ds-spin" /> : "Check"}
                    </button>
                </div>
                {error && <div className="ds-error">{error}</div>}
            </form>

            <div className="ds-note tool__promise">
                Your password is hashed inside your browser. Only the first five characters of
                that hash are sent, and we receive back a list of hundreds of possible matches
                to compare here. We never see your password, and we could not work it out from
                what we do see.
            </div>

            {out && (
                <div className={`ds-card tool__result ${out.count ? "is-bad" : "is-good"}`}>
                    {out.count ? (
                        <>
                            <h3>Found in {out.count.toLocaleString()} known breaches</h3>
                            <p className="ds-muted" style={{ marginBottom: 0 }}>
                                This password has been published. Anyone running a list of leaked
                                passwords against your accounts already has it. Change it wherever it
                                is used, and do not reuse a variation of it.
                            </p>
                        </>
                    ) : (
                        <>
                            <h3>Not found in any known breach</h3>
                            <p className="ds-muted" style={{ marginBottom: 0 }}>
                                Checked against {out.checked} hashes sharing your prefix. This means it
                                has not appeared in a public breach corpus — not that it is strong, and
                                not that it is safe to reuse.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── Domain tools ─────────────────────────────────────────────────────── */

function severityClass(sev) {
    return `ds-pill ds-pill--${sev}`;
}

function DomainTool({ tool }) {
    const [domain, setDomain] = useState("");
    const [busy, setBusy] = useState(false);
    const [out, setOut] = useState(null);
    const [error, setError] = useState("");

    const run = async (e) => {
        e.preventDefault();
        setError(""); setOut(null);
        if (!domain.trim()) return setError("Enter a domain.");
        setBusy(true);
        const res = await apiPost(tool.endpoint, { domain: domain.trim() });
        setBusy(false);
        if (!res.success) return setError(res.message || "That check could not be completed.");
        setOut(res.result);
    };

    return (
        <div className="tool">
            <form onSubmit={run}>
                <div className="tool__row">
                    <input
                        className="ds-input"
                        placeholder="yourcompany.com"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        disabled={busy}
                        autoComplete="off"
                        spellCheck="false"
                    />
                    <button className="ds-btn" disabled={busy}>
                        {busy ? <span className="ds-spin" /> : "Check"}
                    </button>
                </div>
                {error && <div className="ds-error">{error}</div>}
            </form>

            {out && (
                <div className="tool__result-wrap">
                    <div className="ds-card">
                        <p className="ds-eyebrow" style={{ marginBottom: 6 }}>{out.domain}</p>
                        <h3 style={{ marginBottom: 18 }}>{out.verdict}</h3>

                        {/* Email spoofing */}
                        {out.records && (
                            <div className="reclist">
                                {Object.entries(out.records).map(([k, v]) => (
                                    <div className="reclist__row" key={k}>
                                        <span className="reclist__key ds-mono">{k.toUpperCase()}</span>
                                        <span className={`reclist__state ${v.present ? "is-on" : v.present === null ? "is-unknown" : "is-off"}`}>
                                            {v.present === null ? "Could not check" : v.present ? "Present" : "Missing"}
                                        </span>
                                        {v.policy && <span className="ds-faint">policy: {v.policy}</span>}
                                        {v.selectors?.length > 0 && <span className="ds-faint">{v.selectors.join(", ")}</span>}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* SSL */}
                        {out.issuer && (
                            <div className="kv">
                                <div><span className="kv__k">Issued by</span><span>{out.issuer}</span></div>
                                <div><span className="kv__k">Valid until</span><span>{out.validTo} ({out.daysRemaining} days)</span></div>
                                <div><span className="kv__k">Protocol</span><span>{out.protocol}</span></div>
                                {out.keyBits && <div><span className="kv__k">Key size</span><span>{out.keyBits}-bit</span></div>}
                                <div><span className="kv__k">Names covered</span><span>{out.altNameCount}</span></div>
                            </div>
                        )}

                        {/* Headers */}
                        {out.headers && (
                            <>
                                <div className="hdrlist">
                                    {out.headers.map((h) => (
                                        <div className="hdrlist__row" key={h.key}>
                                            <span className={`hdrlist__dot ${h.present ? "is-on" : "is-off"}`} />
                                            <div>
                                                <strong>{h.label}</strong>
                                                <p className="ds-faint" style={{ margin: "2px 0 0" }}>{h.what}</p>
                                            </div>
                                            <span className={h.present ? "hdrlist__yes" : "hdrlist__no"}>
                                                {h.present ? "Present" : "Missing"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {out.serverDisclosure && (
                                    <p className="ds-faint" style={{ marginTop: 14 }}>{out.serverDisclosure}</p>
                                )}
                                {out.cookieIssues?.length > 0 && (
                                    <div className="ds-note" style={{ marginTop: 14 }}>
                                        {out.cookieIssues.length} cookie(s) are missing protective flags:{" "}
                                        {out.cookieIssues.map((c) => `${c.name} (${c.missing.join(", ")})`).join("; ")}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Lookalike */}
                        {out.mailCapable && (
                            <>
                                {out.mailCapable.length > 0 && (
                                    <div className="lookalist">
                                        <p className="ds-eyebrow" style={{ marginBottom: 8 }}>Can send email as you</p>
                                        {out.mailCapable.map((r) => (
                                            <div className="lookalist__row is-bad" key={r.domain}>
                                                <span className="ds-mono">{r.domain}</span>
                                                <span className={severityClass("critical")}>Mail configured</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {out.registered.filter((r) => !r.hasMail).length > 0 && (
                                    <div className="lookalist">
                                        <p className="ds-eyebrow" style={{ marginBottom: 8, marginTop: 18 }}>Registered, no mail</p>
                                        {out.registered.filter((r) => !r.hasMail).map((r) => (
                                            <div className="lookalist__row" key={r.domain}>
                                                <span className="ds-mono">{r.domain}</span>
                                                <span className="ds-faint">Registered</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="ds-faint" style={{ marginTop: 16 }}>{out.note}</p>
                            </>
                        )}

                        {/* Shared issue list */}
                        {out.issues?.length > 0 && (
                            <div className="issuelist">
                                {out.issues.map((i, n) => (
                                    <div className="issuelist__row" key={n}>
                                        <span className={severityClass(i.severity)}>{i.severity}</span>
                                        <span>{i.text}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="ds-card upsell">
                        <strong>This is one of eight checks in the free scan.</strong>
                        <p className="ds-muted" style={{ margin: "6px 0 14px" }}>
                            The full scan covers your website, certificates, email, public exposure
                            and lookalike domains together, and grades all of it.
                        </p>
                        <Link to="/" className="ds-btn ds-btn--sm">Run the free scan</Link>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Pages ────────────────────────────────────────────────────────────── */

export function ToolsIndex() {
    return (
        <div className="ds-wrap ds-section">
            <p className="ds-eyebrow">Free forever · No login · No card</p>
            <h1>Five tools, no strings</h1>
            <p className="ds-lead" style={{ marginBottom: 36 }}>
                Each answers one question properly. Use them as often as you like, on any domain
                you are responsible for.
            </p>

            <div className="ds-grid ds-grid--2">
                {TOOLS.map((t) => (
                    <Link to={`/tools/${t.slug}`} className="ds-card toolcard" key={t.slug}>
                        <h3>{t.name}</h3>
                        <p className="toolcard__blurb">{t.blurb}</p>
                        <p className="ds-faint" style={{ margin: 0 }}>{t.detail}</p>
                        <span className="toolcard__go">Open →</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}

export function ToolPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const tool = TOOLS.find((t) => t.slug === slug);

    if (!tool) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <h2>That tool does not exist</h2>
                <button className="ds-btn" onClick={() => navigate("/tools")}>See all tools</button>
            </div>
        );
    }

    return (
        <div className="ds-wrap ds-section">
            <Link to="/tools" className="ds-faint">← All tools</Link>
            <h1 style={{ marginTop: 14 }}>{tool.name}</h1>
            <p className="ds-lead">{tool.detail}</p>

            <div style={{ marginTop: 30 }}>
                {tool.input === "password" ? <PasswordTool /> : <DomainTool tool={tool} />}
            </div>
        </div>
    );
}

export { TOOLS };

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet, apiPost } from "./utils/api";
import "./Pages.css";

/* ─────────────────────────────────────────────────────────────────────────
   The unsubscribe landing page, reached from a link in an email.

   No new stylesheet: this is one card and a button, and it borrows
   .ds-card / .ds-btn / .ds-note like every other page. The handful of rules
   it needs sit in Pages.css.

   A dead link here is NOT an error state. Somebody clicking an old
   unsubscribe link is trying to do the right thing, and meeting them with a
   red failure — or worse, leaving them unsure whether it worked — is how
   people give up and press "spam" instead, which costs the sending domain
   far more than the unsubscribe ever would.
   ───────────────────────────────────────────────────────────────────────── */

function Preferences() {
    const { token } = useParams();
    const [state, setState] = useState({ loading: true, error: "", masked: null, done: false });
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await apiGet(`/api/preferences/${token}`);
            if (!res.success) {
                return setState({ loading: false, error: res.message || "That link is no longer valid.", masked: null, done: false });
            }
            setState({
                loading: false, error: "",
                masked: res.maskedEmail,
                done: !!res.alreadyUnsubscribed,
            });
        })();
    }, [token]);

    const unsubscribe = async () => {
        setBusy(true);
        const res = await apiPost(`/api/preferences/${token}/unsubscribe`, {});
        setBusy(false);
        if (!res.success) {
            return setState((s) => ({ ...s, error: res.message || "We could not record that. Please try again." }));
        }
        setState((s) => ({ ...s, done: true, error: "" }));
    };

    if (state.loading) {
        return (
            <div className="ds-wrap ds-section ds-center">
                <span className="ds-spin" style={{ margin: "0 auto" }} />
            </div>
        );
    }

    /* Calm, not an error page. */
    if (state.error && !state.masked) {
        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card prefs">
                    <h1>That link has expired</h1>
                    <p className="ds-muted">
                        {state.error} If you are trying to stop receiving email from us, write to
                        us and we will take care of it — you do not need a working link for that.
                    </p>
                    <div className="prefs__actions">
                        <Link to="/contact" className="ds-btn">Contact us</Link>
                        <Link to="/" className="ds-btn ds-btn--ghost">Back to the site</Link>
                    </div>
                </div>
            </div>
        );
    }

    if (state.done) {
        return (
            <div className="ds-wrap ds-section">
                <div className="ds-card prefs">
                    <h1>You are unsubscribed</h1>
                    <p className="ds-muted">
                        We will not send email to <span className="prefs__email ds-mono">{state.masked}</span> again.
                        Nothing further is needed from you.
                    </p>
                    <p className="ds-faint">
                        The free scan and all five tools stay available without an account, and
                        without any email at all.
                    </p>
                    <div className="prefs__actions">
                        <Link to="/" className="ds-btn ds-btn--ghost">Back to the site</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ds-wrap ds-section">
            <div className="ds-card prefs">
                <p className="ds-eyebrow">Email preferences</p>
                <h1>Unsubscribe</h1>
                <p className="ds-muted">
                    This will stop all email to{" "}
                    <span className="prefs__email ds-mono">{state.masked}</span>.
                </p>
                <p className="ds-faint">
                    We show only part of the address. You will recognise your own; nobody
                    following this link learns one.
                </p>

                {state.error && <div className="ds-error">{state.error}</div>}

                <div className="prefs__actions">
                    <button className="ds-btn" onClick={unsubscribe} disabled={busy}>
                        {busy ? <><span className="ds-spin" /> Working…</> : "Unsubscribe from all email"}
                    </button>
                    <Link to="/" className="ds-btn ds-btn--ghost">Keep receiving email</Link>
                </div>
            </div>
        </div>
    );
}

export default Preferences;

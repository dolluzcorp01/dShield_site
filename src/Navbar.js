import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";
import eagle from "./assets/img/eagle-mark.png";
import {
    SERVICES_LEFT, SERVICES_RIGHT, COMPLY_LEFT, COMPLY_RIGHT,
} from "./data/site-content";

/* ─────────────────────────────────────────────────────────────────────────
   The header, ported from the frozen prototype (line 1034).

   Brand · What we do · Services ▾ · Compliance ▾ · Smart Checks · a magenta
   "Talk to experts" pushed to the far edge.

   THE BRAND IS COMPOSED, NOT AN IMAGE.
   The prototype embeds the lockup as a base64 PNG and says in its own
   comment that the supplied artwork sets the wordmark in black against a
   near-black ground, so it recolours the black pixels to bone before
   embedding. DOLLUZ_Full_Logo.png in this repository is that same artwork:
   vertical, with black type. At a 70px header height it would be both the
   wrong shape and invisible.

   So the eagle comes from eagle-mark.png — already isolated, already gold —
   and the wordmark is set in the display face. It scales without blurring,
   costs 11 kB instead of 150, and takes its colours from the tokens.

   THE MEGA MENUS OPEN ON HOVER *OR* KEYBOARD FOCUS.
   The prototype's open only on mouseenter, with no keyboard path at all, so
   half the navigation is unreachable without a mouse. Here the trigger is a
   real button with aria-expanded and aria-haspopup, opening on focus as well
   as hover; Escape closes, and so does focus leaving the header. Clicking
   the trigger itself goes to the section — see the note on Trigger for why
   click must not also toggle.
   ───────────────────────────────────────────────────────────────────────── */

/* The ticker. Every item is a claim made elsewhere and has to stay true: 58
   is the check count in src/utils/checks/index.js, 23 and 5 are the coverage
   map, and 18 is the difference. If one stops matching the engine this is a
   lie scrolling across the top of every page — which is why
   scripts/verify-site-content.mjs asserts the numbers. */
const TICKER = [
    "23 RISK AREAS",
    "5 VISIBLE FROM OUTSIDE",
    "18 BEHIND THE DOOR",
    "58 CHECKS",
    "NO SIGN-UP",
    "NO CARD",
    "BOLT IS WATCHING",
];

/* The four sections the nav points at. They live on the home page, so from
   anywhere else the link has to go home first and then to the anchor. */
const SECTIONS = {
    "what-we-do": "What we do",
    "smart-checks": "Smart Checks",
};

function MegaMenu({ left, right, leftLabel, rightLabel, onPick }) {
    return (
        <div className="mega" role="menu">
            <div className="mega__col">
                <p className="mega__label">{leftLabel}</p>
                {left.map((x) => (
                    <button className="mega__item" role="menuitem" key={x.name} onClick={() => onPick(x)}>
                        <span className="mega__name">
                            {x.name}
                            {x.platform && <span className="mega__tag">DC PLATFORM</span>}
                        </span>
                        <span className="mega__note">{x.note}</span>
                    </button>
                ))}
            </div>

            {/* the silver line — fades to nothing at both ends rather than
                cutting the box in half with a hard rule */}
            <div className="mega__rule" aria-hidden="true" />

            <div className="mega__col">
                <p className="mega__label mega__label--alt">{rightLabel}</p>
                {right.map((x) => (
                    <button className="mega__item" role="menuitem" key={x.name} onClick={() => onPick(x)}>
                        <span className="mega__name">{x.name}</span>
                        <span className="mega__note">{x.note}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function Navbar() {
    const [open, setOpen] = useState(false);      // mobile drawer
    const [menu, setMenu] = useState(null);       // "svc" | "comp" | null
    const location = useLocation();
    const navigate = useNavigate();
    const navRef = useRef(null);

    /* Go to a section of the home page. On "/" that is a scroll; from any
       other route it is a navigation that lands on the anchor.

       The prototype only ever scrolls, because it only has one page. */
    const goSection = useCallback((id) => {
        setOpen(false);
        setMenu(null);
        if (location.pathname === "/") {
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            navigate(`/#${id}`);
        }
    }, [location.pathname, navigate]);

    /* Escape closes an open menu, and so does focus or the pointer leaving
       the header entirely. Without the focusout half, tabbing out of the last
       item leaves the panel hanging open over the page. */
    useEffect(() => {
        if (!menu) return;
        const onKey = (e) => { if (e.key === "Escape") setMenu(null); };
        const onFocusOut = (e) => {
            if (navRef.current && !navRef.current.contains(e.relatedTarget)) setMenu(null);
        };
        document.addEventListener("keydown", onKey);
        navRef.current?.addEventListener("focusout", onFocusOut);
        const node = navRef.current;
        return () => {
            document.removeEventListener("keydown", onKey);
            node?.removeEventListener("focusout", onFocusOut);
        };
    }, [menu]);

    /* OPEN ON HOVER *OR* FOCUS. CLICK GOES TO THE SECTION.

       The obvious wiring — hover opens, click toggles — is broken on a
       mouse: entering the trigger opens the panel, and the click that
       follows immediately toggles it shut again, so it is impossible to
       open by clicking. Splitting the two jobs fixes it and is also the
       accessible arrangement: onFocus means a keyboard user tabbing to the
       trigger gets the panel and can tab straight into its items, which the
       prototype's hover-only version makes unreachable entirely. */
    const Trigger = ({ id, label, left, right, leftLabel, rightLabel, onPick, onActivate }) => (
        <div
            className="nav__group"
            onMouseEnter={() => setMenu(id)}
            onMouseLeave={() => setMenu((m) => (m === id ? null : m))}
            onFocus={() => setMenu(id)}
        >
            <button
                className={`nav__link nav__link--drop${menu === id ? ` is-open is-open--${id}` : ""}`}
                aria-expanded={menu === id}
                aria-haspopup="true"
                onClick={onActivate}
            >
                {label} <span aria-hidden="true">▾</span>
            </button>
            {menu === id && (
                <MegaMenu
                    left={left} right={right}
                    leftLabel={leftLabel} rightLabel={rightLabel}
                    onPick={onPick}
                />
            )}
        </div>
    );

    return (
        <>
            {/* Two identical runs sliding to -50% is what makes the loop
                seamless. The second is aria-hidden so a screen reader reads
                the list once rather than twice, and the whole thing stops
                dead under prefers-reduced-motion via the rule in index.css. */}
            <div className="ticker">
                <div className="ticker__track">
                    {[0, 1].map((copy) => (
                        <div className="ticker__run" key={copy} aria-hidden={copy === 1 ? "true" : undefined}>
                            {TICKER.map((t) => (
                                <span className="ticker__item" key={t}>★ {t}</span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <header className="nav" ref={navRef}>
                <div className="ds-wrap nav__inner">
                    <Link to="/" className="nav__brand" onClick={() => { setOpen(false); setMenu(null); }}>
                        <img className="nav__mark" src={eagle} alt="" aria-hidden="true" width="40" height="31" />
                        <span className="nav__lockup">
                            <span className="nav__word">DOLLUZ CORP</span>
                            <small className="nav__tag">One Place . One Start . One Team</small>
                        </span>
                    </Link>

                    <nav className={`nav__links ${open ? "is-open" : ""}`} aria-label="Main">
                        <button className="nav__link" onClick={() => goSection("what-we-do")}>
                            {SECTIONS["what-we-do"]}
                        </button>

                        <Trigger
                            id="svc" label="Services"
                            left={SERVICES_LEFT} right={SERVICES_RIGHT}
                            leftLabel="Run continuously" rightLabel="When it must be proven"
                            onActivate={() => goSection("services")}
                            /* The platform entry is our own product, so it goes
                               to the scan rather than to an enquiry form. */
                            onPick={(x) => { setMenu(null); navigate(x.platform ? "/" : "/contact"); }}
                        />

                        <Trigger
                            id="comp" label="Compliance"
                            left={COMPLY_LEFT} right={COMPLY_RIGHT}
                            leftLabel="Standards" rightLabel="Data & privacy"
                            onActivate={() => goSection("compliance")}
                            onPick={() => goSection("compliance")}
                        />

                        <button className="nav__link" onClick={() => goSection("smart-checks")}>
                            {SECTIONS["smart-checks"]}
                        </button>
                    </nav>

                    {/* A SIBLING OF .nav__links, NOT A CHILD OF IT.

                        margin-left:auto only pushes when there is free space
                        to consume. Inside .nav__links — a flex row sized to
                        its own content — there is none, so the button sat
                        against the last link with the whole right half of the
                        header empty. As a third child of .nav__inner the auto
                        margin has the row's spare width to eat, and the brand
                        and the button anchor opposite edges at every width.

                        A fixed margin would land correctly at one viewport and
                        nowhere else.

                        Scrolls to the section on the home page, routes to
                        /contact from anywhere else. It stays an <a> with a
                        real href either way, so it is still a link a
                        middle-click or a screen reader can use — a button
                        that navigates is neither. */}
                    <Link
                        to="/contact"
                        className={`nav__cta${open ? " is-open" : ""}`}
                        onClick={(e) => {
                            if (location.pathname !== "/") { setOpen(false); setMenu(null); return; }
                            e.preventDefault();
                            goSection("contact");
                        }}
                    >
                        Talk to experts
                    </Link>

                    <button
                        className="nav__burger"
                        aria-label="Menu"
                        aria-expanded={open}
                        onClick={() => setOpen((v) => !v)}
                    >
                        <span /><span /><span />
                    </button>
                </div>
            </header>
        </>
    );
}

export default Navbar;

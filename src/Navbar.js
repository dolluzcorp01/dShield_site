import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";
import eagle from "./assets/img/eagle-mark.png";

/* Five plus the Free-scan button is the most that fits before the mobile
   breakpoint. /coverage is deliberately NOT here — it is reached from the
   scan result and the homepage gap card, which is where somebody is actually
   thinking about what a scan could not see. */
const LINKS = [
    { to: "/services", label: "Services" },
    { to: "/how-it-works", label: "How it works" },
    { to: "/pricing", label: "Pricing" },
    { to: "/tools", label: "Free tools" },
    { to: "/trust", label: "Trust" },
];

/* The ticker. Every item is a claim made elsewhere on the site and has to
   stay true: 58 is the check count in src/utils/checks/index.js, and 23 and
   5 are the coverage map. If a number here stops matching the engine, this
   is a lie scrolling across the top of every page. */
const TICKER = [
    "58 CHECKS",
    "NO SIGN-UP",
    "NO CARD",
    "23 RISK AREAS",
    "5 VISIBLE FROM OUTSIDE",
];

function Navbar() {
    const [open, setOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const go = (to) => { setOpen(false); navigate(to); };

    return (
        <>
            {/* Two identical runs sliding to -50% is what makes the loop
                seamless. The second is aria-hidden so a screen reader reads
                the list once rather than twice, and the whole thing stops
                dead under prefers-reduced-motion via the rule in index.css. */}
            <div className="ticker">
                <div className="ticker__track">
                    {[0, 1].map((copy) => (
                        <div
                            className="ticker__run"
                            key={copy}
                            aria-hidden={copy === 1 ? "true" : undefined}
                        >
                            {TICKER.map((t) => (
                                <span className="ticker__item" key={t}>★ {t}</span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <header className="nav">
                <div className="ds-wrap nav__inner">
                    <Link to="/" className="nav__brand" onClick={() => setOpen(false)}>
                        {/* The Dolluz eagle, in its own gold. It is the PARENT
                            company's mark sitting inside a "BY DOLLUZ CORP"
                            lockup, so it keeps its own colour rather than being
                            repainted lime with the rest of dShield. */}
                        <img className="nav__mark" src={eagle} alt="" aria-hidden="true"
                             width="34" height="26" />
                        <span className="nav__name">
                            dShield
                            <small>BY DOLLUZ CORP</small>
                        </span>
                    </Link>

                    <nav className={`nav__links ${open ? "is-open" : ""}`}>
                        {LINKS.map((l) => (
                            <Link
                                key={l.to}
                                to={l.to}
                                className={location.pathname === l.to ? "is-active" : ""}
                                onClick={() => setOpen(false)}
                            >
                                {l.label}
                            </Link>
                        ))}
                        <button className="ds-btn ds-btn--sm nav__cta" onClick={() => go("/")}>
                            Free scan
                        </button>
                    </nav>

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

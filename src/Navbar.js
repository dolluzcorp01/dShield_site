import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

const LINKS = [
    { to: "/how-it-works", label: "How it works" },
    { to: "/pricing", label: "Pricing" },
    { to: "/tools", label: "Free tools" },
    { to: "/trust", label: "Trust" },
];

function Navbar() {
    const [open, setOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const go = (to) => { setOpen(false); navigate(to); };

    return (
        <header className="nav">
            <div className="ds-wrap nav__inner">
                <Link to="/" className="nav__brand" onClick={() => setOpen(false)}>
                    <span className="nav__mark" aria-hidden="true">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2.5 4 6v6c0 4.6 3.2 8.6 8 9.8 4.8-1.2 8-5.2 8-9.8V6l-8-3.5Z"
                                  stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            <circle cx="12" cy="11.5" r="2.4" fill="currentColor" />
                        </svg>
                    </span>
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
    );
}

export default Navbar;

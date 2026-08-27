import React, { useState } from "react";
import { Link } from "react-router-dom";
import { DOMAINS, SEEN_DOMAINS } from "./data/site-content";
import { Count } from "./Motion";
import "./TwentyThree.css";

/* How many areas a free check reaches. Derived, so the counter in the
   headline cannot disagree with the grid. */
const SEEN_COUNT = SEEN_DOMAINS.length;

/* ─────────────────────────────────────────────────────────────────────────
   THE 23 — the tile grid, ported from the frozen prototype's section of the
   same name (line 1183 of 01-customer-website-v5.9-FROZEN.jsx).

   THE PROTOTYPE HAS TWO TILE STATES. THIS HAS THREE, AND HAS TO.

   There, a tile is either lit — a hardcoded score of 62, 78, 41, 94 or 10 —
   or dark, meaning "we need to look inside". Two states, because with
   LIVE_API = false there was never a real scan to disagree with them.

   A real scan produces a third case. From dolluzcorp.com today:

       d1  score 100, 0 findings        lit
       d4  score 100, 0 findings        lit
       d6  score 100, 0 findings        lit
       d20 score 0,   1 finding         lit
       d10 absent from domainScores     ← this one

   Domain 10's only snapshot check is BREACH-METADATA-55, and crt.sh
   answered 404. The engine recorded it inconclusive and excluded it from
   both sides of the scoring sum, which is the rule that exists because an
   aborted scan once reported grade A, score 100 and zero findings.

   With two states that tile falls dark, and dark says "connect a system or
   answer questions". That is the wrong sentence. Nothing needs connecting —
   a public source was unreachable for ninety seconds. Telling a customer to
   buy a tier to see something a retry would have shown is a small lie that
   the whole product is arranged against.

   So: lit, unreachable, and unseen. The third one is amber, says what
   actually happened, and offers a retry rather than an upsell.
   ───────────────────────────────────────────────────────────────────────── */

/* Which of the three a tile is in.

   `scanned` comes from coverageMap — the engine's own list of what this tier
   attempts. A domain it attempted but produced no score for was attempted
   and failed, and that is the distinction the third state carries. */
function tileState(d, result, measuring) {
    /* Mid-scan. The engine has reached this area and has not finished it —
       a real state from a real progress event, not a timer.

       IT SHOWS NO NUMBER. We do not have one yet, and a placeholder score
       that changed when the scan landed would be exactly the invented
       figure this grid exists to avoid. */
    if (!result) return measuring?.includes(d.n) ? "measuring" : "idle";

    const attempted = (result.coverageMap || []).some((c) => c.no === d.n && c.scanned);
    if (!attempted) return "unseen";

    const scored = result.domainScores?.[d.n];
    if (scored && scored.score !== null && scored.score !== undefined) return "lit";

    return "unreachable";
}

/* Why a domain could not be reached, in the words the engine recorded.

   The reason string comes from the check itself ("crt.sh returned HTTP 404"),
   not from a lookup table here. A generic "something went wrong" would be a
   second description of an event we already have the first description of. */
function unreachableReasons(d, result) {
    return (result?.inconclusive || []).filter((i) => i.domain === d.n);
}

function Tile({ d, state, open, onToggle, result }) {
    const scored = result?.domainScores?.[d.n];

    /* The label a screen reader gets. The prototype announces ", scored 62"
       from its constant; this announces the real number, and says plainly
       which of the three states the tile is in rather than leaving a bare
       "?" to be guessed at. */
    const aria = {
        idle: `${d.name}, not checked yet`,
        measuring: `${d.name}, checking now`,
        lit: `${d.name}, scored ${scored?.score} out of 100`,
        unreachable: `${d.name}, could not be checked`,
        unseen: `${d.name}, not covered by a free scan`,
    }[state];

    return (
        <button
            type="button"
            className={`t23 t23--${state}${open ? " t23--open" : ""}`}
            aria-expanded={open}
            aria-label={aria}
            onClick={() => onToggle(open ? null : d)}
        >
            <span className="t23__top">
                <span className="t23__no">{String(d.n).padStart(2, "0")}</span>

                {state === "lit" && (
                    <span className="t23__score"><Count to={scored.score} /></span>
                )}
                {state === "unreachable" && (
                    <span className="t23__mark t23__mark--warn" aria-hidden="true">!</span>
                )}
                {state === "measuring" && (
                    <span className="t23__mark t23__mark--live" aria-hidden="true">•••</span>
                )}
                {(state === "unseen" || state === "idle") && (
                    <span className="t23__mark" aria-hidden="true">?</span>
                )}
            </span>

            <span className="t23__name">{d.name}</span>
        </button>
    );
}

/* The panel under the grid. One of three, matching the tile that opened it. */
function Detail({ d, state, result }) {
    if (state === "lit") {
        const scored = result.domainScores[d.n];
        const n = scored.findings;
        return (
            <div className="t23d t23d--lit">
                <p className="ds-eyebrow t23d__eyebrow">We checked this</p>
                <h3 className="t23d__title">{d.name}</h3>
                <p className="t23d__found">
                    {n === 0
                        ? `Scored ${scored.score} — nothing failed here.`
                        : `Scored ${scored.score} · ${n} problem${n > 1 ? "s" : ""} found.`}
                </p>
                {n > 0 && (
                    /* Severity and count, never a title. issueSummary carries
                       domain and severity only — the paywall is server-side
                       and this panel must not become the place it leaks. */
                    <p className="ds-muted t23d__sub">
                        {(result.issueSummary || [])
                            .filter((i) => i.domain === d.n)
                            .map((i) => i.severity)
                            .join(" · ")}
                        {" — the free check counts them. Naming them is the Basic report."}
                    </p>
                )}
            </div>
        );
    }

    if (state === "unreachable") {
        const reasons = unreachableReasons(d, result);
        return (
            <div className="t23d t23d--warn">
                <p className="ds-eyebrow t23d__eyebrow">We could not check this</p>
                <h3 className="t23d__title">{d.name}</h3>
                <p className="t23d__found">
                    We tried and could not get an answer, so this area has no score.
                </p>
                {reasons.length > 0 && (
                    <ul className="t23d__reasons">
                        {reasons.map((r) => (
                            <li key={r.checkId}>
                                <span className="t23d__check">{r.checkId}</span> {r.reason}
                            </li>
                        ))}
                    </ul>
                )}
                {/* No upsell here. Nothing about this needs buying — the
                    source was unreachable, and a retry is the honest offer. */}
                <p className="ds-muted t23d__sub">
                    It is left out of the grade entirely rather than counted as a pass.
                    Running the check again later usually settles it.
                </p>
            </div>
        );
    }

    return (
        <div className="t23d t23d--unseen">
            <p className="ds-eyebrow t23d__eyebrow">We could not see this</p>
            <h3 className="t23d__title">{d.name}</h3>
            <p className="t23d__found">We cannot tell you {d.hides}.</p>
            <span className="t23d__how">
                <span className="t23d__howtag">{d.by === "connect" ? "CONNECT" : "ANSWER"}</span>
                <span>
                    {d.by === "connect"
                        ? `Link ${d.tool} and we measure it.`
                        : "Answered in the guided review."}
                </span>
            </span>
        </div>
    );
}

/**
 * @param result  a completed scan response, or null before one has run.
 *                Pass null and the grid renders its idle state — every tile
 *                dim with a "?", which is what the home page shows before
 *                anybody has typed a domain.
 */
function TwentyThree({ result, measuring }) {
    const [open, setOpen] = useState(null);

    const states = Object.fromEntries(DOMAINS.map((d) => [d.n, tileState(d, result, measuring)]));
    const live = DOMAINS.filter((d) => states[d.n] === "measuring").length;
    const lit = DOMAINS.filter((d) => states[d.n] === "lit").length;
    const unreachable = DOMAINS.filter((d) => states[d.n] === "unreachable").length;

    /* The counter line. It reports what happened rather than what was
       promised: five checked reads as a success when one of the five in fact
       failed to run, and that gap is the thing this product exists to close. */
    const headline = !result
        ? (live || measuring?.length
            ? `checking… ${measuring.length} of ${SEEN_COUNT} areas started`
            : "23 areas · none checked yet")
        : unreachable > 0
            ? `${lit} scored · ${unreachable} could not be checked · ${23 - lit - unreachable} need a look inside`
            : `${lit} scored / ${23 - lit} need a look inside`;

    return (
        <section className="t23s ds-wrap" id="the-23">
            <div className="t23s__head">
                <p className={`ds-eyebrow${result ? " t23s__eyebrow--done" : ""}`}>{headline}</p>
                {result && <p className="t23s__hint">TAP ANY TILE ↓</p>}
            </div>

            <div className="t23s__grid">
                {DOMAINS.map((d) => (
                    <Tile
                        key={d.n}
                        d={d}
                        state={states[d.n]}
                        open={open?.n === d.n}
                        onToggle={setOpen}
                        result={result}
                    />
                ))}
            </div>

            {open && <Detail d={open} state={states[open.n]} result={result} />}

            {!result && (
                <p className="ds-muted t23s__foot">
                    A free check scores five of these. The grid shows all twenty-three, including
                    the eighteen it cannot reach — <Link to="/coverage">what the other eighteen cover</Link>.
                </p>
            )}
        </section>
    );
}

export default TwentyThree;

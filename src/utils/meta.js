// ─────────────────────────────────────────────────────────────────────────
//  meta — per-route <title>, description, canonical and robots.
//
//  No SEO library. The usual React head-management packages are a
//  dependency, a provider to wire and a maintenance surface, and what they
//  do here is about forty lines of DOM.
//
//  WHAT THIS FIXES, AND WHAT IT DOES NOT.
//
//  Google executes JavaScript, so it sees these tags. Most social preview
//  crawlers — WhatsApp, Slack, LinkedIn, Twitter — fetch the raw HTML and
//  never run it. A link pasted into WhatsApp will show whatever is in
//  public/index.html, NOT the tags set here.
//
//  That is why the static block in public/index.html is written as a good
//  generic description of the whole site rather than of the homepage: it is
//  the one every share preview will actually use. Genuine per-page previews
//  need server-rendered tags, which is a much larger change.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

// Absolute canonical URLs, from one place. Hardcoding the domain across
// fifteen components is how a staging deployment ends up publishing
// canonicals that point at production and quietly de-indexes itself.
export const SITE_URL =
    (process.env.REACT_APP_SITE_URL || "https://dshield.dolluzcorp.com").replace(/\/+$/, "");

function upsertMeta(name, content) {
    let el = document.head.querySelector(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

function removeMeta(name) {
    const el = document.head.querySelector(`meta[name="${name}"]`);
    if (el) el.remove();
}

function upsertLink(rel, href) {
    let el = document.head.querySelector(`link[rel="${rel}"]`);
    if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
    }
    el.setAttribute("href", href);
}

/**
 * Set the document metadata for a route.
 *
 * @param title       full <title>, including the " | dShield" suffix
 * @param description meta description
 * @param canonical   absolute path, e.g. "/tools/ssl" — resolved against SITE_URL
 * @param noindex     true to ask crawlers not to index this page
 *
 * Nothing is restored on unmount: every route sets its own on mount, so a
 * restore would only ever undo the page being navigated to.
 */
export function useDocumentMeta({ title, description, canonical, noindex } = {}) {
    useEffect(() => {
        if (title) document.title = title;
        if (description) upsertMeta("description", description);
        if (canonical) upsertLink("canonical", `${SITE_URL}${canonical}`);

        // Removed rather than set to "index" when false. Leaving a stale
        // noindex behind after navigating away from a result page would
        // quietly de-index whatever the visitor opened next.
        if (noindex) upsertMeta("robots", "noindex"); else removeMeta("robots");
    }, [title, description, canonical, noindex]);
}

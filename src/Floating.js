import React, { useEffect, useState } from "react";
import { WHATSAPP_HREF } from "./data/site-content";
import "./Floating.css";

/* ─────────────────────────────────────────────────────────────────────────
   The floating pair, from the prototype's FLOATING section (line 1933):
   a WhatsApp button, and a back-to-top that appears once you have scrolled.

   THE WHATSAPP BUTTON RENDERS ONLY IF THERE IS A NUMBER TO CALL.

   The prototype's is a <button> with no handler and no number - OFFICE there
   carries "+91 00000 00000" for both phone and whatsapp. Shipping that gives
   a customer a green WhatsApp button that either does nothing or opens a
   chat with a number nobody owns, on a page whose FAQ promises "a phone
   number that a person answers".

   So it is driven by OFFICE.whatsapp in data/site-content.js. Set that to a
   real number in international format without punctuation - "919876543210" -
   and the button appears. Leave it unset and only the back-to-top renders.
   verify-site-content.mjs fails the build if a placeholder run of zeroes
   ever gets put there.
   ───────────────────────────────────────────────────────────────────────── */

/* The URL itself is built in site-content.js, beside the number it is built
   from, because the footer and the contact card offer the same chat and all
   three have to agree. */
const waHref = WHATSAPP_HREF;

function Floating() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 600);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div className="float">
            {waHref && (
                <a
                    className="float__wa"
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat with us on WhatsApp"
                >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                        <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
                        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.42 1.27 4.86L2 22l5.28-1.24A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.2c-1.6 0-3.09-.47-4.34-1.28l-.31-.19-3.13.74.75-3.05-.2-.32A8.16 8.16 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2z" />
                    </svg>
                </a>
            )}

            {scrolled && (
                <button
                    className="float__top"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    aria-label="Back to top"
                >
                    ↑
                </button>
            )}
        </div>
    );
}

export default Floating;

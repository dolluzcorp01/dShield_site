export const API_BASE =
    process.env.NODE_ENV === "production"
        ? process.env.REACT_APP_API
        : "http://localhost:4008";

export async function apiFetch(endpoint, options = {}) {
    return fetch(`${API_BASE}${endpoint}`, {
        credentials: "include",
        ...options,
    });
}

export async function apiPost(endpoint, body) {
    const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ success: false, message: "Unexpected response from the server." }));
    return { ok: res.ok, ...data };
}

export async function apiGet(endpoint) {
    const res = await apiFetch(endpoint);
    const data = await res.json().catch(() => ({ success: false, message: "Unexpected response from the server." }));
    return { ok: res.ok, ...data };
}

/* ─────────────────────────────────────────────────────────────────────────
   apiStream — POST that reads Server-Sent Events back.

   NOT EventSource. That only speaks GET, and a GET that runs a scan would be
   something a crawler or a link prefetcher could fire: every preview bot
   that touched the URL would spend a scan and a rate-limit slot. The scan
   writes rows and sends mail; it has to stay a POST.

   So this reads the response body as a stream and splits it on the blank
   line that terminates an SSE frame. Frames can arrive split across chunks,
   which is why the tail is carried in `buf` rather than parsed per chunk.

   onEvent is called for every frame. The promise resolves with the LAST
   object seen, so a caller that only wants the finished scan can ignore
   onEvent entirely and await the result.

   Falls back to a plain JSON POST when the browser has no ReadableStream, or
   when the server answered with JSON anyway — which is what happens behind a
   proxy that buffers the whole response. Same object either way.
   ───────────────────────────────────────────────────────────────────────── */
export async function apiStream(endpoint, body, onEvent) {
    let res;
    try {
        res = await apiFetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
            body: JSON.stringify(body),
        });
    } catch {
        return { ok: false, success: false, message: "We could not reach the checker. Please try again." };
    }

    const ct = res.headers.get("content-type") || "";

    // The server chose JSON, or this browser cannot stream. Read it whole.
    if (!ct.includes("text/event-stream") || !res.body?.getReader) {
        const data = await res.json().catch(() => ({
            success: false, message: "Unexpected response from the server.",
        }));
        return { ok: res.ok, ...data };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let last = null;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let cut;
        while ((cut = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, cut);
            buf = buf.slice(cut + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let payload;
            try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }
            last = payload;
            if (typeof onEvent === "function") onEvent(payload);
        }
    }

    if (!last) return { ok: false, success: false, message: "The scan ended without a result." };
    if (last.type === "error") return { ok: false, success: false, message: last.message };
    return { ok: true, ...last };
}

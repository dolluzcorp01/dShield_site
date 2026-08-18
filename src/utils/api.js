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

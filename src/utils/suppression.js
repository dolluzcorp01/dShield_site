// ─────────────────────────────────────────────────────────────────────────
//  suppression — the one place that knows how a suppressed address is
//  recognised.
//
//  This exists so there is exactly ONE definition of the hash and ONE
//  definition of the lookup. Three routers ask the same question — Lead,
//  Legal and Scan — and if each carried its own copy, a change to the
//  hashing (a trim, a case fold, a different algorithm) would silently stop
//  matching rows written by the others. A suppression list that fails to
//  match is indistinguishable from an empty one: everybody who unsubscribed
//  quietly starts receiving email again, and nothing errors.
//
//  The stored form is SHA-256 of the lowercased, trimmed address and nothing
//  else. See db/schema-legal.sql for why there is no email column.
// ─────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");

/** SHA-256 of the lowercased, trimmed address — the only form we ever store. */
function emailHash(email) {
    return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
}

/**
 * Has this address asked us to stop?
 *
 * Callback style, matching the rest of the backend — `db.query` here is
 * callback-based and this deliberately does not introduce a promise layer
 * over it.
 *
 * callback(err, suppressed). Callers decide what an error means for them:
 * Lead_server refuses the request, Scan_server skips the lead but still
 * returns the scan. Both are documented where they happen.
 */
function isSuppressed(db, email, callback) {
    db.query(
        "SELECT 1 FROM email_suppression WHERE email_hash = ? LIMIT 1",
        [emailHash(email)],
        (err, rows) => {
            if (err) return callback(err, false);
            callback(null, !!(rows && rows.length));
        }
    );
}

module.exports = { emailHash, isSuppressed };

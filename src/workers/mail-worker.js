// ─────────────────────────────────────────────────────────────────────────
//  mail-worker — drains mail_outbox.
//
//  A setInterval poller, not a queue library. There is no Redis in this app
//  and introducing one to send four emails a day would be absurd.
//
//  ⚠️  THIS RUNS IN-PROCESS BECAUSE THE SITE IS A SINGLE INSTANCE.
//
//  Under PM2 cluster mode, four processes would each poll this same table on
//  the same schedule and every message would go out four times. Marking a row
//  'sending' before work narrows the window but does not close it — two
//  processes can still SELECT the same row before either UPDATEs it.
//
//  If this is ever scaled, the fix is a lock (SELECT ... FOR UPDATE SKIP
//  LOCKED, or a single dedicated worker process), NOT a shorter interval.
// ─────────────────────────────────────────────────────────────────────────

const { sendNow, isConfigured } = require("../utils/mail");
const { render } = require("../utils/mail-templates");
const { isSuppressed } = require("../utils/suppression");

const TICK_MS = 30000;
const BATCH = 10;
const MAX_ATTEMPTS = 5;

let running = false;   // guards against a slow tick overlapping the next one

function claim(db, callback) {
    db.query(
        `SELECT id, to_email, cc, template, category, subject, payload, attempts
           FROM mail_outbox
          WHERE status = 'queued' AND attempts < ?
          ORDER BY queued_at
          LIMIT ?`,
        [MAX_ATTEMPTS, BATCH],
        callback
    );
}

function markFailed(db, row, err) {
    // Back to 'queued', not 'failed' — the row is retried until attempts hits
    // the ceiling, at which point it simply stops being selected. It is never
    // deleted: a permanently undelivered email is something somebody needs to
    // be able to find and act on.
    const attempts = row.attempts + 1;
    const status = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
    db.query(
        "UPDATE mail_outbox SET status = ?, attempts = ?, last_error = ? WHERE id = ?",
        [status, attempts, String(err && err.message ? err.message : err).slice(0, 500), row.id],
        (e) => { if (e) console.error("⚠️  Could not record mail failure:", e.sqlMessage || e.message); }
    );
    console.error(`⚠️  Mail ${row.id} (${row.template}) attempt ${attempts} failed:`, err && err.message);
}

function processRow(db, row, done) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload || "{}") : (row.payload || {});

    const send = () => {
        let rendered;
        try {
            rendered = render(row.template, payload);
        } catch (err) {
            markFailed(db, row, err);
            return done();
        }

        sendNow({ to: row.to_email, cc: row.cc, subject: row.subject || rendered.subject, html: rendered.html, text: rendered.text })
            .then(() => {
                db.query(
                    "UPDATE mail_outbox SET status = 'sent', sent_at = NOW() WHERE id = ?",
                    [row.id],
                    (e) => { if (e) console.error("⚠️  Could not mark mail sent:", e.sqlMessage || e.message); }
                );
                console.log(`📧 Sent ${row.template} → ${row.to_email} (row ${row.id})`);
                done();
            })
            .catch((err) => {
                // SendGrid puts the useful part in response.body.errors.
                const detail = err?.response?.body?.errors?.map((x) => x.message).join("; ");
                markFailed(db, row, new Error(detail || err.message));
                done();
            });
    };

    /* Suppression is checked HERE as well as at signup, and only for
       marketing. Someone can unsubscribe between a message being queued and
       it being sent — the signup check prevents a subscription, this one
       prevents a delivery, and they are not the same guard.

       Transactional mail is deliberately exempt: a scan result is something
       the person asked for by typing their address into a box that said so,
       and withholding it because they unsubscribed from marketing last year
       is not what suppression is for. */
    if (row.category !== "marketing") return send();

    isSuppressed(db, row.to_email, (err, suppressed) => {
        if (err) {
            markFailed(db, row, new Error("Suppression check failed: " + err.message));
            return done();
        }
        if (suppressed) {
            // Not an attempt, and not 'failed'. We chose not to send this.
            db.query(
                "UPDATE mail_outbox SET status = 'suppressed' WHERE id = ?",
                [row.id],
                (e) => { if (e) console.error("⚠️  Could not mark mail suppressed:", e.sqlMessage || e.message); }
            );
            console.log(`🔕 Suppressed ${row.template} → ${row.to_email} (row ${row.id})`);
            return done();
        }
        send();
    });
}

function tick(db) {
    if (running) return;
    running = true;

    claim(db, (err, rows) => {
        if (err) {
            running = false;
            return console.error("⚠️  Mail worker could not read the outbox:", err.sqlMessage || err.message);
        }
        if (!rows || !rows.length) { running = false; return; }

        // Mark the batch 'sending' before doing any work, so the next tick
        // cannot pick up the same rows.
        const ids = rows.map((r) => r.id);
        db.query("UPDATE mail_outbox SET status = 'sending' WHERE id IN (?)", [ids], (e) => {
            if (e) {
                running = false;
                return console.error("⚠️  Mail worker could not claim rows:", e.sqlMessage || e.message);
            }
            let left = rows.length;
            const done = () => { if (--left === 0) running = false; };
            rows.forEach((r) => processRow(db, r, done));
        });
    });
}

/**
 * Start polling. Returns the interval handle so a caller could stop it.
 *
 * With no API key configured this still starts and still logs once, but
 * leaves rows 'queued' rather than failing them — so a developer running
 * locally can exercise the whole flow, see rows appear, and have them go out
 * the moment a key is added rather than having to re-create them.
 */
function startMailWorker(db) {
    /* Recover rows stranded in 'sending'.
       If the process died between claiming a batch and finishing it — a
       restart, a deploy, a crash — those rows are 'sending' and the claim
       query only ever looks at 'queued', so nothing would touch them again.
       They would sit there looking busy forever, which is precisely the
       silent mail loss this whole table exists to prevent.

       Safe on a single instance: nothing else is mid-send at boot. If this
       ever runs as more than one process, this needs an age condition. */
    db.query(
        "UPDATE mail_outbox SET status = 'queued' WHERE status = 'sending'",
        (err, res) => {
            if (err) return console.error("⚠️  Could not recover stranded mail rows:", err.sqlMessage || err.message);
            if (res && res.affectedRows) {
                console.log(`✉️  Requeued ${res.affectedRows} mail row(s) left mid-send by a previous run.`);
            }
        }
    );

    if (!isConfigured()) {
        console.log("✉️  Mail worker started, but SENDGRID_API_KEY is not configured — messages will queue and wait.");
        return null;
    }
    console.log(`✉️  Mail worker started, polling every ${TICK_MS / 1000}s.`);
    const handle = setInterval(() => tick(db), TICK_MS);
    handle.unref();
    setTimeout(() => tick(db), 2000).unref();   // first pass shortly after boot
    return handle;
}

module.exports = { startMailWorker, tick, TICK_MS, MAX_ATTEMPTS };

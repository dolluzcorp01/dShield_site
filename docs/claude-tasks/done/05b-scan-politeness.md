# Claude Code — dShield Site · Task 05b
## Scan politeness, backoff, and honest copy

**Repo:** `dolluzcorp01/dShield_site` · branch `main`
**Prerequisite:** Task 05a merged (`3d15da3`)
**Do not touch:** `src/utils/tools_engine.js`, `src/utils/suppression.js`,
`src/utils/mail.js`, `src/workers/mail-worker.js`,
`src/backend_routes/Tools_server.js`

---

## Why this task exists

Task 05a got our IP blocked by dolluzcorp.com — a normal customer site on
ordinary shared hosting, not an unusual target.

The cause is `surface.js`, which requests **31 speculative paths** per scan:
`/admin`, `/wp-admin/`, `/backup.zip`, `/db.sql`, `/phpmyadmin/`,
`/wp-config.php.bak`, `/manager/html`, `/solr/` and the rest. To a web
application firewall that is not "reading published information" — it is the
signature of directory brute-forcing, which is what an attacker does first.
The server identified it correctly and stopped answering.

Two problems follow.

**1. Blocked scans produce no grade.** When a target stops responding, checks
time out, coverage falls below the floor and we correctly refuse to publish a
score. That is the right behaviour and it worked. But *"we could not grade
you"* is a terrible first impression, and the free scan is the top of the
entire funnel.

**2. The copy on `/how-it-works` is now misleading.** It says:

> **No port scanning.** ... It sets off intrusion detection and it is not what
> a customer agreed to when they typed a domain.
>
> **No attempts to break in.** We never try a login ... never touch anything we
> are not invited to.

Every sentence is literally true. Together they give an impression we have just
disproved: we set off intrusion detection anyway, and nobody invited us to
request `/wp-config.php.bak`.

For a company whose entire differentiator is honesty about what it can and
cannot see, a true-but-misleading claim is worse than an unflattering one.

---

## Design decisions — follow these, do not substitute

### Politeness is a property of the scanner, not of each check

Do not scatter delays through 58 check files. Put the pacing in one place — the
scheduler in `scan_engine.js` and the fetch helper in `net.js` — so there is a
single number to tune and a single place to read.

### Rate matters more than volume

Most firewalls trigger on requests-per-second from one source, not on total
requests. 31 requests over 25 seconds usually passes; 31 in two seconds
usually does not. Spread them.

### Detect the block and stop — do not keep firing

This is the most important part of the task.

Once a target starts refusing us, every further request makes the block longer
and tells their security team we are hostile. If several consecutive requests
to one host time out or return 403/429, **stop probing that host** and mark the
remaining checks for it inconclusive with a clear reason.

An honest *"the site stopped responding to us"* is a better outcome than
thirty more requests into a wall.

### The free tier probes least

The noisiest paths are the ones every brute-force tool tries, and they are what
gets us blocked. Move them up-tier: a free visitor gets a scan that is very
unlikely to be blocked, and paid tiers — where the customer has accepted terms
and knows what we do — probe harder.

This also improves the commercial story rather than weakening it: the paid scan
genuinely looks harder.

### Change the copy to be true, not to be softer

Do not delete the honesty section. Make it accurate. Saying plainly *"we
request common paths, your security tools may log this"* is a stronger position
than implying we tiptoe — and it demonstrates the thing we claim to sell.

---

## What to build

### 1 · `src/utils/net.js` — pacing and backoff

Add a small per-host request governor used by every outbound HTTP request in a
scan:

- **Minimum spacing** between requests to the same host:
  `SCAN_MIN_REQUEST_GAP_MS`, default **700ms**
- **Maximum concurrency** to the same host: **2**
- Different hosts are unaffected — crt.sh and Cloudflare DoH must not be slowed
  by pacing meant for the target

Add a `HostState` record per scan tracking consecutive failures. A failure is a
timeout, a connection reset, or an HTTP **403** or **429**.

- After **4 consecutive failures** to one host, mark that host `blocked`
- Every subsequent request to it returns immediately with an error reading
  `Target stopped responding — scanning was stopped to avoid pressuring the
  server`
- Reset the counter on any successful response

Export a `resetHostState()` so each scan starts clean. State must not leak
between scans — one blocked target must not poison the next visitor's scan.

### 2 · `src/utils/scan_engine.js` — scheduling

- Batch size against the **target host** drops to **2**. Keep larger batches for
  checks that talk to other hosts.
- Order checks so cheap, quiet ones run first: DNS, TLS, then the single
  homepage fetch, then the speculative paths last. If the target blocks us
  partway, the checks that matter most have already completed.
- Raise the overall budget from 150s to **180s**, since pacing makes scans
  slower by design. Free scans are unaffected — they run 8 checks.
- When a host is marked blocked, remaining checks for it become inconclusive
  with the reason above, and the scan finishes normally rather than hanging.

### 3 · Move the noisiest paths up-tier

In `surface.js`, split the probe lists by tier. The check IDs, severities and
titles do **not** change — only which paths each tier requests.

**Never requested below `advanced`** — these are the classic brute-force
signatures:

`/phpmyadmin/` · `/manager/html` · `/solr/` · `/jenkins/` · `/kibana/` ·
`/grafana/login` · `/administrator/`

**Free (`snapshot`) requests only:** `/.git/config`, `/.env`, and
`/.well-known/security.txt`. Three paths, all of which a well-run site expects
to be asked for.

**`basic`** adds the backup and directory-listing paths.
**`advanced`** adds the full list.

Add a comment above the lists recording why they are split, so nobody
helpfully consolidates them later.

### 4 · Honest copy — `src/Pages.js`

In `HowItWorks`, the "What we will never do" grid: keep the four cards but
correct the second one, and add a fifth.

Replace the **"No attempts to break in"** body with:

> We never try a login, never submit input designed to make something fail, and
> never attempt to gain access. We do request a small number of common web
> paths — the sort an attacker checks first — because finding an exposed backup
> file or an open admin page is the point.

Add a fifth card, **"We are not invisible, and we do not pretend to be"**:

> Our scanner identifies itself in every request and comes from a fixed
> address. Your security tools may log the scan, and some firewalls will block
> it — if that happens we stop, and say so rather than pressing on. A tool that
> tried to hide from your defences would be a strange thing to buy from a
> security company.

In `Trust`, under what we store, add one line:

> Every request we make identifies itself as dShield and links back to this
> site, so anyone reviewing their own logs can see exactly who we were.

### 5 · Result page — explain a blocked scan properly

`src/Result.js` already handles `status === "inconclusive"`. When the reason
indicates a block rather than a timeout, the wording should say so:

> **{domain} stopped responding to us partway through.** This usually means a
> firewall or security service identified the scan and blocked it — which is
> your protection working. We stopped rather than pressing on. Trying again in
> an hour usually succeeds, and if you own this domain you can allow our
> scanner instead.

Do not present this as our failure or theirs. It is a firewall doing its job.

---

## Verification before you finish

Note the blocked IP from Task 05a may still be in effect, which will itself be
a useful test.

```bash
# 1 — check catalogue still intact
node scripts/verify-checks.js

# 2 — build and boot
npx react-scripts build
node server.js &
curl -s localhost:4008/api/health

# 3 — free scan still 8 checks, and now quieter
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"github.com"}'
```

**Then count the requests**, which is the real measure of this task. Add a
temporary counter, or use the host governor's own state:

```bash
node -e "
const { runScan } = require('./src/utils/scan_engine');
(async () => {
  for (const tier of ['snapshot','basic','advanced']) {
    const t = Date.now();
    const r = await runScan('github.com', { tier });
    console.log(tier.padEnd(10), r.grade, r.score,
      '| ran', r.checksRun, '| incon', r.inconclusive.length,
      '|', ((Date.now()-t)/1000).toFixed(1)+'s');
  }
})();
"
```

Report, for each tier: **how many HTTP requests were made to the target host**,
and the elapsed time. Expected roughly: snapshot ≤ 6 requests, basic ≤ 20,
advanced ≤ 40 — each spaced at least 700ms apart.

**Then test the backoff**, which cannot be assumed:

Point a scan at a host that refuses connections — `http://127.0.0.1:9` will not
work because private addresses are correctly refused, so use a real domain that
returns 403 to unknown clients, or temporarily stub the fetch helper to return
403. Confirm that after four consecutive failures the remaining checks stop
firing and return the blocked reason, rather than each timing out in turn.

Report how many requests were made after the block was detected. It should
be **zero**.

**Then confirm the free scan is unchanged in substance:**

```bash
curl -s -X POST localhost:4008/api/scan \
     -H "Content-Type: application/json" \
     -d '{"domain":"github.com"}'
```

Same grade and counts as before this task, only slower.

Also confirm:
- `git diff package.json` is empty
- No path from the advanced-only list appears in a snapshot scan
- The five cards render on `/how-it-works`

---

## Report back

1. Files edited
2. Requests-to-target and timing per tier
3. Whether the backoff test fired, and how many requests followed the block
4. Whether dolluzcorp.com has become reachable again
5. Anything wrong or conflicting in these instructions. Tasks 01, 02 and 05a
   each found genuine errors in theirs and were right to say so.

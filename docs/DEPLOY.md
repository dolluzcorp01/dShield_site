# dShield Site — deployment and live state

The runbook for `dshield.dolluzcorp.com`, and the current state of the server
it runs on. `CLAUDE.md` describes what the code is and the rules it must not
break; this file describes where it runs and what is still outstanding.

Written 22 August 2026. If something here contradicts the server, the server
is right — say so rather than working around it.

---

## Where it runs

| | |
|---|---|
| Public URL | `https://dshield.dolluzcorp.com` |
| Droplet | DigitalOcean, Bangalore, `64.227.135.222` |
| Spec | **1 vCPU · 1 GB RAM · 24 GB disk** — shared with nine other apps |
| App root | `/var/www/dolluzcorp.com/dshield` |
| Web root | `/var/www/dolluzcorp.com/dshield/build` (nginx serves this directly) |
| API | Express on **port 4008**, behind nginx at `/api/` |
| Process | pm2, `dshield-backend`, id 10, **fork mode** |
| nginx | `/etc/nginx/sites-available/dshield.dolluzcorp.com` |
| TLS | Let's Encrypt via certbot, auto-renewing |
| Database | MySQL 8 on the same droplet, schema `dshield` |

**Never run pm2 in cluster mode.** The scan rate limiter is in-memory and per
IP; four workers would mean four times the limit. Fork mode only, until the
limiter moves to Redis.

---

## The deploy routine

The site is **not** updated by `git pull`. `git pull` updates the API. The
website is whatever sits in `build/`, and that only ever arrives by `scp`.

### 1 · On the laptop — commit and build

```powershell
git add -A
git commit -m "what changed"
git push origin main
npm run build
```

The build **must** happen locally. This droplet cannot run `react-scripts
build` — it has around 50 MB of memory available and the build needs hundreds.

### 2 · On the server — backend first

```bash
cd /var/www/dolluzcorp.com/dshield
git pull origin main
PUPPETEER_SKIP_DOWNLOAD=true npm install --omit=dev   # only if dependencies changed
pm2 restart dshield-backend
pm2 logs dshield-backend --lines 15 --nostream
```

`PUPPETEER_SKIP_DOWNLOAD=true` matters: a plain `npm install` tries to
download around 200 MB of Chrome onto a disk that has been at 92% before.

### 3 · On the laptop — ship the build, then fix the modes

```powershell
scp -r build/* root@64.227.135.222:/var/www/dolluzcorp.com/dshield/build/
ssh root@64.227.135.222 "chmod -R u=rwX,g=rX,o=rX /var/www/dolluzcorp.com/dshield/build"
```

**Both lines. Every time.** See the next section — this is not optional.

Note `build/*` rather than `build`: it copies the contents into the existing
directory, so it behaves the same whether or not the directory is already
there.

### 4 · Confirm

```bash
curl -sI https://dshield.dolluzcorp.com | head -1
curl -s https://dshield.dolluzcorp.com/ | grep -o 'main\.[a-z0-9]*\.js'
curl -s https://dshield.dolluzcorp.com/api/health
```

Want `HTTP/2 200`, then the hash from the build you just made. If it names an
older hash, the upload did not land.

### Which steps you actually need

| Changed | Steps |
|---|---|
| Frontend only (`src/*.js`, `*.css`, `public/`) | 1, 3, 4 — no server visit |
| Backend only (`server.js`, `backend_routes/`, `utils/`) | 1, 2, 4 — no build, no upload |
| Both | all four |

---

## The permissions trap — read this before deploying

**`scp -r` from Windows sets directories to `700` on the server.** nginx runs
as `www-data`, cannot traverse a `700` directory, returns 403, and the
`error_page` turns that into the maintenance page. The site looks like it is
mid-deploy when in fact it is broken.

This has taken the site down **twice**. Both times the error log said:

```
"/var/www/dolluzcorp.com/dshield/build/index.html" is forbidden (13: Permission denied)
```

The cause is not the server umask. `umask` governs files a process creates
locally; `scp -r` carries the *source* permission bits, and Windows has no
POSIX modes, so the OpenSSH client synthesises restrictive ones. Confirmed by
`stat` after a deploy: `build` and `build/static` were `700`, while
`index.html`, which already existed, kept its `755`.

So the `chmod` in step 3 is a required part of every deploy, not a repair.

Use `u=rwX,g=rX,o=rX` rather than `755` — the capital `X` sets execute on
directories only, so JS and CSS files are not marked executable.

### Diagnosing a maintenance page

```bash
sudo tail -20 /var/log/nginx/error.log
ls -la /var/www/dolluzcorp.com/dshield/MAINTENANCE
pm2 list | grep dshield
curl -s localhost:4008/api/health
```

- `(13: Permission denied)` — the trap above. Run the chmod.
- `(2: No such file or directory)` — the upload landed somewhere else.
- Backend down — only takes the site down if the nginx SPA fallback proxies to
  Node, which it currently does **not**. See Outstanding, item 6.

---

## Environment

`.env` lives at `/var/www/dolluzcorp.com/dshield/.env`, is gitignored, and sits
**one level above the web root**, so it is not reachable over HTTP.
`.env.example` in the repo lists every key with no real values.

| Key | State |
|---|---|
| `NODE_ENV` | must be `production` — see Outstanding, item 5 |
| `PDF_ENABLED` | **`false`** — Chrome needs around 700 MB, this box has ~50 MB free |
| `RAZORPAY_KEY_ID` / `_SECRET` | still `rzp_test_*` |
| `RAZORPAY_WEBHOOK_SECRET` | **empty** — see Outstanding, item 1 |
| `MAIL_WORKER_ENABLED` | `true` |
| `SENDGRID_API_KEY` | live, and needs rotating |

After editing `.env`, restart with `pm2 restart dshield-backend --update-env`.
A plain restart reuses the old environment and the change appears to have been
ignored. Then `pm2 save`.

---

## Outstanding, in priority order

### 1 · `RAZORPAY_WEBHOOK_SECRET` is empty — blocks all payments

The webhook is the authority on whether an order was paid. With no secret every
webhook fails signature validation, logs `signature_valid=0`, and fulfils
nothing. **A customer would pay and receive nothing.**

Create the webhook in the Razorpay dashboard pointing at
`https://dshield.dolluzcorp.com/api/payments/webhook`, event
`payment.captured`, paste the secret into `.env`, restart with `--update-env`,
then test with a real card before announcing anything.

### 2 · Keys are `rzp_test_*`

No real money moves until Razorpay approves live keys and they are swapped.

### 3 · The legal documents are placeholders

`/legal/terms` says *"awaiting legal review and is not yet binding"*, and the
stored documents contain **seven** unfilled markers:

```
[[LEGAL_ENTITY_NAME]] [[REGISTERED_ADDRESS]] [[CIN]] [[JURISDICTION]]
[[SUPPORT_EMAIL]] [[GRIEVANCE_OFFICER_NAME]] [[GRIEVANCE_OFFICER_EMAIL]]
```

Checkout asks customers to accept that document, and Razorpay onboarding
generally requires published policies. The library is versioned — replacing a
placeholder is version 2 with version 1 preserved.

### 4 · Mojibake in the live legal documents

Three of the four stored documents contain `ÔÇö` where an em-dash belongs.
`db/schema-legal.sql` is **clean UTF-8** — the corruption happened on import,
almost certainly a Workbench connection not set to `utf8mb4`.

```bash
curl -s https://dshield.dolluzcorp.com/api/legal | grep -c 'ÔÇö'
```

Re-import the affected documents over a `utf8mb4` connection rather than
hand-editing rows.

### 5 · Confirm `NODE_ENV=production` actually took

This controls `app.set("trust proxy", 1)`. Without it Express sees every
request as coming from nginx at `127.0.0.1`, so the per-IP scan limiter of
12/hour becomes **12 scans per hour for the entire internet combined** — the
thirteenth visitor is refused because of what twelve strangers did.

```bash
pm2 env 10 | grep NODE_ENV
```

### 6 · Soft 404s — nginx serves the SPA, so Express never decides

`server.js` has a known-route list and returns a real 404 for unknown paths,
but that code only runs when Express serves the pages. nginx currently does
(`try_files $uri $uri/ @react`), so `https://dshield.dolluzcorp.com/nonsense`
returns **200**. Search engines will index typo'd URLs as real pages.

The fix is to let nginx pass page routes to Node rather than duplicating the
route list in nginx, where the two would drift:

```nginx
location / {
   if (-f /var/www/dolluzcorp.com/dshield/MAINTENANCE) { return 503; }
   try_files $uri @node;
}
location @node {
   proxy_pass http://localhost:4008;
   proxy_http_version 1.1;
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   add_header Cache-Control "no-store, must-revalidate" always;
}
```

**The trade-off:** afterwards, if `dshield-backend` goes down the whole site
shows the maintenance page rather than a marketing site with a dead scanner.
Defensible for dShield, since the scan is the product — but it is a real
change and should be a deliberate choice, not a side effect.

Not urgent while nothing links to nonexistent routes. Do it before pushing SEO.

### 7 · Rotate the `SENDGRID_API_KEY`

It has been pasted into chat transcripts and can send mail as the domain.

---

## The box is full

Measured 22 August 2026:

```
Mem:  961Mi total, 910Mi used, available 51Mi
Swap: 4.0Gi total, 2.5Gi used    (/swapfile is 2G of 2G, completely full)
Disk: 84% used, 3.9G free
```

**It is not the Node apps.** All ten pm2 processes together use about 111 MB —
dShield itself is 18.6 MB. The pressure is almost certainly `mysqld`, whose
MySQL 8 defaults assume a dedicated server.

Consequences already being paid: PDFs are disabled, the build cannot run on the
server, and `pm2 list` shows restart counts of 22 for `dadmin`, 14 for `dslip`
and 10 for `dolluzcorp`.

Before resizing, find the real consumer:

```bash
ps -eo pid,rss,comm --sort=-rss | head -15
grep -iE "innodb_buffer_pool_size|max_connections" /etc/mysql/mysql.conf.d/mysqld.cnf
```

**2 GB** stops the memory pressure. **4 GB** is what the README specifies for
PDF rendering — and the Basic tier promises *"PDF and machine-readable export"*
at $49, so that is the size which matches what is being sold.

A resize reboots the droplet and brings back all ten sites. Run `sudo nginx -t`
and take a snapshot first — a config that survives only because nginx has not
reloaded is a config that dies on restart.

---

## Things that have already gone wrong

Kept so they are not repeated.

- **certbot deployed the certificate to `000-default` twice**, because the
  dShield symlink was missing the first time, and because `000-default` then
  contained `server_name dshield.dolluzcorp.com`. It also cloned a `return
  444;` into the SSL block, which presented as `PROTOCOL_ERROR`. `000-default`
  should be a six-line catch-all and nothing else.
- **`proxy_read_timeout` must stay at 300s.** A scan takes 20–60 seconds and
  the nginx default is 60 — a slow target would 504 mid-scan.
- **The scanner got itself IP-blocked by `dolluzcorp.com`** during development
  by requesting many speculative paths. The host governor in `src/utils/net.js`
  exists because of that.
- **`storage/` must never be served by nginx.** Paid PDFs go through the API
  behind a signed token.
- **`db/*.sql` is committed** deliberately; dumps and local database files stay
  ignored.

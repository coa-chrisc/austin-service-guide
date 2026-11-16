# Deploying to Railway

Railway runs the app from the repo's `Dockerfile` as one always-on container, with HTTPS on a Railway domain, the same optional access-code gate as the Vercel deployment, and the configuration kept in the repo as code (`.railway/railway.ts`). It is an alternative to Vercel when you want a container instead of a serverless function.

There are two shapes:

- **Shape A, the whole app on Railway.** Available now and documented below.
- **Shape B, Vercel app plus a Railway back end** (the research job worker from #18, its Postgres and a private SearXNG). **Built and deployed** for the reference project on 2026-11-15; #19 and #14 P1 will reuse the worker and database. See [Shape B](#shape-b-job-worker-postgres-and-searxng).

`.railway/railway.ts` describes shape B (`WITH_APP_SERVICE = false`, `WITH_JOB_SERVICES = true`); shape A is documented and was type-checked but has not been deployed. Read [What was and was not validated](#what-was-and-was-not-validated) before you rely on any step.

## How it fits together

| File | Role |
| --- | --- |
| `Dockerfile` (repo root) | The image. Railway uses a file named `Dockerfile` at the root of the source automatically ([Dockerfiles](https://docs.railway.com/builds/dockerfiles)). Its `CMD` listens on `$PORT`. |
| `.railway/railway.ts` | Infrastructure as code. `WITH_APP_SERVICE` adds the `app` service (shape A: health check, region, variables); `WITH_JOB_SERVICES` adds `worker`, `postgres` and `searxng` (shape B). |
| `.railway/package.json` | Deploy-time tooling only: the `railway` SDK (which provides `railway/iac`) and TypeScript for `npm run --prefix .railway typecheck`. Not part of the app build. |
| `.railwayignore` | Keeps local state (`.claude/`, `graft/`, env files, `node_modules`) out of `railway up` uploads, like `.vercelignore` does for Vercel. |
| `backend/app/access_gate.py` | Optional access-code gate, on when `ACCESS_CODES` is set. Unchanged from Vercel. |
| `deploy/railway/searxng/` | `settings.yml` and a two-line `Dockerfile` for the private SearXNG service (shape B). |

**Why `.railway/railway.ts` and not `railway.toml` or `railway.json`.** Railway's Config as Code files are deprecated: "Existing Config as Code files stop being read on **2026-12-01** (hard cutoff)", and "New services cannot opt into Config as Code" ([Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)). Do not add either file. Infrastructure as Code is evaluated by the Railway CLI on your machine (or in CI); "Railway doesn't read `.railway/` during deploys", so the file changes nothing until someone runs `railway config apply`.

**Why the SDK lives in `.railway/`.** The CLI runs `railway.ts` with Node, and Node resolves `railway/iac` from the file's own directory upward. Railway's docs say to install the SDK at the repository root ([railway config](https://docs.railway.com/cli/config)); a `package.json` inside `.railway/` works the same way and keeps the repo root free of a Node project, so the Vercel build and `frontend/package-lock.json` are untouched.

**What the file sets, and what it leaves alone.** It uses only keys Railway's [IaC reference](https://docs.railway.com/infrastructure-as-code/reference) documents: `healthcheck`, `replicas` (a region map), `env` with literals, `preserve()` and cross-service references, and `postgres(...)`. It does not declare the service's source (the reference allows leaving `source` out "when `.railway/railway.ts` should manage service settings but not declare a GitHub repository or Docker image"), so the same file works with a GitHub-connected service and with `railway up`. It needs no Dockerfile key, because Railway detects the root `Dockerfile` itself.

### How Railway runs the image

- **Port.** Railway injects `PORT` and health-checks on it ([Healthchecks](https://docs.railway.com/deployments/healthchecks)). The file pins `PORT=8000`, matching the image's `EXPOSE` and `HEALTHCHECK`, so the domain's target port, the health check and the container agree.
- **Health check.** `GET /api/v1/health`, which the access gate leaves public and which does not call OpenAI. Railway calls it only while a new deployment comes up, "until it receives a successful response (any `2xx` status code)", for up to 300 seconds by default, from the hostname `healthcheck.railway.app`. It is not continuous monitoring.
- **Proxy headers.** Railway's edge sets `X-Forwarded-Proto` (it "always indicates `https`") and `X-Real-IP` ([Specs & Limits](https://docs.railway.com/networking/public-networking/specs-and-limits)). The gate's `Secure` cookie flag and the app's `Strict-Transport-Security` header both read `X-Forwarded-Proto` directly, so they work behind Railway without trusting proxies in uvicorn. Leave `FORWARDED_ALLOW_IPS` at the image default (`127.0.0.1`): the app does not use the client address, and other services in the same project can reach the container over the private network without passing the edge, so `*` would let them spoof forwarded headers. Uvicorn's access log then shows the edge's address, not the resident's.
- **Request time.** There is no function duration cap, but the edge closes an HTTP request "after 5 minutes with no data transferred" (up to 15 minutes while data keeps flowing). A single agent turn sends nothing until it finishes, so in practice the ceiling is close to Vercel's 300 seconds. Long-running work belongs in the planned worker, not in a longer request.
- **Secrets at build time.** Railway exposes service variables to a Dockerfile build only when the Dockerfile declares them with `ARG` ([Dockerfiles](https://docs.railway.com/builds/dockerfiles#using-variables-at-build-time)). Ours declares only the city, data pack and map tile variables, so the OpenAI key and the gate secrets never reach a build layer.

## First deploy

Prerequisites: a Railway account on a plan that allows always-on services (see [Cost](#cost)), the Railway CLI at **5.42.1 or newer** (the `railway` SDK 3.17.0 refuses older CLIs; check with `railway --version`, update with `railway upgrade`), Node 22 or newer for the SDK, and an OpenAI API key.

Creating the project starts billing. The commands below run from the repo root. These steps are shape A: first set `WITH_APP_SERVICE = true` in `.railway/railway.ts` (and `WITH_JOB_SERVICES = false` unless you also want the research worker).

### 1. Project and service

```bash
railway login
railway init --name civic-service-guide     # creates the project; keep the name used in project(...) in .railway/railway.ts
railway add --service app                   # creates an empty service named app and links this directory to it
```

### 2. Secrets and settings

Set every variable that `.railway/railway.ts` declares with `preserve()` **before** the first `railway config apply`, so the apply finds them on Railway. Pipe values in so secrets never land in shell history or on screen. `--skip-deploys` avoids a deploy per variable while the service has no source yet.

```bash
pbpaste | railway variable set OPENAI_API_KEY --stdin --service app --skip-deploys     # macOS; on Linux: xclip -o | ...
python3 -c "import secrets;print(secrets.token_urlsafe(32),end='')" | railway variable set ADMIN_API_TOKEN --stdin --service app --skip-deploys
```

Access gate (recommended for any demo):

```bash
# One label:code pair per person or group, codes ≥ 8 characters.
printf 'alex:xxxx-xxxx-xxxx,funder:yyyy-yyyy-yyyy' | railway variable set ACCESS_CODES --stdin --service app --skip-deploys
python3 -c "import secrets;print(secrets.token_urlsafe(48),end='')" | railway variable set ACCESS_GATE_SECRET --stdin --service app --skip-deploys
```

Generate readable codes with:

```bash
python3 -c "import secrets;a='abcdefghjkmnpqrstuvwxyz23456789';print('-'.join(''.join(secrets.choice(a) for _ in range(4)) for _ in range(3)))"
```

If you leave one of these out (no gate, no admin writes), delete its line from the `env` block in `.railway/railway.ts` too.

### 3. Domain

```bash
railway domain --service app --port 8000    # prints the generated https://<name>.up.railway.app domain
printf https://<name>.up.railway.app | railway variable set PUBLIC_ORIGIN --stdin --service app --skip-deploys
printf https://<name>.up.railway.app | railway variable set CORS_ORIGINS --stdin --service app --skip-deploys
```

The SPA and API share one origin, so the app needs no CORS. Set `CORS_ORIGINS` to the deployment's own origin anyway: left unset, the API allows credentialed cross-origin requests from the localhost dev origins.

### 4. Apply the configuration

```bash
npm ci --prefix .railway
npm run --prefix .railway typecheck
railway config plan       # read-only; values are shown as «hidden»
railway config apply      # asks you to confirm the plan it prints
```

The plan for a fresh `app` service should update only `app`: the health check path, the region and the four literal variables (`PORT`, `DEMO_MODE`, `VOICE_PIPELINE_MODE`, `ALLOW_RAW_AUDIO_STREAM`). Stop if it shows a delete you did not intend; see [Gotchas](#gotchas).

### 5. Deploy

Either upload the working tree:

```bash
railway up --service app --detach
```

`railway up` honours `.gitignore` and `.railwayignore` and skips `.git` and `node_modules` ([railway up](https://docs.railway.com/cli/up)). It uploads uncommitted changes too, so deploy from a clean checkout.

Or connect the GitHub repository so every push to the branch deploys:

```bash
railway service source connect --repo <owner>/<repo> --branch main --service app
```

Railway builds the root `Dockerfile` (the build log says "Using detected Dockerfile!"), starts the container and waits for the health check. The app loads the data pack and validates the city config at startup; a bad config fails the deploy at this point instead of serving the wrong city.

### 6. Seal the secrets

In the dashboard, open the `app` service's **Variables**, and for `OPENAI_API_KEY`, `ADMIN_API_TOKEN`, `ACCESS_CODES` and `ACCESS_GATE_SECRET` choose **Seal** from the variable's menu. A sealed value "is provided to builds and deployments but is never visible in the UI nor can it be retrieved via the API" ([Variables](https://docs.railway.com/variables#sealed-variables)). Sealing is one-way, sealed values are not returned by `railway variable` or `railway run`, and they are not copied into PR environments or duplicated environments (see [Gotchas](#gotchas)).

### Another place: build-time variables

`CITY_CONFIG` / `CITY_PRESET`, `CITY_DATA_DIR`, `VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION` select the city config, the data pack and the map tiles. The frontend build reads them, so they are **build-time** settings, and the backend reads the same variables at runtime. On Railway they are ordinary service variables: Railway passes them to the Docker build because the `Dockerfile` declares them with `ARG`, and to the running container as environment variables. They are not secrets, so set them in `.railway/railway.ts` (the commented lines in the `env` block) and apply. Never put them in `backend/.env`: `check_env_file` in `backend/app/services/city.py` refuses to start if it finds them there.

**Changing one needs a rebuild, not a restart.** `railway restart` reuses the existing image, so the old brand and pack stay baked in. After `railway config apply`, start a fresh build with `railway up --service app` (or push a commit to the connected branch), then check the build log for the frontend build and the page for the new brand. Railway's docs do not say whether the redeploy a variable change triggers rebuilds the image, so do not rely on it. Keep a data pack under `config/data/<id>/` so it is inside the build context. See [docs/CUSTOMIZING.md](../../docs/CUSTOMIZING.md).

Voice (optional): raw-audio Realtime voice. Read the zero-data-retention caveat under `ALLOW_RAW_AUDIO_STREAM` in the root `README.md` first, then change both literals in `.railway/railway.ts` (`VOICE_PIPELINE_MODE: "realtime_audio"`, `ALLOW_RAW_AUDIO_STREAM: "true"`) and apply. These are runtime settings; the redeploy is enough.

The backend sets a Content-Security-Policy, HSTS and the other security headers itself (`backend/app/security_headers.py`). If you use a custom tile server, its origin enters the policy through `VITE_MAP_TILE_URL`.

## Access codes

With `ACCESS_CODES` set, every path except `/access` (the code form), `/api/v1/health` and `/manifest.webmanifest` needs the access cookie. Pages redirect to the form; API calls get `401 {"detail": "Access code required."}`, which the SPA turns into a redirect to the form. A valid code sets an HttpOnly, Secure, SameSite=Lax cookie for 14 days.

- **Add or revoke a code:** `printf '<new list>' | railway variable set ACCESS_CODES --stdin --service app`. The change deploys. Cookies issued for a removed or changed code stop working immediately.
- **Sign everyone out:** rotate `ACCESS_GATE_SECRET` the same way.
- **Limits:** codes are shared secrets, not user accounts. There is no audit trail of who used which code, and failed attempts are slowed by one second but not counted, since serverless instances share no state. Use long codes and hand them out individually. (On Railway the container is long-running, but the gate still keeps no shared state, so the same applies.)

## Check the deployment

`deploy/vercel/smoke_test.py` works against any host. It checks the gate, the SPA, the catalog API and, with `--live`, one real AI turn and a Realtime client-secret mint. It uses only the standard library and reads the code from the environment:

```bash
ACCESS_CODE=<one of your codes> python3 deploy/vercel/smoke_test.py https://<name>.up.railway.app --live
```

Before a demo, also run a voice intake by hand in Chrome, as the [Vercel guide](../vercel/README.md#check-the-deployment) describes.

## Custom domain

```bash
railway domain services.example.gov --service app --port 8000
```

Railway prints a `CNAME` and a `TXT` record. Create **both** at your DNS provider; "If the `TXT` record is missing, requests to your custom domain will return a `404` error even after the `CNAME` resolves" ([Working with Domains](https://docs.railway.com/networking/domains/working-with-domains)). Railway issues a Let's Encrypt certificate, usually within an hour. Root domains need a DNS provider with ALIAS records or CNAME flattening. The Hobby plan allows 2 custom domains per service, Pro 20. Then update `PUBLIC_ORIGIN` and `CORS_ORIGINS` to the new origin.

To keep the domain in code instead, use the object form in `.railway/railway.ts`: `domains: [{ domain: "services.example.gov", port: 8000 }]`. A bare string targets port 8080, where nothing listens.

## Operations

- **Logs:** `railway logs --service app` (deploy logs), `--build`, or `--http`. Same stdout/stderr as the container; keep `REALTIME_DEBUG_LOG_ENABLED` off.
- **Health:** `GET /api/v1/health` (public even with the gate on). It does not call OpenAI.
- **Redeploy:** `railway redeploy --service app` creates a new deployment "with the exact same code and build/deploy configuration". `railway restart --service app` restarts without rebuilding.
- **Rollback:** in the dashboard, open an earlier deployment's menu and choose **Rollback**. "Both the Docker image and custom variables are restored", within your plan's image retention ([Deployment actions](https://docs.railway.com/deployments/deployment-actions)). Re-run `railway config plan` afterwards: restored variables may now differ from the file.
- **Rotating a secret:** pipe the new value into `railway variable set <NAME> --stdin --service app` (without `--skip-deploys`, so it deploys), confirm with the smoke test, then revoke the old value at its source (for the OpenAI key, in the OpenAI dashboard). The file does not change, because it holds `preserve()`, not the value.
- **Config drift:** `railway config plan --detailed-exit-code` exits `0` when Railway matches the file and `2` when changes are pending.
- **Region:** `REGION` in `.railway/railway.ts`, currently `us-east4-eqdc4a` (US East, Virginia). It decides where resident traffic is processed in shape A. Pick it deliberately and record the choice; identifiers are on [Regions](https://docs.railway.com/deployments/regions).
- **Request size:** the app's own intake limit (256 KiB) applies; there is no platform body cap like Vercel's 4.5 MB, but request bodies "must finish uploading within 5 minutes".

### Cost

Usage-based, on top of a plan fee: Hobby is $5 a month including $5 of usage, Pro $20 a month; resources cost $20 per vCPU-month, $10 per GB-month of RAM and $0.05 per GB of egress, and builds are free ([Pricing Plans](https://docs.railway.com/pricing/plans)). **Observed monthly cost: not yet measured.** Set a usage limit on the workspace before the first deploy ([Cost Control](https://docs.railway.com/pricing/cost-control)): the custom email alert is a soft limit, and the hard limit "takes your workloads offline". Railway's Serverless setting (formerly App Sleeping) can stop an idle service, but "The first request sent to a slept service may return a 502 Bad Gateway response" ([Serverless](https://docs.railway.com/deployments/serverless)), so leave it off for a demo.

## Gotchas

- **The file is the whole project.** One `.railway/railway.ts` per project means "omitting a resource means deleting it", and removing a variable is a destructive change in a plan. A variable you set on Railway but not in the file (for example `TWILIO_AUTH_TOKEN`) can show up as a delete. Add it to the `env` block as `preserve()` before you apply. Non-interactive applies refuse destructive changes without `--confirm-destructive`; do not add that flag by habit.
- **Custom domains in code need a port.** `domains: ["example.gov"]` targets port 8080. Use `{ domain, port: 8000 }`.
- **Build-time variables need a fresh build.** See [Another place](#another-place-build-time-variables).
- **PR environments are ungated.** Sealed variables "are not copied over when creating PR environments", so a PR environment gets no `ACCESS_CODES` and no OpenAI key: an open, scripted-mode copy of the app. Leave PR environments off, or set the gate variables in them.
- **Health-check hostname.** Railway health-checks from `healthcheck.railway.app`. The app has no host allowlist today; if one is ever added, include that hostname or deploys will fail.
- **CLI version.** The `railway` SDK 3.17.0 needs CLI 5.42.1 or newer ("Older CLIs use the retired TypeScript engine and will stop with an upgrade error").
- **Pipe values instead of typing them.** `railway variable set NAME --stdin` reads one value from stdin; `KEY=VALUE` on the command line lands in shell history.
- **Erasable TypeScript only.** The CLI runs `railway.ts` with Node's type stripping, so enums, namespaces and parameter properties fail. `tsconfig.json` sets `erasableSyntaxOnly` so the type check catches them first.
- **Private networking in older projects.** Environments created before October 16, 2025 resolve `*.railway.internal` to IPv6 only ([How Private Networking Works](https://docs.railway.com/networking/private-networking/how-it-works)). Shape A does not use the private network. For shape B see below.
- **Database region.** `postgres(...)` lands in Railway's default region unless the file sets one, and moving it afterwards is a destructive plan (a volume migration). Set `JOB_REGION` before the first apply.
- **Service regions can drift silently.** With CLI 5.74.0, changing the `replicas` region of a service that had not been deployed yet planned as "already up to date". Check `railway service list --json` (`regions`) after a region change.

## Shape B (job worker, Postgres and SearXNG)

In shape B, Vercel keeps the resident UI and API (the demo URL does not move) and Railway runs the long-running back end that Vercel cannot: no 300-second function cap, no work after the response, no shared state between instances. No resident intake data goes to Railway in this shape; it holds job parameters, public page text, the drafts built from it, and job events.

| Service | Public address | What protects it | Secrets and references |
| --- | --- | --- | --- |
| Vercel app | Yes (the demo URL) | Access gate; every job route also needs `X-Admin-Token` | `JOB_BACKEND=remote`, `JOB_WORKER_URL`, `JOB_WORKER_SECRET` |
| `worker` | Yes, a Railway domain, because Vercel calls it over the internet | Signed, single-use token (HMAC over method, path, query and body, 60-second window) on every route except `GET /healthz`; 401 with no detail on a bad token; no docs routes | `JOB_WORKER_SECRET`, `JOB_WORKER_SECRET_PREVIOUS`, `OPENAI_API_KEY` (or a separate `OPENAI_RESEARCH_API_KEY` with its own spend cap), `DATABASE_URL` by reference |
| `postgres` | None. Railway databases are "deployed private by default" ([PostgreSQL](https://docs.railway.com/databases/postgresql)); never add **Public Access**, which creates a TCP proxy | Private network only | Generated by Railway; the worker gets `DATABASE_URL` as `db.env.DATABASE_URL` |
| `searxng` | None. Never generate a domain: an open instance is quickly abused as a proxy | Private network only, at `http://searxng.railway.internal:8080` | `SEARXNG_SECRET` |

Exactly two public addresses: the Vercel app and the worker. The worker's page fetcher (`backend/app/research/fetch.py`) refuses `*.railway.internal`, `localhost`, single-label names and every non-global address (private, loopback, link-local, CGNAT, NAT64, Teredo, 6to4 or IPv4-mapped forms of those), resolves and checks again on every redirect hop, and connects to the checked address only. The configured `SEARXNG_URL` is exempt because the search provider calls it with its own client; that value never comes from user input.

**Search backend.** `RESEARCH_SEARCH_PROVIDER` on the worker picks one:

| | `searxng` (default here) | `openai_web_search` (alias `openai`) |
| --- | --- | --- |
| Where queries go | Your SearXNG, which forwards them to Brave, Google and Bing | OpenAI's hosted `web_search` tool |
| Extra services | `searxng` (about 110 MB of RAM idle) | None; `searxng` can be left out |
| Extra cost | Railway usage only | A per-call tool fee (about $0.01 per search; check OpenAI's pricing page) plus the tokens the search results add |
| Failure mode | Upstream engines rate-limit or block a busy instance; the job's events say "Search degraded" and name them | Depends on OpenAI only |

Either way the worker fetches the pages itself through the fetcher above, and the model reads only that fetched text. Change the provider with `railway variable set RESEARCH_SEARCH_PROVIDER=openai_web_search --service worker` (it redeploys) and edit the value in `.railway/railway.ts` to match.

**SearXNG.** `deploy/railway/searxng/settings.yml` keeps the defaults, enables the `json` format the worker reads, turns the limiter and public-instance features off, and keeps three engines (Brave, Google and Bing). DuckDuckGo was dropped because it answered every request from Railway's datacenter IPs with a CAPTCHA; Mojeek and Startpage are marked inactive in this SearXNG release; Wikipedia refuses to load without `general.contact_url`. Engine requests may take up to 10 s (15 s at most), under the worker's 20 s timeout. Not every engine honours `site:`, so for a site-restricted query the worker keeps only results on that domain or its subdomains, notes how many it dropped in the job events, and records a warning when none were on the site. When SearXNG reports `unresponsive_engines`, the search phase adds one "Search degraded" event naming them. It holds no secret: the official image reads `server.secret_key` from `SEARXNG_SECRET` ([SearXNG server settings](https://docs.searxng.org/admin/settings/settings_server.html)). Railway IaC has no config-file mount, so the `Dockerfile` next to it bakes the file into the pinned official image. The image listens on `[::]:8080`, which serves IPv4 and IPv6, so it works in both new and legacy private networks.

**Setting it up** (what was run for the reference project; prefix the commands with nothing, they read the linked project):

1. `railway init --name <project> --workspace <workspace>` from the repo root, which links the directory.
2. Pick `JOB_REGION` in `.railway/railway.ts`, then `railway config plan` (it should add `postgres`, `searxng` and `worker`) and `railway config apply`.
3. Set the secrets without echoing them, for example:
   `python3 -c "import secrets,sys;sys.stdout.write(secrets.token_urlsafe(48))" > /tmp/jws` (mode 0600), then `railway variable set JOB_WORKER_SECRET --stdin --service worker < /tmp/jws`. Do the same for `SEARXNG_SECRET` (`--service searxng`) and pipe in `OPENAI_API_KEY` for the worker. Keep the worker secret for Vercel, then delete the file.
4. Deploy SearXNG: `railway up deploy/railway/searxng --path-as-root --service searxng --ci`. For a GitHub source instead, set the root directory: `railway environment edit --service-config searxng source.rootDirectory /deploy/railway/searxng` ([Monorepo](https://docs.railway.com/deployments/monorepo)).
5. Deploy the worker from the repo root: `railway up --service worker --ci`. `INSTALL_WORKER_DEPS=true` reaches the `Dockerfile` as a build argument and installs `backend/requirements-worker.txt` (SQLAlchemy, psycopg). The worker creates its tables on start.
6. `railway domain --service worker --port 8000`. Do not generate one for `searxng` or `postgres`.
7. Check it from outside Railway: `JOB_WORKER_URL=https://<worker domain> JOB_WORKER_SECRET=... python backend/scripts/research_e2e.py smoke` (health, 401 unsigned, no docs, signed config, no-op job).
8. On Vercel, set `JOB_BACKEND=remote`, `JOB_WORKER_URL=https://<worker domain>` and the same `JOB_WORKER_SECRET` (and `ADMIN_API_TOKEN` if it is not set), and redeploy. The **Research agent** item appears in the staff console when the worker reports research enabled.
9. A real run, once the OpenAI key is set: `python backend/scripts/research_e2e.py research --county "Travis County" --state TX --topic "food pantries" --max-cost 2 --approve`.

Locally, `docker compose --profile jobs up --build` runs the same three services next to the app.

**Rotating `JOB_WORKER_SECRET`:** set `JOB_WORKER_SECRET_PREVIOUS` on the worker to the current value, set the new `JOB_WORKER_SECRET` on the worker, and let it deploy; then change `JOB_WORKER_SECRET` on Vercel and redeploy; then clear `JOB_WORKER_SECRET_PREVIOUS` on the worker.

**Bind address.** The worker is called over its public domain and binds `0.0.0.0`. Railway environments created after October 16, 2025 resolve private names to IPv4 and IPv6; older ones to IPv6 only. Anything that must accept private-network traffic in an older environment has to listen on `::`.

**Database operations.** The Railway Postgres template is a single node. Backups are a separate feature you turn on ([Backups](https://docs.railway.com/volumes/backups)); choose a policy before the database holds anything you cannot regenerate. Finished jobs and their drafts are deleted after `JOB_RETENTION_DAYS` (30).

**Cost.** Each service is capped at 1 vCPU and 1 GB in the file; Railway bills what is used. Measured idle on 2026-11-15, one hour after deploy: worker 65 MB, SearXNG 113 MB, Postgres 113 MB, all under 0.01 vCPU on average. At $10 per GB-month of RAM and $20 per vCPU-month that is about **$3 to $4 a month idle** for the three services, plus storage at $0.15 per GB-month. A research run adds a few minutes of CPU and the OpenAI usage, which the job caps (`RESEARCH_MAX_COST_USD`, default $20 per job). On the Hobby plan the included $5 of usage covers the idle cost. Remeasure with `railway metrics --service <name>` after real use.

## What was and was not validated

As of 2026-11-15:

| Step | Status |
| --- | --- |
| Railway docs | Read on 2026-11-15: every page linked in this guide. |
| `.railway/railway.ts` | `npm run --prefix .railway typecheck` passes (TypeScript 5.9.3, `railway` SDK 3.17.0). Evaluated with Node 24 type stripping, as the CLI does: with the flag off it describes one service, `app`, with the health check, region and ten variables; with the flag on it adds `postgres`, `searxng` and `worker`, with `DATABASE_URL` as a reference to `postgres`. |
| Railway CLI | 5.74.0. Shape B was created and deployed with the commands above on 2026-11-15. |
| `docker build` of the root `Dockerfile` | Not re-run for this guide (the Docker daemon was not running). The image itself is validated in [deploy/README.md](../README.md#status). |
| `railway config plan` / `apply` (shape B) | Run on 2026-11-15: the plan added `postgres`, `searxng` and `worker`; apply created them; the plan after deploy and domain generation reported no changes. |
| Shape B deploy and smoke test | Run on 2026-11-15: all three services `SUCCESS`; `research_e2e.py smoke` passed (healthz 200, unsigned 401, `/docs` 404, signed config 200, no-op job finished). |
| Shape B research run, SearXNG from the worker over the private network | Not run: the worker has no OpenAI key yet (`research_enabled: false`). `railway ssh` needs a registered SSH key, which was not added. |
| Shape A deploy, custom domain | Not run. |
| `preserve()` on a variable that is not set yet | Applied with `OPENAI_API_KEY` and `JOB_WORKER_SECRET_PREVIOUS` unset: no variable was created and the plan stays clean. |
| Rebuild on a variable change | Not tested; the guide says to start a fresh build. |
| SearXNG image | Built and started on Railway (`Listening at: http://[::]:8080`). |

Record the commands you run, their dates and the observed monthly cost here as the deployment changes.

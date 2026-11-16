# Deploying to Vercel

Vercel is the fastest path to a hosted demo: no container registry, no network setup, and a private URL with HTTPS on first deploy. The whole app (FastAPI backend plus the built React SPA) runs as **one Vercel Python function**, the same app the Docker image runs, with an optional access-code gate in front of it.

The Austin reference deployment runs this way at `https://civic-service-guide.vercel.app` (gated).

To run the same app as an always-on container instead, see [deploy/railway/README.md](../railway/README.md). That guide also describes the planned Railway back end (job worker, Postgres, private SearXNG) that this Vercel deployment would call for long-running work.

## How it fits together

| File (repo root) | Role |
| --- | --- |
| `vercel_app.py` | Entrypoint. Adds `backend/` to `sys.path`, points `STATIC_DIR` at `frontend/dist`, and imports `app.main:app`. |
| `pyproject.toml` | Tells Vercel this is a FastAPI project (`[tool.vercel] entrypoint = "vercel_app:app"`), pins Python 3.12, and lists runtime dependencies. **Keep it in sync with `backend/requirements.txt`.** |
| `vercel.json` | Build command (`cd frontend && npm ci && npm run build`), `maxDuration: 300` for long agent turns, and `excludeFiles` to keep the function bundle small. |
| `.vercelignore` | Keeps `node_modules`, virtualenvs, `.env` files and local builds out of the CLI upload. |
| `backend/app/access_gate.py` | Optional access-code gate, on when `ACCESS_CODES` is set. |

Vercel installs the Python dependencies, runs the build command (Node is available in the Python build image), and bundles the repo, including the freshly built `frontend/dist`, `config/` and the data pack, into the function. FastAPI serves the SPA from `frontend/dist` through `backend/app/spa.py`, exactly as in the container.

Because the gate is top-level ASGI middleware, Vercel keeps static files inside the function instead of promoting them to its CDN. That is intended: nothing, not even the JavaScript bundle, loads without a code. For an ungated public deployment the cost is a function invocation per asset, which is fine at demo scale.

Voice in `realtime_audio` mode works unchanged: the browser opens its WebRTC connection straight to OpenAI, and the function only mints the short-lived client secret and runs tool calls.

## First deploy

Prerequisites: a Vercel account, the Vercel CLI (`npm i -g vercel`, or prefix commands with `npx`), and an OpenAI API key.

```bash
# From the repo root.
vercel login
vercel link --yes --project <project-name> --scope <team-or-user-scope>
```

`vercel link` may also try to connect the GitHub repository; that needs admin or write access to the repo and can fail without harm. CLI deploys work either way. Connect Git later in the dashboard if you want deploy-on-push.

### Environment variables

Env vars are set **per environment** (Production, Preview, Development). Set them for every environment you deploy to; see the preview warning below.

Pipe values in so secrets never land in shell history or on screen. Copy the key to the clipboard first, then:

```bash
pbpaste | vercel env add OPENAI_API_KEY production          # macOS; on Linux: xclip -o | ...
printf false | vercel env add DEMO_MODE production
printf https://<project-name>.vercel.app | vercel env add PUBLIC_ORIGIN production
```

Access gate (recommended for any demo):

```bash
# One label:code pair per person or group, codes ≥ 8 characters.
printf 'alex:xxxx-xxxx-xxxx,funder:yyyy-yyyy-yyyy' | vercel env add ACCESS_CODES production
python3 -c "import secrets;print(secrets.token_urlsafe(48),end='')" | vercel env add ACCESS_GATE_SECRET production
```

Generate readable codes with:

```bash
python3 -c "import secrets;a='abcdefghjkmnpqrstuvwxyz23456789';print('-'.join(''.join(secrets.choice(a) for _ in range(4)) for _ in range(3)))"
```

Voice (optional): raw-audio Realtime voice. Read the zero-data-retention caveat under `ALLOW_RAW_AUDIO_STREAM` in the root `README.md` first.

```bash
printf realtime_audio | vercel env add VOICE_PIPELINE_MODE production
printf true | vercel env add ALLOW_RAW_AUDIO_STREAM production
```

Another place: `CITY_CONFIG` / `CITY_PRESET`, `CITY_DATA_DIR` and the map tile variables (`VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION`) work as Vercel env vars too. Vercel exposes them both to the build (the frontend reads them) and at runtime (the backend reads them). Keep the data pack under `config/data/<id>/` so it is part of the bundle. See [docs/CUSTOMIZING.md](../../docs/CUSTOMIZING.md).

The SPA and API share one origin, so the app does not need CORS. Set `CORS_ORIGINS` to the deployment's own origin anyway: left unset, the API allows credentialed cross-origin requests from the localhost dev origins.

```bash
printf https://your-app.vercel.app | vercel env add CORS_ORIGINS production
```

The backend sets a Content-Security-Policy and other security headers on every response (`backend/app/security_headers.py`). Vercel adds `Strict-Transport-Security` itself. If you use a custom tile server, set `VITE_MAP_TILE_URL` for production so both the build and the policy pick it up.

### Deploy

```bash
vercel deploy --prod
```

**Env var changes only take effect on the next deploy.** After adding or changing one, run `vercel deploy --prod` again.

## Access codes

With `ACCESS_CODES` set, every path except `/access` (the code form), `/api/v1/health` and `/manifest.webmanifest` needs the access cookie. Pages redirect to the form; API calls get `401 {"detail": "Access code required."}`, which the SPA turns into a redirect to the form. A valid code sets an HttpOnly, Secure, SameSite=Lax cookie for 14 days.

- **Add or revoke a code:** edit `ACCESS_CODES` (`vercel env rm ACCESS_CODES production`, then `vercel env add ...`) and redeploy. Cookies issued for a removed or changed code stop working immediately.
- **Sign everyone out:** rotate `ACCESS_GATE_SECRET` and redeploy.
- **Limits:** codes are shared secrets, not user accounts. There is no audit trail of who used which code, and failed attempts are slowed by one second but not counted, since serverless instances share no state. Use long codes and hand them out individually.

## Check the deployment

`deploy/vercel/smoke_test.py` checks the gate, the SPA, the catalog API and, with `--live`, one real AI turn and a Realtime client-secret mint. It uses only the standard library:

```bash
ACCESS_CODE=<one of your codes> python3 deploy/vercel/smoke_test.py https://<project-name>.vercel.app --live
```

Before a demo, also run a voice intake by hand in Chrome: allow the microphone, accept the consent dialog, and confirm you hear replies. Use headphones or a headset when recording, so the assistant's audio does not reach the mic.

## Operations

- **Logs:** `vercel logs <deployment-url>` or the project's Logs tab. Same stdout/stderr as the container; keep `REALTIME_DEBUG_LOG_ENABLED` off.
- **Health:** `GET /api/v1/health` (public even with the gate on). It does not call OpenAI.
- **Rollback:** `vercel rollback` or promote an earlier deployment in the dashboard.
- **Timeouts:** `maxDuration: 300` is the Hobby plan maximum with Fluid compute. Pro allows up to 800 seconds if agent turns ever need more.
- **Region:** functions run in Vercel's default region unless `regions` is set in `vercel.json`. Put them near your users or OpenAI's US endpoints.
- **Request size:** Vercel caps function request bodies at 4.5 MB; the app's own intake limit (256 KiB) is lower.

## Gotchas we hit

- **Preview deployments do not get Production env vars.** A `vercel deploy` without `--prod` builds a Preview, and if `ACCESS_CODES` is only set for Production, that preview is **ungated**. Live AI is also off there, with no key. Either set the gate variables for Preview too (`vercel env add ACCESS_CODES preview`, and the same for the other variables) or rely on Vercel's Deployment Protection for previews.
- **Hobby plan terms** allow non-commercial use only. Use a Pro team for an agency deployment.
- **Pipe values instead of typing them.** The interactive `vercel env add` prompt may not work in embedded terminals (IDE or agent shells); `printf ... |` or `pbpaste |` does.
- **`pyproject.toml` drives the Python install** once it exists; `backend/requirements.txt` is not read on Vercel. Add a dependency in both places.
- **Service worker:** the PWA's navigation fallback must leave `/access` alone (`navigateFallbackDenylist` in `frontend/vite.config.ts`); otherwise a returning visitor with an expired cookie gets a cached app shell and can never reach the code form.

# Deploying the Service Guide

## Status

These are **starter templates**, not a turnkey production setup. Review them against your own security and networking standards before use.

| Artifact | Validated | Not exercised |
| --- | --- | --- |
| `backend/app/spa.py` | `pytest backend/tests/test_spa.py`: 11 passed. Wired in `main.py` (mounted when `STATIC_DIR` is set) | Behaviour behind a real proxy/CDN |
| `Dockerfile` | `docker build` succeeded (Docker 29.8). Ran with `--read-only --tmpfs /tmp --cap-drop ALL`, `DEMO_MODE=true`: process ran as uid 10001, container health `healthy`, `/api/v1/health` 200, the SPA served at `/` and client routes (`/results`, `/services`), unknown `/api/*` paths returned JSON 404, a `../` traversal path returned 404, and `POST /api/v1/intake/start` returned a new intake state | Live-AI mode (needs `OPENAI_API_KEY`); voice over WebRTC from a deployed origin |
| `docker-compose.yml` | `docker compose config` parses | `docker compose up` |
| `aws/ecs-fargate.tf` | `terraform fmt -check`, `terraform init -backend=false` and `terraform validate` (Terraform 1.9 in Docker, AWS provider ~> 5) all passed | `plan`/`apply`; no live AWS account |
| `azure/container-app.bicep` | `az bicep build` compiles with no errors or warnings | `az deployment group create`; no live Azure subscription |
| `gcp/cloud-run.yaml` | YAML parses | `gcloud run services replace`; no live GCP project |

The container needs no database or persistent volume: the backend is stateless and holds no resident data. The browser keeps the intake state in `sessionStorage` and sends it with every request (see `docs/PRIVACY.md` and `ARCHITECTURE.md`), so any number of replicas works without session affinity, and restarting or replacing an instance loses nothing a resident needs. The only server-side state is the data pack (service catalog and the other place data), loaded from the YAML baked into the image. The replica defaults in the templates are `desired_count = 2` (AWS), and `minReplicas` 1 / `maxReplicas` 3 (Azure) and `minScale` 1 / `maxScale` 3 (GCP); change them freely.

## Deployment modes

### Mode A: hosting partner, single tenant

A hosting partner runs one container per city, each in its own isolated cloud project or account, with its own secrets, brand preset and data pack.

1. Build the image for the city: `docker build --build-arg CITY_CONFIG=presets/<city>.json --build-arg CITY_DATA_DIR=data/<city> -t <registry>/service-guide-<city>:<tag> .`
2. Deploy it into that city's isolated project with the template for the partner's cloud.
3. The partner issues a hostname (for example `<city>.example.org`) with a managed TLS certificate.
4. The city adds a DNS `CNAME` from its own name (for example `services.<city>.gov`) to the partner's hostname. For AWS use the `alb_dns_name` output; for Azure the `fqdn` output; for Cloud Run the domain mapping target. Issue the certificate for the city name, not just the partner's.

Do not share a container, project, or secret across cities.

### Mode B: sovereign municipal cloud

The city builds, pushes, and runs the image in its own account.

```bash
# 1. Build and push (CITY_CONFIG selects the city config and CITY_DATA_DIR the data pack, both under config/)
docker build --build-arg CITY_CONFIG=presets/<city>.json --build-arg CITY_DATA_DIR=data/<city> -t <registry>/service-guide:<tag> .
docker push <registry>/service-guide:<tag>

# 2. Deploy (one of)
terraform -chdir=deploy/aws init && terraform -chdir=deploy/aws apply \
  -var image_uri=<registry>/service-guide:<tag> -var city_slug=<city> ...
az deployment group create -g <rg> -f deploy/azure/container-app.bicep \
  -p image=<registry>/service-guide:<tag> citySlug=<city> openAiKeySecretUri=<kv-secret-uri> publicOrigin=https://...
gcloud run services replace deploy/gcp/cloud-run.yaml --region <region>   # after editing placeholders
```

Create the OpenAI key secret first (Secrets Manager, Key Vault, or Secret Manager) and grant only the workload identity read access to it. The AWS and Azure templates need pre-existing network (AWS) or vault (Azure) resources, as described in their headers.

## Configuration

Set via environment variables (see `backend/.env.example` and `backend/app/config.py`). Never put secret values in the image or in plain environment settings of the templates.

| Variable | Secret | Purpose / default |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | Enables live AI. Unset means the scripted demo flow. |
| `DEMO_MODE` | no | `true` forces the scripted flow. Compose defaults to `true`; the cloud templates default to `false`. |
| `ADMIN_API_TOKEN` | yes | Required (as `X-Admin-Token`) for admin catalog writes. Empty keeps writes disabled. Admin GET routes are open and serve synthetic data; the demo auth is a stub. |
| `PUBLIC_ORIGIN` | no | Public `https` origin used to build share links. |
| `CORS_ORIGINS` | no | Comma-separated allowed origins. The SPA is same-origin, so set it to the public origin. |
| `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_MAX_TOOL_ITERATIONS` | no | Model settings. |
| `VOICE_PIPELINE_MODE`, `ALLOW_RAW_AUDIO_STREAM` | no | The templates set `intercepted_text` and `false` explicitly. `realtime_audio` streams raw microphone audio to OpenAI and works only when both are set (`realtime_audio` and `true`). Use it only under an OpenAI zero-data-retention agreement, which is the operator's contractual responsibility; the app does not verify it. |
| `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_REASONING_EFFORT`, `OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_TRANSCRIPTION_MODEL`, `OPENAI_REALTIME_SECRET_TTL_SECONDS` | no | Used only in `realtime_audio` mode. |
| `REALTIME_DEBUG_LOG_ENABLED`, `REALTIME_DEBUG_LOG_PATH` | no | Keep **off** in production. The trace contains transcript previews and the root filesystem is read-only. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` | token/key values yes | Optional notifications; stubbed when unset. `SENDGRID_FROM_NAME` defaults to the city config's `appName`. |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT` | `AZURE_OPENAI_KEY` yes | Legacy fallback, optional. |
| `CITY_DATA_DIR` | no | Data pack location (see above). Unset means the bundled Austin pack. |
| `APP_NAME` | no | Overrides the city config's `appName` for the OpenAPI title. |
| `STATIC_DIR` | no | Set to `/app/static` in the image; enables serving the SPA. |
| `PORT` | no | Listen port (default 8000). |
| `FORWARDED_ALLOW_IPS` | no | Proxy IPs trusted for `X-Forwarded-*` headers (passed to uvicorn `--forwarded-allow-ips`). Image default is `127.0.0.1`. Set it to your load balancer's address or CIDR. `*` trusts any sender and is only appropriate when the platform ingress is the sole network path to the container (as on Cloud Run and Container Apps). The AWS template uses the VPC CIDR. |

The OpenAI key is a billing credential: restrict the project's spend limit and rotate it per city.

## CITY_CONFIG, brand, and data pack

`CITY_CONFIG` (for example `presets/<city>.json`) is a Docker build argument; `CITY_PRESET=<city>` is an alias. The frontend build reads it to select a city config under `config/`, so branding is fixed into the image at build time. The image also carries `config/` and sets the same variable at runtime, where the backend reads it for the app name and the `serviceGuide.timezone` (open-now hours; UTC if unset).

`CITY_DATA_DIR` selects the data pack: the service catalog, categories, life events, crisis lines, ZIP centers, matching rules, demo personas and admin demo data. Unset means the bundled Austin reference pack in `backend/app/data/`. A relative value such as `data/<city>` resolves under `config/` (so `config/data/<city>/`, which the image already copies); an absolute path is used as-is. It is a build argument (the frontend reads `categories.yaml` from the pack) and is set at runtime too. Change the pack by rebuilding. File formats are in [backend/app/data/README.md](../backend/app/data/README.md); the full walkthrough is in [docs/CUSTOMIZING.md](../docs/CUSTOMIZING.md).

Map tiles come from OpenStreetMap's public server unless you pass `VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION` at build time (both are required together). OSM's server is not meant for production traffic. See [docs/CUSTOMIZING.md](../docs/CUSTOMIZING.md#8-map).

Local run: `docker compose up --build` (override with `CITY_CONFIG=presets/<city>.json` or `CITY_PRESET=<city>`, and `CITY_DATA_DIR=data/<city>`). The local image is tagged `civic-service-guide:local`.

## Health checks

`GET /api/v1/health` returns 200 with `{"status": "healthy", ...}`. It is used by the Dockerfile `HEALTHCHECK`, the ALB target group and ECS container check, Container Apps probes, and Cloud Run probes. It does not call OpenAI, so it does not verify the API key.

## Logging

The app writes to stdout/stderr. Each platform collects it: CloudWatch Logs (`/ecs/<city>-service-guide`, 30-day retention), Log Analytics (Container Apps), Cloud Logging (Cloud Run). Resident text is PII-redacted before storage or any model call (see `docs/PRIVACY.md`), but keep log retention short and restrict log access. Do not enable `REALTIME_DEBUG_LOG_ENABLED` in production.

## Known limitations

- **AWS:** no WAF, no access logs on the ALB, no VPC or certificate creation; the task needs outbound HTTPS (NAT or endpoints). The security group allows egress to `0.0.0.0/0` on 443 because OpenAI has no fixed IP range. Image architecture defaults to `X86_64`.
- **Azure:** the managed certificate requires the custom domain's CNAME and `asuid` TXT record to exist before deployment; otherwise leave `customDomain` empty, deploy, add DNS, then redeploy. Role assignments (Key Vault Secrets User, AcrPull) are not created by the template.
- **GCP:** the manifest does not create the service account, secret, or public-access binding; custom domains are configured outside it.
- **All:** admin auth is the demo stub, so put admin routes behind the platform's own access control for anything beyond a demo.

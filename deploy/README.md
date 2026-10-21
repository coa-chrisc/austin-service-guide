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

The container needs no database or persistent volume: the backend is stateless and holds no resident data. The browser keeps the intake state in `sessionStorage` and sends it with every request (see `docs/PRIVACY.md` and `ARCHITECTURE.md`), so any number of replicas works without session affinity, and restarting or replacing an instance loses nothing a resident needs. The only server-side state is the service catalog, loaded from the YAML baked into the image. The replica defaults in the templates are `desired_count = 2` (AWS), and `minReplicas` 1 / `maxReplicas` 3 (Azure) and `minScale` 1 / `maxScale` 3 (GCP); change them freely.

## Deployment modes

### Mode A: BCHC-managed, single tenant

The Big Cities Health Coalition runs one container per city, each in its own isolated cloud project or account, with its own secrets and its own brand preset.

1. Build the image for the city: `docker build --build-arg CITY_PRESET=<city> -t <registry>/service-guide-<city>:<tag> .`
2. Deploy it into that city's isolated project with the template for BCHC's cloud.
3. BCHC issues a hostname (for example `<city>.example.org`) with a managed TLS certificate.
4. The city adds a DNS `CNAME` from its own name (for example `services.<city>.gov`) to the BCHC hostname. For AWS use the `alb_dns_name` output; for Azure the `fqdn` output; for Cloud Run the domain mapping target. Issue the certificate for the city name, not just the BCHC one.

Do not share a container, project, or secret across cities.

### Mode B: sovereign municipal cloud

The city builds, pushes, and runs the image in its own account.

```bash
# 1. Build and push (CITY_PRESET selects the brand preset under config/presets/)
docker build --build-arg CITY_PRESET=<city> -t <registry>/service-guide:<tag> .
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
| `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_REASONING_EFFORT`, `OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_TRANSCRIPTION_MODEL`, `OPENAI_REALTIME_SECRET_TTL_SECONDS` | no | Voice intake settings. |
| `REALTIME_DEBUG_LOG_ENABLED`, `REALTIME_DEBUG_LOG_PATH` | no | Keep **off** in production. The trace contains transcript previews and the root filesystem is read-only. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` | token/key values yes | Optional notifications; stubbed when unset. |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT` | `AZURE_OPENAI_KEY` yes | Legacy fallback, optional. |
| `STATIC_DIR` | no | Set to `/app/static` in the image; enables serving the SPA. |
| `PORT` | no | Listen port (default 8000). |
| `FORWARDED_ALLOW_IPS` | no | Proxy IPs trusted for `X-Forwarded-*` headers (passed to uvicorn `--forwarded-allow-ips`). Image default is `127.0.0.1`. Set it to your load balancer's address or CIDR. `*` trusts any sender and is only appropriate when the platform ingress is the sole network path to the container (as on Cloud Run and Container Apps). The AWS template uses the VPC CIDR. |

The OpenAI key is a billing credential: restrict the project's spend limit and rotate it per city.

## CITY_PRESET, brand, and catalog

`CITY_PRESET` is a Docker build argument. The frontend build reads it to select a brand preset under `config/presets/`, so branding is fixed into the image at build time. The service catalog is YAML under `backend/app/data/services/` (plus `categories.yaml`, `life_events.yaml`, `crisis_resources.yaml`) and is baked into the image; change it by rebuilding. Local run: `docker compose up --build` (override with `CITY_PRESET=<city>`).

## Health checks

`GET /api/v1/health` returns 200 with `{"status": "healthy", ...}`. It is used by the Dockerfile `HEALTHCHECK`, the ALB target group and ECS container check, Container Apps probes, and Cloud Run probes. It does not call OpenAI, so it does not verify the API key.

## Logging

The app writes to stdout/stderr. Each platform collects it: CloudWatch Logs (`/ecs/<city>-service-guide`, 30-day retention), Log Analytics (Container Apps), Cloud Logging (Cloud Run). Resident text is PII-redacted before storage or any model call (see `docs/PRIVACY.md`), but keep log retention short and restrict log access. Do not enable `REALTIME_DEBUG_LOG_ENABLED` in production.

## Known limitations

- **AWS:** no WAF, no access logs on the ALB, no VPC or certificate creation; the task needs outbound HTTPS (NAT or endpoints). The security group allows egress to `0.0.0.0/0` on 443 because OpenAI has no fixed IP range. Image architecture defaults to `X86_64`.
- **Azure:** the managed certificate requires the custom domain's CNAME and `asuid` TXT record to exist before deployment; otherwise leave `customDomain` empty, deploy, add DNS, then redeploy. Role assignments (Key Vault Secrets User, AcrPull) are not created by the template.
- **GCP:** the manifest does not create the service account, secret, or public-access binding; custom domains are configured outside it.
- **All:** admin auth is the demo stub, so put admin routes behind the platform's own access control for anything beyond a demo.

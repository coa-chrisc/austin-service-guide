# syntax=docker/dockerfile:1
# Single production image: React SPA (built in stage 1) served by FastAPI (stage 2).
# Build context must be the repo root and include config/ (brand presets).

# ── Stage 1: build the frontend ──────────────────────────────────────
FROM node:22-slim AS frontend
WORKDIR /build
ARG CITY_PRESET=
ENV CITY_PRESET=${CITY_PRESET}
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY config/ config/
COPY frontend/ frontend/
RUN cd frontend && npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    STATIC_DIR=/app/static \
    PORT=8000 \
    # Which proxy IPs may set X-Forwarded-* headers. Default trusts only
    # loopback. Set to your load balancer's address/CIDR (comma separated);
    # use "*" only if the container is reachable solely through the proxy.
    FORWARDED_ALLOW_IPS=127.0.0.1

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

COPY backend/app ./app
COPY --from=frontend /build/frontend/dist ./static

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/v1/health' % os.environ.get('PORT','8000'), timeout=4); sys.exit(0)"]

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS}\""]

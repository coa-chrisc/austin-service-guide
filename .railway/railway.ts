// Railway Infrastructure as Code for the Service Guide.
//
// Guide: deploy/railway/README.md
// DSL reference: https://docs.railway.com/infrastructure-as-code/reference
//
//   npm ci --prefix .railway      # installs the railway SDK next to this file
//   railway config plan           # read-only diff against the linked environment
//   railway config apply          # applies after you confirm
//
// This file describes the whole project. A service or variable that exists on
// Railway but is missing here shows up in the plan as a delete, so read every
// plan before you apply it.
//
// No secret values belong in this file. Secrets are declared with preserve()
// ("keep the value already set on Railway") and set with
// `railway variable set NAME --stdin`, as the guide shows.

import { defineRailway, postgres, preserve, project, service, type ResourceNode } from "railway/iac";

// Region for the app service. A deliberate choice: it decides where resident
// traffic is processed in the whole-app deployment. Identifiers:
// https://docs.railway.com/deployments/regions
const REGION = "us-east4-eqdc4a"; // US East (Virginia)

// Region for the job services: the worker, Postgres and SearXNG sit together
// so database and search calls stay in one region. us-west2 is where Railway
// placed the reference project's Postgres; moving a database later is a
// destructive plan (a volume migration), so pick this before the first apply.
const JOB_REGION = "us-west2"; // US West (California)

// Which shape this file describes (deploy/railway/README.md):
//   shape A, the whole app on Railway:      WITH_APP_SERVICE = true,  WITH_JOB_SERVICES = false
//   shape B, Vercel app + Railway back end: WITH_APP_SERVICE = false, WITH_JOB_SERVICES = true
//   both on Railway:                        true, true
// The reference deployment is shape B: the resident app stays on Vercel.
// Flipping a flag off plans the matching services as deletes; read the plan.
const WITH_APP_SERVICE = false;

// The research job worker (#18), its Postgres and a private SearXNG. Each
// is an always-on, billable service.
const WITH_JOB_SERVICES = true;

// Smallest sensible ceilings (Railway bills what is used, up to these).
const GB = 1024 * 1024 * 1024;

export default defineRailway(() => {
  // The whole app from the repo-root Dockerfile, which Railway detects on its
  // own. The source (GitHub repo or `railway up`) is not declared here, so this
  // file manages settings and variables only.
  const app = service("app", {
    healthcheck: "/api/v1/health",
    replicas: { [REGION]: 1 },
    // A custom domain needs the port: a bare string targets 8080.
    // domains: [{ domain: "services.example.gov", port: 8000 }],
    env: {
      // The image's CMD listens on $PORT; pinning it keeps the generated
      // domain, the health check and the Dockerfile on one port.
      PORT: "8000",
      DEMO_MODE: "false",
      VOICE_PIPELINE_MODE: "intercepted_text",
      ALLOW_RAW_AUDIO_STREAM: "false",

      // Another place: these reach the Docker build as build args (the
      // Dockerfile declares them with ARG) and the running app as env vars.
      // Changing one needs a fresh build, not a restart. See the guide.
      // CITY_PRESET: "<id>",
      // CITY_DATA_DIR: "data/<id>",
      // VITE_MAP_TILE_URL: "https://...",
      // VITE_MAP_TILE_ATTRIBUTION: "...",

      // Set on Railway, never here. Delete a line if you do not set it.
      OPENAI_API_KEY: preserve(),
      ADMIN_API_TOKEN: preserve(),
      ACCESS_CODES: preserve(),
      ACCESS_GATE_SECRET: preserve(),
      PUBLIC_ORIGIN: preserve(),
      CORS_ORIGINS: preserve(),
    },
  });

  const resources: ResourceNode[] = WITH_APP_SERVICE ? [app] : [];

  if (WITH_JOB_SERVICES) {
    // Private by default. Never add Public Access (a TCP proxy) to it.
    const db = postgres("postgres", { region: JOB_REGION });

    // Private metasearch for the research worker, built from
    // deploy/railway/searxng/Dockerfile. Deploy it with
    //   railway up deploy/railway/searxng --path-as-root --service searxng
    // (that upload is the build context, so no root directory is set here).
    // Never generate a public domain for it.
    const searxng = service("searxng", {
      replicas: { [JOB_REGION]: 1 },
      deploy: { limitOverride: { containers: { cpu: 1, memoryBytes: 1 * GB } } },
      env: {
        SEARXNG_SECRET: preserve(),
      },
    });

    // Same Dockerfile as the app (INSTALL_WORKER_DEPS reaches the build as a
    // build argument), different start command. Deploy with
    // `railway up --service worker` from the repo root, then generate its
    // domain: `railway domain --service worker --port 8000`.
    const worker = service("worker", {
      start: '/bin/sh -c "exec uvicorn app.worker.main:app --host 0.0.0.0 --port $PORT"',
      healthcheck: "/healthz",
      replicas: { [JOB_REGION]: 1 },
      deploy: { limitOverride: { containers: { cpu: 1, memoryBytes: 1 * GB } } },
      env: {
        PORT: "8000",
        INSTALL_WORKER_DEPS: "true",
        DATABASE_URL: db.env.DATABASE_URL,
        // searxng | openai_web_search (OpenAI's hosted web search; queries
        // then go to OpenAI). See the guide for the trade-off.
        RESEARCH_SEARCH_PROVIDER: "searxng",
        SEARXNG_URL: "http://searxng.railway.internal:8080",
        OPENAI_RESEARCH_MODEL: "gpt-6.1-sol",
        RESEARCH_REQUIRE_PLAN_APPROVAL: "true",
        // Delete a line if you do not set it.
        OPENAI_API_KEY: preserve(),
        JOB_WORKER_SECRET: preserve(),
        JOB_WORKER_SECRET_PREVIOUS: preserve(),
      },
    });

    resources.push(db, searxng, worker);
  }

  return project("civic-service-guide", { resources });
});

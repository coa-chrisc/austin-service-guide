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

// Region for every service. A deliberate choice: it decides where resident
// traffic is processed in the whole-app deployment. Identifiers:
// https://docs.railway.com/deployments/regions
const REGION = "us-east4-eqdc4a"; // US East (Virginia)

// PLANNED, NOT BUILT: the job worker (#18, #19), Postgres (#14 P1) and a
// private SearXNG. Leave this false until `app.worker.main` exists. Turning it
// on creates billable services, and the worker cannot start without that code.
const WITH_JOB_SERVICES = false;

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

  const resources: ResourceNode[] = [app];

  if (WITH_JOB_SERVICES) {
    // Private by default. Never add Public Access (a TCP proxy) to it.
    const db = postgres("postgres");

    // Private metasearch for the research worker. Built from
    // deploy/railway/searxng/Dockerfile: set the service's root directory to
    // deploy/railway/searxng. Never generate a public domain for it.
    const searxng = service("searxng", {
      replicas: { [REGION]: 1 },
      env: {
        SEARXNG_SECRET: preserve(),
      },
    });

    // Same Dockerfile as the app, different start command. Variable names
    // follow the #18 spec; confirm them when the worker lands.
    const worker = service("worker", {
      start: '/bin/sh -c "exec uvicorn app.worker.main:app --host 0.0.0.0 --port $PORT"',
      healthcheck: "/healthz",
      replicas: { [REGION]: 1 },
      env: {
        PORT: "8000",
        INSTALL_WORKER_DEPS: "true",
        DATABASE_URL: db.env.DATABASE_URL,
        SEARXNG_URL: "http://searxng.railway.internal:8080",
        OPENAI_API_KEY: preserve(),
        JOB_WORKER_SECRET: preserve(),
        JOB_WORKER_SECRET_PREVIOUS: preserve(),
      },
    });

    resources.push(db, searxng, worker);
  }

  return project("civic-service-guide", { resources });
});

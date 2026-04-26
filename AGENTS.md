# Repository Guidelines

## Project Structure & Module Organization

- `frontend/`: Vite + React + TypeScript app. Source lives in `frontend/src/`.
- `frontend/src/pages/`: routed resident and admin pages.
- `frontend/src/components/`: reusable UI grouped by feature, such as `layout/`, `services/`, `map/`, `results/`, and `chat/`.
- `frontend/src/lib/`, `hooks/`, `theme/`, `types/`: shared utilities, hooks, theme, and TypeScript types.
- `backend/`: FastAPI API. Main entry point is `backend/app/main.py`.
- `backend/app/routers/`: API route modules for admin, intake, and services.
- `backend/app/services/`: domain services, seed data, matching, AI, notifications, catalog, and hours logic.
- `backend/.env.example`: environment template. Do not commit real secrets.

## Build, Test, and Development Commands

Frontend commands run from `frontend/`:

- `npm install`: install frontend dependencies.
- `npm run dev`: start the Vite dev server.
- `npm run build`: run TypeScript project checks and produce a production build.
- `npm run preview`: preview the production build locally.

Backend commands run from `backend/`:

- `python -m venv .venv && source .venv/bin/activate`: create and activate a local virtual environment.
- `pip install -r requirements.txt`: install FastAPI and service dependencies.
- `uvicorn app.main:app --reload`: start the API with reload enabled.

## Coding Style & Naming Conventions

Use TypeScript for frontend code and Python 3 with type hints for backend code. Follow existing formatting: 2-space indentation in TSX/JSON, 4-space indentation in Python, double quotes in TypeScript imports/strings, and descriptive names.

React components and page files use `PascalCase` (`ServiceDetailCard.tsx`). Hooks use `useName` (`useAuth.tsx`). Backend modules use `snake_case.py`; router files should expose a `router`.

## Testing Guidelines

No committed test framework is currently configured. For now, use `npm run build` as the required frontend verification step and manually exercise key resident/admin flows. When adding tests, colocate frontend tests near the component or page they cover and add backend tests under `backend/tests/` with names like `test_services.py`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit style, for example `feat(map): cluster pins...`, `fix(a11y): ...`, and `chore(catalog): ...`. Keep subjects imperative and scoped.

Pull requests should include a short description, linked issue or user story when available, verification steps, and screenshots for UI changes. Call out any `.env` additions, seed-data changes, or behavior that affects resident intake, service matching, maps, or admin workflows.

## Security & Configuration Tips

Copy `backend/.env.example` to a local `.env` and keep credentials out of git. Prefer demo-safe defaults unless a task specifically requires live OpenAI, Twilio, or SendGrid credentials.

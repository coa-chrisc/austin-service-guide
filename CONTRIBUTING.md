# Contributing

Thanks for helping improve the Austin Service Guide. This is a demonstration project, so keep changes small, focused, and safe to run without credentials.

## Run it locally

Follow [Running Locally](README.md#running-locally) in the README. You don't need an OpenAI key: without one (or with `DEMO_MODE=true`), the intake uses the scripted flow and everything except voice still works. Never commit `backend/.env` or any real credentials.

## Checks to run before opening a PR

From `frontend/`:

```bash
npm run build                         # TypeScript check + production build
```

From `backend/`, with the virtual environment active:

```bash
pip install -r requirements-dev.txt
python -m compileall app              # syntax check
python -m pytest                      # backend tests (scripted flow, no network)
```

If you fix a backend bug, add a regression test under `backend/tests/test_*.py`. The frontend has no test framework, so exercise any UI change by hand in the browser.

## Pull requests

- Use a Conventional Commit style title with a scope, for example `fix(intake): ...`, `feat(map): ...`, `docs: ...`.
- Keep one concern per PR, and describe what changed and why.
- List the steps you used to verify the change. Add screenshots for UI changes.
- Call out new environment variables (and add them to `backend/.env.example`), catalog or seed-data changes, and anything that affects resident intake, service matching, crisis handling, maps, or admin workflows.
- Follow the conventions in [AGENTS.md](AGENTS.md): MUI theme styling (no hardcoded colors), AI calls only through `backend/app/services/ai.py`, and catalog edits in the YAML under `backend/app/data/`.

## Reporting issues

Open a GitHub issue with steps to reproduce, what you expected, and what happened. Don't include real resident information. Report security concerns privately to the maintainers instead of in a public issue.

# Austin reference data pack

This directory is the bundled **data pack** for the Austin, TX reference
deployment: the service catalog, categories, life events, crisis lines, ZIP
centres, local matching rules, translations, demo personas and admin demo
data. The city config (`config/city.config.json`) says *who* the deployment
is; the data pack says *what is there*.

**The file formats, every field, the closed vocabularies and the validator
are in [docs/DATA_PACK.md](../../../docs/DATA_PACK.md).** The JSON Schemas
are in `config/schemas/` and `config/services.schema.json`. This file only
covers the Austin pack itself.

`CITY_DATA_DIR` selects the pack (`backend/app/services/data_pack.py`):
unset means this directory; an absolute path is used as-is; a relative path
resolves under `config/` (e.g. `data/my-city` → `config/data/my-city`, which
the Docker image ships). To start a pack for another place, copy this
directory, delete this README, and replace the records
(see [docs/CUSTOMIZING.md](../../../docs/CUSTOMIZING.md#your-data-pack)).

## Checking it

```bash
cd frontend
npm run validate:pack            # the whole pack, against the contract
npm run validate:catalog         # services only
```

The Austin pack passes with 0 errors. Its warnings are expected: every
service is unverified, most hours are unverified, a few location ZIPs are
not in `zip_centroids.yaml`, and four categories (`smoking_cessation`,
`nutrition`, `physical_activity`, `mental_health`) have no engine rules.

## Loader

`backend/app/services/catalog_loader.py` reads the pack at first access,
validates each record against `app/models.py` (catalog records) or the rule
models defined in the loader itself (`ZipCentroid`, `MatchingRules`,
`ServiceTranslation`), and caches the result with `functools.lru_cache`.
A record the models reject fails startup with a message naming the file.
`catalog.load_seed_data()` fills the in-memory catalog from the loader at
startup. Call `catalog_loader.reload_all()` to drop the caches (including the
resolved pack directory) without restarting the process, then
`catalog.load_seed_data()` to refill the catalog.

`backend/app/services/seed_data.py` re-exports `CATEGORIES`, `SERVICES`,
`LIFE_EVENTS`, and `CRISIS_RESOURCES` from the loader for legacy import
sites — there is no parallel literal copy in Python anymore.

## Editing workflow

1. Open or create the YAML file (copying an existing service is the easiest
   start).
2. Save and run `npm run validate:pack` from `frontend/`.
3. Restart `uvicorn`. Data-only YAML edits need a manual restart: the
   `--reload` watch list is `*.py` only.
4. Hit `GET /api/v1/services/<slug>` or `GET /api/v1/categories` to confirm.

`backend/tests/test_data_pack_content.py` checks Austin-specific content
(for example that every slug in `matching_rules.yaml` exists).

Run the dedupe sweep when adding new providers:

```bash
cd backend && python scripts/dedupe_catalog.py
# writes backend/dedupe_review.csv
```

It clusters services by `provider_name` + name token overlap and flags
likely duplicates for human review.

`scripts/dump_catalog_to_yaml.py` is a one-shot migration from the old
Python literals. Do not run it on this tree: it overwrites the curated YAML.

---

## Sourcing & provenance

The catalog is **hand-curated from public information**, not scraped. There
is no automated ingest pipeline in this repo — each entry was written by
checking the operating organization's own materials.

**Primary sources we used when seeding the catalog:**

- The provider's own website — name, description, hours, addresses, phone,
  email, eligibility summary, languages offered.
- 2-1-1 Texas (`https://www.211texas.org`) — cross-reference for eligibility
  rules and cost type.
- City of Austin / Travis County department pages (Austin Public Health,
  Austin Energy, CapMetro, Austin Public Library, …) — for city-run programs.
- State agency pages (Texas Health and Human Services, Texas Workforce
  Commission, …) — for state-administered benefits like SNAP, Medicaid,
  WIC enrollment, unemployment.
- Nonprofit annual reports, IRS Form 990 listings, and partner directories
  on Central Texas Food Bank / United Way of Greater Austin / ECHO — for
  context on which orgs operate which programs.
- Google Maps / OpenStreetMap — for latitude/longitude and address
  verification only. We do not transcribe Google's hours data; hours come
  from the provider's own website.

**What is NOT scraped:**

- Live hours of operation. The `hours` map is a snapshot at the time the
  YAML was written. Treat it as advisory.
- Real-time eligibility, capacity, or waitlist status.
- Caseworker assignments, queue depth, or any operational telemetry.

The `seed_data.py` docstring states explicitly: _"Data is for demonstration
only and may not reflect current hours, eligibility, or availability."_ The
demo UI shows a similar disclaimer on shared/printed plans.

### When you add or update an Austin service

The validator checks ids, slugs, categories, coordinates, hours format and
primary locations. Check these by hand:

- [ ] `name`, `provider_name`, `description`, `phone`, `website_url` came
      from the provider's own site (not a third-party aggregator).
- [ ] `eligibility_summary` reflects the provider's published criteria —
      avoid editorializing.
- [ ] `cost` and `cost_type` are consistent (`Free` → `cost_type: free`).
- [ ] Latitude/longitude verified against the address (rough Austin bounds:
      lat 30.10–30.50, lng −97.95–−97.55).
- [ ] `hours_verified: true` only if a person confirmed the hours with the
      provider within the last 90 days.
- [ ] `languages_offered` reflects what the provider actively supports, not
      "we have Google Translate."

### When you remove a service

Prefer setting `status: inactive` over deleting the file. The matching
engine excludes inactive services from results, and matching rules,
translations and shared plans may still reference the slug.

---

## Future work

- **Hot reload endpoint.** A `POST /api/v1/admin/catalog/reload` that calls
  `catalog_loader.reload_all()` + `catalog.load_seed_data()` would let
  staff edit YAML and refresh without a restart.
- **Production source.** This in-repo YAML is the demo target. For
  production, the same Pydantic models would be served from PostgreSQL +
  pgvector with semantic search; the YAML would become the seed for that
  database, not the runtime store.

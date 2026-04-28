# Service Catalog (YAML)

This directory is the source of truth for the resident-facing service catalog.
Edit a YAML file, restart the backend (or hit a future hot-reload endpoint),
and the change is live. Pydantic validates every record on load — bad YAML
raises a loud startup error rather than silently dropping a service.

## Layout

```
backend/app/data/
├── README.md                 ← this file
├── categories.yaml           ← list of ServiceCategory
├── life_events.yaml          ← list of LifeEvent
├── crisis_resources.yaml     ← list of CrisisResource
└── services/
    ├── <slug>.yaml           ← one Service per file
    └── ...                   (87 files at last count)
```

The filename stem of a service file should match its `slug` field (e.g.
`central-texas-food-bank.yaml` for slug `central-texas-food-bank`). The
loader does not enforce the match, but tooling assumes it.

## Loader

`backend/app/services/catalog_loader.py` walks the directory at first access,
validates each record against `app/models.py`, and caches the result with
`functools.lru_cache`. Call `catalog_loader.reload_all()` to drop the cache
without restarting the process.

`backend/app/services/seed_data.py` re-exports `CATEGORIES`, `SERVICES`,
`LIFE_EVENTS`, and `CRISIS_RESOURCES` from the loader for legacy import
sites — there is no parallel literal copy in Python anymore.

## Editing workflow

1. Open or create the YAML file.
2. Save.
3. Restart `uvicorn` (the dev server runs with `--reload` and will pick up
   changes to `seed_data.py` / `catalog_loader.py` automatically; data-only
   YAML edits currently need a manual restart because the watch list is
   `*.py` only).
4. Hit `GET /api/v1/services/<slug>` or `GET /api/v1/categories` to confirm.

To add a new service from scratch, easiest is:

```bash
cp backend/app/data/services/central-texas-food-bank.yaml \
   backend/app/data/services/<your-new-slug>.yaml
# then edit
```

If you need to bulk-regenerate the YAML files from the (now obsolete) Python
literal lists, run the one-shot dumper:

```bash
cd backend && python -m scripts.dump_catalog_to_yaml
```

---

## Service schema (`services/<slug>.yaml`)

Top-level shape is a single mapping (not a list). All fields are optional
unless marked **required**. Defaults come from `app/models.py:Service`.

| Field                    | Type                  | Notes                                                                 |
| ------------------------ | --------------------- | --------------------------------------------------------------------- |
| `id`                     | string **required**   | Stable internal id, e.g. `svc-ctfb`. Used by matching engine.         |
| `name`                   | string **required**   | Display name. Keep concise — fits on one card line.                   |
| `slug`                   | string **required**   | URL slug, kebab-case, must be unique. Filename should match.          |
| `provider_name`          | string                | Operating organization (often the same string as `name`).             |
| `description`            | string                | 1–3 sentences. Plain text; no markdown.                               |
| `eligibility_summary`    | string                | Who qualifies, in plain language.                                     |
| `how_to_apply`           | string                | First-step instructions (call X, visit Y, apply at URL Z).            |
| `cost`                   | string                | Free-text label shown on the card. Examples: `Free`, `Sliding scale`. |
| `cost_type`              | enum                  | One of `free`, `sliding_scale`, `flat_fee`, `insurance`, `varies`.    |
| `website_url`            | string                | Full URL with scheme.                                                 |
| `phone`                  | string                | Display format, e.g. `512-282-2111` or `2-1-1`.                       |
| `email`                  | string                | Optional contact email.                                               |
| `languages_offered`      | list[string]          | ISO codes, e.g. `[en, es, vi, zh, ar]`. Defaults to `[en]`.           |
| `accessibility_features` | list[string]          | Free-text labels (`Wheelchair accessible`, `Interpreter services`).   |
| `status`                 | enum                  | One of `active`, `inactive`, `seasonal`. Defaults to `active`.        |
| `categories`             | list[string]          | Category **slugs**, must exist in `categories.yaml`. See guard below. |
| `locations`              | list[ServiceLocation] | At least one location is recommended; see schema below.               |
| `documents`              | list[ServiceDocument] | "What to bring" list; see schema below.                               |

### `ServiceLocation`

```yaml
locations:
  - id: loc-ctfb-1 # required, stable
    service_id: svc-ctfb # should match parent service id
    name: Main Warehouse # required
    address: 6500 Metropolis Dr # required (street only)
    city: Austin # default Austin
    state: TX # default TX
    zip_code: "78744" # always quote zip codes
    latitude: 30.1975 # decimal degrees, WGS84
    longitude: -97.7566 # decimal degrees, WGS84
    phone: 512-282-2111 # optional, falls back to service phone
    is_primary: true # exactly one primary per service
    hours_verified: false # set true when you've called to confirm
    hours:
      monday: 8:00 AM – 5:00 PM
      tuesday: 8:00 AM – 5:00 PM
      wednesday: 8:00 AM – 5:00 PM
      thursday: 8:00 AM – 5:00 PM
      friday: 8:00 AM – 5:00 PM
      saturday: Closed # use "Closed" or omit the key
      sunday: Closed
```

Notes on hours:

- Keys are lowercase weekday names: `monday`, `tuesday`, …, `sunday`.
- Values are free-text — the "open now" computation in
  `app/services/hours.py` parses `H:MM AM – H:MM PM` ranges, the literal
  `Closed`, and `24/7` / `24 hours`.
- The dash character is an en-dash (`–`, U+2013), not a hyphen. If you
  paste a hyphen, the parser still works, but stay consistent.
- Multi-range days (`8 AM – 12 PM, 1 PM – 5 PM`) are supported.
- Set `hours_verified: true` only after a phone or website check within
  the last 90 days.

### `ServiceDocument`

```yaml
documents:
  - name: Photo ID
    description: Government-issued photo ID
    is_required: true # default true; use false for "helpful but optional"
```

`name` is the only required field. Description shows below the document
name on the "What to bring" card.

### Category slug guard

`seed_data.py` runs an integrity assertion at import time:

```python
assert not _BAD, f"Unknown category slugs in seed data: {_BAD[:5]}"
```

If a service references a category slug that does not exist in
`categories.yaml`, the backend will refuse to start. Add the category first.

---

## Category schema (`categories.yaml`)

Top-level shape is a YAML list of mappings.

| Field           | Type                | Notes                                                |
| --------------- | ------------------- | ---------------------------------------------------- |
| `id`            | string **required** | e.g. `cat-housing`.                                  |
| `name`          | string **required** | Display name.                                        |
| `slug`          | string **required** | Lowercase kebab/single-word; referenced by services. |
| `description`   | string              | One-line tooltip.                                    |
| `icon`          | string              | Material UI icon name (e.g. `LocalHospital`).        |
| `color`         | string              | Hex color for category chips.                        |
| `service_count` | int                 | Computed at startup; safe to omit/set to 0 here.     |

The loader recomputes `service_count` after every catalog mutation, so the
value in the file is informational only.

---

## Life event schema (`life_events.yaml`)

```yaml
- id: le-new-baby
  name: New Baby
  slug: new_baby
  description: Growing your family? Connect with prenatal care, WIC, …
  icon: ChildFriendly
  related_categories: [healthcare, childcare, food]
```

`related_categories` entries are category **slugs** and must exist in
`categories.yaml`.

---

## Crisis resource schema (`crisis_resources.yaml`)

```yaml
- name: 988 Suicide & Crisis Lifeline
  description: 24/7 free, confidential support
  phone: "988"
  available_24_7: true
  languages: [en, es]
```

Crisis resources are surfaced by the AI agent's `get_crisis_resources` tool
and by a keyword interrupt in the intake flow. Keep `phone` short and
recognizable (`988`, `2-1-1`, `1-800-…`).

---

## Validation

On startup, the loader will reject any file that:

- Fails Pydantic validation against `app/models.py`.
- Contains a service whose `categories` reference an unknown category slug.

It does **not** currently check:

- Slug uniqueness across services (last-write wins on collision — keep slugs
  unique by file naming).
- Phone number format.
- Latitude/longitude within Travis County bounds.
- Whether `service_id` on a location matches the parent service id.

Run the dedupe sweep when adding new providers:

```bash
cd backend && python scripts/dedupe_catalog.py
# writes backend/dedupe_review.csv
```

It clusters services by `provider_name` + name token overlap and flags
likely duplicates for human review.

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

### When you add or update a service

Walk through this checklist before committing:

- [ ] `id` and `slug` are unique across the catalog (filename matches slug).
- [ ] `name`, `provider_name`, `description`, `phone`, `website_url` came
      from the provider's own site (not a third-party aggregator).
- [ ] `eligibility_summary` reflects the provider's published criteria —
      avoid editorializing.
- [ ] `cost` and `cost_type` are consistent (`Free` → `cost_type: free`).
- [ ] `categories` references slugs that exist in `categories.yaml`.
- [ ] At least one location has `is_primary: true`.
- [ ] Latitude/longitude verified against the address (rough Austin bounds:
      lat 30.10–30.50, lng −97.95–−97.55).
- [ ] `hours_verified: true` only if you confirmed within the last 90 days.
- [ ] `languages_offered` reflects what the provider actively supports, not
      "we have Google Translate."

### When you remove a service

Prefer setting `status: inactive` over deleting the file. The matching
engine excludes inactive services from results, but historical session
records may still reference the id.

---

## Future work

- **Hot reload endpoint.** A `POST /api/v1/admin/catalog/reload` that calls
  `catalog_loader.reload_all()` + `catalog.load_seed_data()` would let
  staff edit YAML and refresh without a restart.
- **Standalone validator.** `python -m scripts.validate_catalog` could
  load every YAML, run Pydantic + the slug guard + duplicate detection,
  and exit non-zero on any issue. Useful as a pre-commit hook.
- **Translation files.** Per-service translations currently live in
  `app/services/i18n.py` for ~17 services. Long-term they should move to
  `data/services/<slug>.<lang>.yaml` siblings or a `translations:` block on
  the canonical English record.
- **Production source.** This in-repo YAML is the demo target. For
  production, the same Pydantic models would be served from PostgreSQL +
  pgvector with semantic search; the YAML would become the seed for that
  database, not the runtime store.

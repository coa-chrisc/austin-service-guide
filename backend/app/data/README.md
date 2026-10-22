# Data pack (YAML)

This directory is a **data pack**: everything place-specific the backend
knows about one deployment — the service catalog, categories, life events,
crisis lines, ZIP centers, local matching rules, translations, demo personas
and admin demo data. The city config (`config/city.config.json`) says *who*
the deployment is; the data pack says *what is there*. This directory is the
Austin reference pack.

`CITY_DATA_DIR` selects the pack (`backend/app/services/data_pack.py`):
unset means this directory; an absolute path is used as-is; a relative path
resolves under `config/` (e.g. `data/my-city` → `config/data/my-city`, which
the Docker image ships). A directory without `categories.yaml` fails startup.

To start a pack for another place, copy this directory, then replace the
records. Required files must exist (they may hold an empty list where noted);
optional files can be left out and the feature they drive is skipped.

Edit a YAML file, restart the backend (or hit a future hot-reload endpoint),
and the change is live. Pydantic validates every record on load — bad YAML
raises a loud startup error rather than silently dropping a service.

## Layout

```
<pack>/
├── README.md                  ← this file (Austin pack only)
├── categories.yaml            ← list of ServiceCategory            required
├── services/<slug>.yaml       ← one Service per file               required (87 in Austin)
├── life_events.yaml           ← list of LifeEvent                  required (may be [])
├── crisis_resources.yaml      ← list of CrisisResource             required (may be [])
├── zip_centroids.yaml         ← list of ZipCentroid                optional
├── matching_rules.yaml        ← MatchingRules mapping              optional
├── service_translations.yaml  ← slug → language → {description}    optional
├── personas.yaml              ← demo personas (?demo=1 launcher)   optional
└── admin_demo.yaml            ← synthetic admin-console data       optional
```

| File                        | Read by                                  | Without it                                   |
| --------------------------- | ---------------------------------------- | -------------------------------------------- |
| `categories.yaml`           | `catalog_loader.load_categories`         | startup fails                                |
| `services/`                 | `catalog_loader.load_services`           | startup fails                                |
| `life_events.yaml`          | `catalog_loader.load_life_events`        | startup fails                                |
| `crisis_resources.yaml`     | `catalog_loader.load_crisis_resources`   | startup fails                                |
| `zip_centroids.yaml`        | `catalog_loader.load_zip_centroids`      | ZIP searches are not radius-filtered; the scripted ZIP question offers only "Other" |
| `matching_rules.yaml`       | `catalog_loader.load_matching_rules`     | no crisis-direct services, heat-ZIP rule, local prevention services or program value estimates |
| `service_translations.yaml` | `catalog_loader.load_service_translations` | results show English descriptions          |
| `personas.yaml`             | `app/services/personas.py`               | no demo personas                             |
| `admin_demo.yaml`           | `app/services/seed_data.py`              | admin console shows empty demo data          |

The filename stem of a service file should match its `slug` field (e.g.
`central-texas-food-bank.yaml` for slug `central-texas-food-bank`). The
loader does not enforce the match, but tooling assumes it.

## Loader

`backend/app/services/catalog_loader.py` reads the pack at first access,
validates each record against `app/models.py` (catalog records) or the rule
schemas defined in the loader itself (`ZipCentroid`, `MatchingRules`,
`ServiceTranslation`), and caches the result with `functools.lru_cache`.
`catalog.load_seed_data()` fills the in-memory catalog from the loader at
startup. Call `catalog_loader.reload_all()` to drop the caches (including the
resolved pack directory) without restarting the process, then
`catalog.load_seed_data()` to refill the catalog.

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
cp <pack>/services/central-texas-food-bank.yaml \
   <pack>/services/<your-new-slug>.yaml
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
| `eligibility_requires`   | list[enum]            | Hard eligibility gates checked by matching. See below. Default `[]`.  |
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

### `eligibility_requires` (hard eligibility gates)

Structured version of the restrictive part of `eligibility_summary`. The
matching engine (`app/services/eligibility.py`) checks each gate against the
resident profile. All listed gates must hold (AND).

- Profile **contradicts** a gate (e.g. `veteran_status: false`) → the
  service is not matched.
- Profile **can't tell** (field unknown) → the service is kept, capped at
  `low` confidence, ranked after every confirmed fit, and its reasoning says
  "Check eligibility: …" quoting the first sentence of `eligibility_summary`.
- Profile **satisfies** every gate → normal scoring.

| Gate                           | Satisfied when                                                                                   | Contradicted when                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `veteran`                      | `veteran_status: true`, or a veterans need (covers dependents/survivors)                         | `veteran_status: false`                   |
| `homeless_or_unstable_housing` | `housing_situation` is `homeless`/`unstable`; `homelessness` or `domestic_violence` crisis flag; `homeless`/`shelter` need | `housing_situation` is `renting`/`own_home` |
| `refugee_or_immigrant`         | `is_refugee_or_immigrant: true`, or a refugee/immigration/citizenship need                       | `is_refugee_or_immigrant: false`          |
| `disability`                   | `has_disability: true` (household-level), `employment_status: disabled`, or a disability need    | `has_disability: false`                   |
| `older_adult`                  | `age_range` overlaps 50+, or a senior/aging/elderly need                                         | `age_range` entirely under 50             |
| `older_adult_or_disability`    | either `older_adult` or `disability` holds                                                       | both are contradicted                     |
| `has_children`                 | `has_children: true`, `school_age_children` present, or a childcare need                         | `has_children: false`                     |
| `youth`                        | `age_range` overlaps 16–28                                                                       | `age_range` entirely outside 16–28        |
| `other_criteria`               | never — the restriction has no profile field (single parents in college, people in recovery, people living with HIV) | never; always "check eligibility" |

Age gates use the most permissive band in the catalog (50+; 16–28) so a
partly-overlapping bracket is never excluded. Fleeing domestic violence
satisfies the housing gate because HUD (and ECHO) count it as homelessness.

Crisis-direct services are not gated here: `crisis_services` in
`matching_rules.yaml` maps each crisis indicator (`domestic_violence`,
`immediate_danger`, `suicidal_ideation`, `homelessness`) to service slugs that
always match and lead the plan when that indicator is present. Renaming one
of those slugs means updating the map (a test checks they all exist).

Only gate a service when its own eligibility text clearly restricts who can
use it. "Open to anyone; priority for …" stays ungated. An unknown gate name
fails validation at load time. To add a gate, extend `EligibilityGate` in
`app/models.py` and its predicate in `app/services/eligibility.py`.

```yaml
eligibility_summary: Families with at least one minor child experiencing homelessness in Travis County.
eligibility_requires:
- homeless_or_unstable_housing
- has_children
```

### `ServiceLocation`

```yaml
locations:
  - id: loc-ctfb-1 # required, stable
    service_id: svc-ctfb # should match parent service id
    name: Main Warehouse # required
    address: 6500 Metropolis Dr # required (street only)
    city: Austin # required
    state: TX # required, two-letter code
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

`catalog.load_seed_data()` checks every service's categories at startup. If a
service references a category slug that does not exist in `categories.yaml`,
the backend will refuse to start. Add the category first.

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
- name: Integral Care Crisis Helpline
  description: Travis County mental health crisis line
  phone: 512-472-4357
  available_24_7: true
  languages: [en, es]
  crisis_topic: mental_health # optional: mental_health | domestic_violence
```

Crisis resources are surfaced by the AI agent's `get_crisis_resources` tool
and by a keyword interrupt in the intake flow. Keep `phone` short and
recognizable (`988`, `2-1-1`, `1-800-…`).

`crisis_topic` marks a **local** crisis line. The crisis interrupt message
lists 988, then every `mental_health` line, then every `domestic_violence`
line (file order), then the National DV Hotline; 9-1-1 is always named. The
`mental_health_crisis` and `domestic_violence` risk flags list the same local
lines as `Name (phone)`. 988, 9-1-1 and the National DV Hotline are built in,
so a tagged line with one of those numbers is not repeated. A pack with no
tagged lines still shows the national lines.

---

## ZIP centroids (`zip_centroids.yaml`, optional)

```yaml
- zip: "78741"        # always quote ZIP codes
  latitude: 30.2270
  longitude: -97.7290
  featured: true      # optional, default false
```

Used by `GET /api/v1/services?zip_code=…&radius=…` and the agent's
`search_services` tool: a listed ZIP filters services to locations within
`radius` miles of its center. A ZIP that is not listed is not filtered (all
services pass). `featured: true` ZIPs, in file order, are the quick-reply
buttons on the scripted intake's ZIP question; with none featured the first
five entries are used. "Other" is always appended.

---

## Matching rules (`matching_rules.yaml`, optional)

A single mapping; every key is optional and a missing key skips its rule.
Service references are catalog **slugs**, so names come from the catalog.
Unknown slugs are ignored at runtime; `tests/test_data_pack_content.py`
checks the Austin pack's slugs all exist.

```yaml
high_heat_zips: ["78741", "78744"]        # heat-vulnerability ZIPs

crisis_services:                          # indicator -> slugs, most local first
  domestic_violence: [safe-alliance]
  suicidal_ideation: [integral-care]

prevention_services:                      # risk type -> lines on that risk flag
  homelessness:
  - service: foundation-communities       # rendered as the service's name
  - text: Integral Care youth services    # org not in the catalog: display text

benefit_estimates:                        # first listing a matched slug wins
- services: [snap-enrollment-assistance]
  label: SNAP Benefits
  monthly_value: 234
  per_household_member: true              # optional, default false
- services: [community-care-health-centers]
  label: Sliding-Scale Healthcare Savings
  monthly_value: 80
  only_if_uninsured: true                 # optional, default false
```

- `high_heat_zips`: a resident with a chronic condition in one of these ZIPs
  gets cooling and utility services, and the ZIP counts as one factor toward
  the `heat_vulnerable` risk flag (two factors raise it).
- `crisis_services`: indicators are `domestic_violence`, `immediate_danger`,
  `suicidal_ideation`, `homelessness`. These services skip the relevance
  filter, eligibility gates and match cap, and lead the plan.
- `prevention_services`: risk types are `homelessness`, `housing_instability`,
  `food_insecurity`, `uninsured`, `domestic_violence`, `mental_health_crisis`,
  `social_isolation`, `child_mental_health_risk`, `heat_vulnerable`. Each entry
  sets exactly one of `service` or `text`. For `domestic_violence` and
  `mental_health_crisis` these come after the built-in and local crisis lines.
- `benefit_estimates`: the monthly value shown in the results' benefit
  estimate. A matched free service with no estimate counts $25.

---

## Service translations (`service_translations.yaml`, optional)

```yaml
integral-care:            # catalog service slug
  es:                     # language code
    description: La Autoridad Local de Salud Mental del Condado de Travis …
```

Shown on the results page in place of the English description when the
resident's language matches. Anything not listed falls back to English.

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
- **Production source.** This in-repo YAML is the demo target. For
  production, the same Pydantic models would be served from PostgreSQL +
  pgvector with semantic search; the YAML would become the seed for that
  database, not the runtime store.

# Data pack contract

A data pack is the folder of YAML files that holds everything place-specific about one deployment: services, categories, life events, crisis lines, ZIP centres, local matching rules, translations, demo personas and admin demo data. The city config says who the deployment is. The pack says what is there.

This document is the contract for writing a pack, by hand or with a tool. A pack that passes

```bash
cd frontend
npm run validate:pack -- --data-dir /path/to/pack
```

with no errors loads in the backend. The rules live in three places, and they agree with each other:

- **JSON Schemas** in `config/schemas/` (one per file, listed in `config/schemas/index.json`) and `config/services.schema.json` (one service).
- **Cross-file rules** the schemas cannot express, in `backend/app/services/pack_validator.py`.
- **The loader** (`backend/app/services/catalog_loader.py` and `app/models.py`). The validator runs every record that passes its schema through the loader's own models too, so a schema gap cannot hide a startup failure.

`backend/tests/test_schema_model_drift.py` fails when a schema and a loader model stop naming the same fields or the same closed vocabularies.

The bundled Austin pack is `backend/app/data/` (notes on its sources: [backend/app/data/README.md](../backend/app/data/README.md)). A minimal valid pack is `backend/tests/fixtures/packs/example-minimal/`. How to point a deployment at a pack (`CITY_DATA_DIR`) is in [CUSTOMIZING.md](CUSTOMIZING.md#your-data-pack).

## Files

| File | Required | Shape | Read by | Without it |
| --- | --- | --- | --- | --- |
| `pack.yaml` | no | mapping | the validator only | no bbox check |
| `categories.yaml` | yes | list | `catalog_loader.load_categories`, the frontend build | startup fails |
| `services/<slug>.yaml` | yes (the folder; it may be empty) | one mapping per file | `catalog_loader.load_services` | startup fails |
| `life_events.yaml` | yes, may be `[]` | list | `catalog_loader.load_life_events` | startup fails |
| `crisis_resources.yaml` | yes, may be `[]` | list | `catalog_loader.load_crisis_resources` | startup fails |
| `zip_centroids.yaml` | no | list | `catalog_loader.load_zip_centroids` | ZIP searches are not radius-filtered; the scripted ZIP question offers only "Other" |
| `matching_rules.yaml` | no | mapping | `catalog_loader.load_matching_rules` | no crisis-direct services, heat-ZIP rule, local prevention lines or benefit estimates |
| `service_translations.yaml` | no | mapping | `catalog_loader.load_service_translations` | results show English descriptions |
| `personas.yaml` | no | mapping | `app/services/personas.py` | the demo launcher is hidden |
| `admin_demo.yaml` | no | mapping | `app/services/seed_data.py` | admin views are empty |

Any other `.yaml` file at the top level, or a non-YAML file in `services/`, is reported as `ignored_file` (a warning): the loader never reads it. Other files, such as a `README.md`, are left alone. A missing optional file is fine; an optional file that is present must be valid.

Write `.yaml`, not `.yml`. Quote ZIP codes, phone numbers that look like numbers (`"911"`, `"988"`) and dates (`"2026-11-15"`), so YAML keeps them as strings.

## Ids and slugs

| Record | `id` | `slug` |
| --- | --- | --- |
| Service | `svc-<slug>` by convention; letters, digits, `-`, `_` | lowercase words joined by hyphens (`central-texas-food-bank`); must equal the file name stem |
| Location | `loc-<slug>-<n>` by convention; set it (a missing id gets a random one at every start) | none |
| Category | `cat-<slug>` by convention | lowercase words joined by underscores (`mental_health`) |
| Life event | `le-<slug>` by convention | lowercase words joined by `_` or `-`; the intake treats them alike |

Ids and slugs are unique within their file kind; location ids are unique across the pack. Never change or reuse a published service id or slug: matching rules, translations and shared plans refer to them. To retire a service, set `status: inactive` instead of deleting the file.

## pack.yaml (manifest, optional)

Not read by the server. It records what the pack is, and gives the validator a service area to check coordinates against.

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | `1` | required; the contract version |
| `id` | string | required; lowercase words joined by hyphens, for example `austin-travis-tx` |
| `name` | string | required; for example `Austin and Travis County, Texas` |
| `region` | mapping | optional: `city`, `county`, `state`, `country` (ISO 3166-1 alpha-2) |
| `bbox` | `[west, south, east, north]` | optional, decimal degrees; locations outside it get an `outside_bbox` warning |
| `generated_by` | string | `human`, or the tool name and version that wrote the pack |
| `generated_at` | string | date or ISO 8601 timestamp |
| `notes` | string | sources, caveats, review status |

## services/&lt;slug&gt;.yaml

One service per file, a single mapping. Schema: `config/services.schema.json`. Unknown keys are errors.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | see [Ids and slugs](#ids-and-slugs) |
| `slug` | string | yes | equals the file name stem |
| `name` | string | yes | public name; short enough for one card line |
| `provider_name` | string | yes | the organisation that delivers it |
| `description` | string | no | 1 to 3 plain sentences; no HTML or Markdown |
| `eligibility_summary` | string | yes | who qualifies, in plain words; the first sentence is quoted in "Check eligibility" notes |
| `eligibility_requires` | list of gates | no | see [Eligibility gates](#eligibility-gates); default `[]` |
| `how_to_apply` | string | no | first steps |
| `cost` | string | no | label shown on the card, for example `Free` |
| `cost_type` | enum | no | `free` (default), `sliding_scale`, `flat_fee`, `insurance`, `varies`; keep it consistent with `cost` |
| `website_url` | string | no | `http://` or `https://` URL; empty or missing is a warning (`empty_website_url`) |
| `phone` | string | see note | display form, for example `512-282-2111` or `2-1-1` |
| `email` | string | no | an address or empty |
| `languages_offered` | list | no | language codes (`en`, `es`, `zh-Hant`), unique; default `[en]`. Not language names. |
| `accessibility_features` | list of strings | no | for example `Wheelchair accessible` |
| `status` | enum | yes | `active`, `seasonal`, `inactive` (never listed or matched) |
| `categories` | list | yes | 1 or more category slugs from `categories.yaml`; more than 5 is a warning |
| `locations` | list | no | see below; may be empty for phone-only or online services |
| `documents` | list | no | `name` (required), `description`, `is_required` (default `true`) |
| `provider_type` | enum | no | `city`, `county`, `state`, `federal`, `nonprofit`, `other` |
| `sources` | list | no | see [Sources](#sources) |
| `last_verified_date` | date | no | set only by a person who checked the entry; see [Verification](#verification) |
| `verified_by` | string | no | a role or team, not a personal name; same rule |

A service must have a contact phone: a top-level `phone`, or a `phone` on at least one location.

`provider_type`, `sources`, `last_verified_date` and `verified_by` are part of the contract but the server does not read them yet (the loader drops them). They are kept in the YAML for review and future use.

### Locations

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | no, but set it | unique across the pack |
| `service_id` | string | no | if present, equals the parent service `id` |
| `name` | string | yes | site name |
| `address` | string | yes | street address only |
| `city` | string | yes | |
| `state` | string | yes | two capital letters |
| `zip_code` | string | yes | `"78744"` or `"78744-1234"`, quoted |
| `latitude`, `longitude` | number | yes | WGS84 decimal degrees; neither may be `0` (the map and radius search skip such a location) |
| `phone` | string | no | falls back to the service phone |
| `is_primary` | boolean | no | at most one per service; none is a warning |
| `hours` | mapping | no | see below; missing is a warning |
| `hours_verified` | boolean | no | `true` only when a person confirmed the hours with the provider |

### Hours

Keys are lowercase day names (`monday` to `sunday`). A missing day means closed. Values `app/services/hours.py` understands:

- a range `H:MM AM - H:MM PM`, with a hyphen, en dash or em dash; minutes optional (`9 AM - 5 PM`)
- `Closed` (also `n/a`, `by appointment`, `appointment only`, all read as closed)
- text containing both `24` and `hour`, for example `Open 24 hours`

Anything else (`M-F 9-5`, `24/7`, two ranges in one day, `8 AM - 12 PM, 1 PM - 5 PM`) reads as closed. The validator warns (`hours_unparseable`). For a split day, give the outer range and explain the break in `description`.

### Eligibility gates

`eligibility_requires` lists hard gates the matching engine (`app/services/eligibility.py`) checks against the resident's profile. All listed gates must hold.

- The profile **contradicts** a gate: the service is not matched.
- The profile **can't tell**: the service is kept at low confidence, ranked after confirmed fits, with a "Check eligibility" note quoting the first sentence of `eligibility_summary`.
- The profile **satisfies** every gate: normal scoring.

| Gate | Satisfied when | Contradicted when |
| --- | --- | --- |
| `veteran` | `veteran_status: true`, or a veterans need | `veteran_status: false` |
| `homeless_or_unstable_housing` | housing is `homeless` or `unstable`; a `homelessness` or `domestic_violence` crisis flag; a `homeless` or `shelter` need | housing is `renting` or `own_home` |
| `refugee_or_immigrant` | `is_refugee_or_immigrant: true`, or a refugee, immigration or citizenship need | `is_refugee_or_immigrant: false` |
| `disability` | `has_disability: true`, `employment_status: disabled`, or a disability need | `has_disability: false` |
| `older_adult` | `age_range` overlaps 50+, or a senior, aging or elderly need | `age_range` entirely under 50 |
| `older_adult_or_disability` | either of the two holds | both are contradicted |
| `has_children` | `has_children: true`, school-age children, or a childcare need | `has_children: false` |
| `youth` | `age_range` overlaps 16 to 28 | `age_range` entirely outside 16 to 28 |
| `other_criteria` | never: the restriction has no profile field | never; always "check eligibility" |

There are no income, residency, numeric-age or household-size gates. For those, use `other_criteria` and state the rule in `eligibility_summary`. Gate a service only when its own published criteria clearly restrict who can use it; "open to anyone, priority for ..." stays ungated.

### Sources

Each entry in `sources` records where facts came from.

| Field | Type | Notes |
| --- | --- | --- |
| `url` | string | required; `http(s)://` page the facts came from |
| `title` | string | page title |
| `retrieved_at` | date | when the page was read; not in the future |
| `fields` | list | service fields this source supports, for example `[phone, hours]` |
| `quote` | string | short supporting excerpt, at most 1000 characters |
| `note` | string | free text |

## categories.yaml

A list. Fields: `id`, `name`, `slug` (all required), `description`, `icon` (a Material icon name), `color` (`#RRGGBB`; informational, the UI colours categories from the city config), `service_count` (ignored; recomputed). Write `slug:` as a plain line (`  slug: food`): the frontend build reads slugs with a line match, not a YAML parser.

The matching engine has rules for these slugs, in plan order: `emergency`, `cooling`, `food`, `housing`, `refugee`, `utilities`, `healthcare`, `childcare`, `schools`, `employment`, `veterans`, `senior`, `disability`, `transportation`, `legal`, `immigration`, `education`. Reuse them where they fit. Any other slug loads, but the engine only matches it when a resident's stated need is the slug itself or appears in a service's name or description, and it gets no plan priority (warning `category_unknown_to_engine`).

## life_events.yaml

A list, may be `[]`. Fields: `id`, `name`, `slug` (all required), `description`, `icon`, `related_categories` (category slugs from `categories.yaml`).

## crisis_resources.yaml

A list, may be `[]`. Fields: `name`, `description`, `phone` (all required), `available_24_7` (default `true`), `languages` (default `[en, es]`), `crisis_topic` (`mental_health` or `domestic_violence`; marks a local line for that topic). 988, 911 and the National DV Hotline are built in; a line with one of those numbers is not repeated.

## zip_centroids.yaml (optional)

A list. Fields: `zip` (five digits, quoted), `latitude`, `longitude` (all required), `featured` (offer as a quick reply in the scripted intake; with none featured, the first five are used). A ZIP not listed is not radius-filtered. When this file is present, the validator warns about location ZIPs it does not list (`zip_not_covered`).

## matching_rules.yaml (optional)

A mapping; every key is optional. Service references are catalog slugs.

| Key | Shape | Effect |
| --- | --- | --- |
| `high_heat_zips` | list of quoted ZIPs | a resident with a chronic condition in one gets cooling and utilities services; the ZIP counts toward the `heat_vulnerable` flag |
| `crisis_services` | indicator: list of slugs | these services skip the relevance filter, gates and match cap, and lead the plan; they must be `status: active` |
| `prevention_services` | risk type: list of entries | lines listed on that risk flag; each entry sets exactly one of `service` (a slug) or `text` (at most 120 characters, for an organisation not in the catalog) |
| `benefit_estimates` | list | `services` (slugs), `label` (at most 80 characters), `monthly_value` (US dollars per month, 0 to 5000), `per_household_member`, `only_if_uninsured`; the first estimate listing a matched slug wins |

Crisis indicators: `domestic_violence`, `immediate_danger`, `suicidal_ideation`, `homelessness`. A crisis the model reports without naming a kind (`crisis_reported` on the profile) brings in the services listed for all of `domestic_violence`, `immediate_danger` and `suicidal_ideation`.

Risk types: `homelessness`, `housing_instability`, `food_insecurity`, `uninsured`, `domestic_violence`, `mental_health_crisis`, `social_isolation`, `child_mental_health_risk`, `heat_vulnerable`.

No other keys are accepted. In particular the loader rejects `need_keywords`, `category_order` and `source_url` today, so the server would not start.

## service_translations.yaml (optional)

A mapping of service slug to language code to `{description: ...}`. Shown in place of the English description when the resident's language matches.

## personas.yaml and admin_demo.yaml (optional)

Synthetic demo data. `personas.yaml` maps a persona id to `id` (equal to the key), `label`, `language`, `seed_profile`, `opening_message`, `persona_note`, an optional `script`, and optional launcher-card fields `summary` (one sentence) and `shows` (2-3 tags). A translated variant uses the base id plus `-<language>` and appears as a language chip on the base card; the schema is `config/schemas/personas.schema.json`. `admin_demo.yaml` feeds the admin console's demo views; its schema is deliberately loose. Never put real resident data in either.

## Running the validator

From `frontend/`:

```bash
npm run validate:pack                                  # the pack CITY_DATA_DIR selects, as the backend does (unset: the Austin pack)
npm run validate:pack -- --data-dir /path/to/pack      # any folder (a relative path is relative to frontend/)
npm run validate:pack -- --json                        # machine-readable report
npm run validate:pack -- --strict                      # unverified services are errors
npm run validate:pack -- --city-config presets/my-city.json   # also check categoryColors against the pack
```

Or from `backend/`: `python scripts/validate_pack.py [same flags]`, or `python -m app.services.pack_validator`. In Python:

```python
from app.services.pack_validator import validate_pack

report = validate_pack("/path/to/pack")          # a folder
report = validate_pack({"categories.yaml": [...], "services/food-bank.yaml": {...}, ...})  # parsed files
```

The exit code is 1 when there are errors, else 0. `npm run validate:catalog` is the services-only subset of the same checks.

The report (and `--json` output):

```json
{
  "source": "/path/to/pack",
  "errors": [{"file": "services/pantry.yaml", "path": "locations/0/latitude", "code": "zero_coordinates", "message": "...", "severity": "error"}],
  "warnings": [],
  "unverified": 2,
  "counts": {"services": 2, "active": 2, "seasonal": 0, "inactive": 0, "gated": 0, "locations": 1, "categories": 1,
             "life_events": 0, "crisis_resources": 0, "zip_centroids": 0, "translated_services": 0, "personas": 0}
}
```

`path` is a JSON-pointer-style path inside the file, empty for the whole file.

| Code | Severity | Meaning |
| --- | --- | --- |
| `missing_file` | error | a required file or folder, or the pack folder, is missing |
| `yaml` | error | the file is not valid YAML |
| `schema` | error | the record breaks its JSON Schema (unknown key, wrong type, bad pattern, ...) |
| `loader_rejects` | error | passes the schema, but the loader's model rejects it |
| `duplicate_id`, `duplicate_slug`, `duplicate_zip`, `duplicate_location_id` | error | not unique |
| `slug_file_mismatch` | error | a service slug differs from its file name |
| `unknown_category` | error | a service, life event or city-config colour names a category slug not in `categories.yaml` |
| `location_service_id` | error | a location's `service_id` is not its service's `id` |
| `zero_coordinates` | error | a latitude or longitude is 0 |
| `primary_location` | error / warning | more than one primary location (error), or none (warning) |
| `date_in_future` | error | `last_verified_date` or a source `retrieved_at` is after today |
| `unknown_service_slug` | error | matching rules or translations name a slug no service has |
| `crisis_service_not_active` | error | a crisis-direct service is not `active` |
| `persona_id_mismatch` | error | a persona's `id` differs from its key |
| `bbox_order` | error | `pack.yaml` bbox is not `[west, south, east, north]` |
| `unverified` | warning (error with `--strict`) | `last_verified_date` or `verified_by` is missing |
| `hours_unverified` | warning | a location's hours are not `hours_verified: true` |
| `hours_unparseable` | warning | an hours value reads as closed by accident |
| `missing_hours` | warning | a location has no hours |
| `outside_bbox` | warning | a location is outside the `pack.yaml` bbox |
| `zip_not_covered` | warning | a location ZIP is not in `zip_centroids.yaml` |
| `too_many_categories` | warning | more than 5 categories on a service |
| `category_unknown_to_engine` | warning | see [categories.yaml](#categoriesyaml) |
| `empty_website_url` | warning | `website_url` is empty or missing |
| `markup_in_text` | warning | HTML tags or Markdown links in display text |
| `ignored_file` | warning | a file the loader never reads |

Warnings do not block loading. The Austin pack passes with 0 errors and warnings for unverified entries, unverified hours, a few ZIPs not in its centroid list and four categories outside the engine's list.

## The smallest pack

```text
my-pack/
├── categories.yaml          - {id: cat-food, name: Food, slug: food}
├── life_events.yaml         []
├── crisis_resources.yaml    []
└── services/
    └── town-pantry.yaml
```

```yaml
# services/town-pantry.yaml
id: svc-town-pantry
slug: town-pantry
name: Town Pantry
provider_name: Town Food Network
eligibility_summary: Open to all residents.
status: active
phone: 555-010-0100
categories: [food]
```

The full example, with a location, hours, sources and a manifest, is `backend/tests/fixtures/packs/example-minimal/`; a test boots the app on it and runs a match.

## Verification

Every service starts unverified. `last_verified_date`, `verified_by` and `hours_verified: true` mean a person checked the entry with the provider. Only staff set them, after that check. `--strict` fails on unverified services; do not describe a pack as verified until it passes `--strict`.

## For AI agents and import tools

1. Write the files above. Use only the keys and vocabularies in this document; unknown keys are errors.
2. Take every fact from a source, prefer the provider's own pages, and record each in `sources` with `url`, `retrieved_at` and `fields`. Leave a field out rather than guess it.
3. Never set `last_verified_date`, `verified_by`, or `hours_verified: true`. Those record a human check.
4. Set `pack.yaml` with `generated_by` naming your tool and version, and a `bbox` for the service area.
5. Run `npm run validate:pack -- --data-dir <pack> --json` and fix every entry in `errors`. Repeat until `errors` is empty. Review warnings; `unverified` and `hours_unverified` are expected.
6. Hand the pack to staff for review. Nothing in it is verified until they say so.

## Known limits

- No income, residency, numeric-age or household-size gates (use `other_criteria` and `eligibility_summary`).
- No field for the area a service covers. Radius search uses its locations only, so a phone-only or online service with no locations drops out of a search by a listed ZIP.
- `provider_type`, `sources`, `last_verified_date` and `verified_by` are loaded and shown in the staff console, but the matching engine does not use them.
- Hours support one range per day.
- The schemas are not served by the API; read them from `config/schemas/`.

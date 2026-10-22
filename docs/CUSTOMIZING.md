# Deploying for your place

To deploy this app for your own agency you change two things, and neither needs a source edit: the **city config** (identity, text, colors, logo, map, a few settings) and a **data pack** (your services, categories, crisis lines and other local data). The default config and the bundled pack describe Austin, Texas. They are the reference deployment and demo content. A short [checklist](#checklist-for-a-new-deployment) is at the end of the config sections.

The city config comes first. You don't need to edit any components. The same file format is used by [Austin Health Pulse](https://github.com/coa-chrisc/austin-health-pulse), so a health department can keep one config for both apps (see [Using the same file as Austin Health Pulse](#using-the-same-file-as-austin-health-pulse)).

## 1. Start from a preset

Presets live in `config/presets/`. Three are included: `austin-travis-tx` (Austin Public Health), `bchc-demo-city` (Metro Public Health, fictional), and `cedar-ridge-county` (Cedar Ridge County Health Department, fictional, with square corners and a purple palette). Copy the closest one:

```bash
cp config/presets/cedar-ridge-county.json config/presets/my-city.json
```

Edit the copy, then build with it:

```bash
cd frontend
CITY_CONFIG=presets/my-city.json npm run dev       # live preview
CITY_CONFIG=presets/my-city.json npm run build
```

`CITY_PRESET=my-city` is a shorthand for `CITY_CONFIG=presets/my-city.json`. An unknown name fails the build and lists the presets that exist.

The config is checked against [`config/city.config.schema.json`](../config/city.config.schema.json) when you build. Editors that support JSON Schema, such as VS Code, autocomplete and flag errors as you type because of the `$schema` line at the top of each preset.

To make your config the default, copy it over `config/city.config.json` (keep `$schema` pointing at `./city.config.schema.json` in that location).

The backend reads the same file for the app name, the agency lines, and the time zone. Run it with the same variable so both sides agree:

```bash
cd backend
CITY_CONFIG=presets/my-city.json uvicorn app.main:app --reload
```

With Docker, pass the build argument: `docker build --build-arg CITY_CONFIG=presets/my-city.json .`. The image carries `config/` and sets the variable at runtime too.

## 2. Names and text

| Key | Where it shows |
| --- | --- |
| `appName` | Browser tab title, the chat welcome ("Welcome to …"), the shared plan text, the PWA name, the backend's scripted greeting and system prompt opening line, the SMS and email share text, the realtime transcription prompt, the OpenAPI title (unless `APP_NAME` is set), and the email sender name (unless `SENDGRID_FROM_NAME` is set) |
| `agency.name` | Logo alt text, the footer agency link, and the backend system prompt ("… portal") |
| `agency.shortName` | Initials on the generated logo tile when `brand.logoUrl` is `null`; the PWA short name unless `serviceGuide.shortName` is set |
| `agency.parent` | Default footer disclaimer ("Agency \| Parent") and the backend system prompt |
| `region.name` | Not printed on screen. The backend's PII name rule skips it, like `region.cityName` |
| `region.cityName` | Landing and directory text ("services across Austin"), the admin "All Austin" filter, the admin service form's default city, and the "You told us you're new to …" intake notice. The backend's PII name rule also skips it, so "I'm Austin Resident" is not redacted as a name |
| `region.state` | Not printed on screen. The backend's PII name rule skips the full state name for this code (for example `TX` and "Texas") |

## 3. Colors

`theme.colors` sets 18 colors by role. Every key is required and must be a six-digit hex value such as `#44499C`. The theme is built in `frontend/src/theme/brandTheme.ts`.

| Key | Where it shows |
| --- | --- |
| `primary` | MUI `primary.main`: buttons, links, active controls, focus |
| `primarySoft` | `theme.palette.brand.primarySoft`: tinted panels |
| `accent` | MUI `secondary.main`: highlights, the generated logo tile |
| `accentSoft` | MUI `secondary.light` and `brand.accentSoft`: tinted accent backgrounds |
| `ink` | MUI `primary.dark` and `brand.ink`: header, hero, and card shadows |
| `onBrand` | `brand.onBrand`: first choice for text on brand fills (see the contrast rule) |
| `page` | MUI `background.default` |
| `surface` | MUI `background.paper`: cards, dialogs, menus |
| `subtle` | `brand.subtle`: progress tracks, empty slots |
| `body` | MUI `text.primary` |
| `muted` | MUI `text.secondary` |
| `line` | MUI `divider` |
| `noData` | `brand.noData`: map and chart fill for missing data |
| `positive` | MUI `success.dark` and `brand.positive`: text that means "better" |
| `positiveFill` | MUI `success.main`: fills that mean "better" |
| `negative` | MUI `error.main`: errors and fills that mean "worse" |
| `warning` | MUI `warning.main` |
| `scrim` | `brand.scrim`: backdrop behind modals and overlays |

Two more lists sit next to `colors`:

- **`dataScale`** is exactly five colors, ordered worst to best. It is `theme.palette.brand.dataScale`, used by the admin equity, demand map and partner-gap screens.
- **`series`** is 3 to 8 colors, available as `theme.palette.brand.series`. The admin reports use them in order. `info.main` is `series[3]` when there are four or more, otherwise `primary`. Category colors cycle through the series (see [Category colors](#category-colors)).

`theme.palette.brand.heroGradient` is a 135-degree gradient from `primary` through `ink` to a darker `accent` (MUI's default `secondary.dark`), built for you so that primary's text color reads on every stop. If it would not read on the darker accent, the last stop moves toward `ink` until it does.

`ink` must carry primary's text color at 4.5:1, because it is the hover shade and a gradient stop; the build fails otherwise. In dark mode, where `ink` stays dark under dark text, `primary.dark` is derived from `ink` toward `primary` just far enough to read.

### The contrast rule

The build fails if any text pair is below WCAG AA (4.5:1). The build never changes, lightens, darkens, or invents a brand color. When text sits on a brand fill, it picks the text color from your own colors, in this order: `onBrand`, `body`, `ink`, `surface`, `page`. The first one that reaches 4.5:1 becomes that fill's text color, and the build logs the swap:

```
[city-config] contrast swap: text on accent #009F4D: onBrand 3.46 -> body #1a1a1a 5.03
```

If none of the five passes, the build stops and names the pair and the best ratio it found. The fills it resolves are `primary`, `accent`, `negative`, `warning`, the `positiveFill`, `ink`, and the `info`/`series` colors. It also checks `body` and `muted` on `page` and `surface`, and `positive` and `negative` as text on `surface`. All of this is checked for dark mode too.

Components get the same answer at run time through `theme.palette.brand.textOn(fill)`, and red error text on light surfaces uses `theme.palette.brand.negativeText`.

## 4. Dark mode

Every config gets a dark theme that residents can switch to; the app opens in light mode. `serviceGuide.darkColors` is optional and takes the same 18 role keys, all optional. Any role you leave out is derived (`deriveDarkColors` in `frontend/src/theme/contrast.ts`): `page`, `surface` and `subtle` come from `ink` mixed toward black, `body` and `muted` come from your light-mode `page` and `line`, and `primary`, `accent`, `positive` and `negative` keep your color if it reads on the dark background and are lightened just enough if not. Fills (`positiveFill`, `warning`, `ink`, `onBrand`, `scrim`) carry over unchanged. Brand colors are only tinted in this derived dark mode, never in light mode.

The theme toggle stores its choice in `localStorage` under `asg-theme-mode`.

## 5. Typography

The app bundles its font through an `@fontsource` package, so the browser contacts no font service. To change it:

1. Run `npm install @fontsource/<font>` in `frontend/`.
2. Set `theme.typography` in your config:

```json
"typography": {
  "fontPackage": "@fontsource/inter",
  "family": "Inter",
  "fallback": "Helvetica, Arial, sans-serif",
  "baseSize": 16,
  "sizes": {}
}
```

| Key | Meaning |
| --- | --- |
| `fontPackage` | The installed `@fontsource` package |
| `family` | The CSS font name the package defines |
| `fallback` | Fonts to use while it loads or if it fails |
| `baseSize` | 12 to 24; scales text and spacing |
| `sizes` | Overrides for single text steps, in `rem` (`3xs` to `7xl`). `{}` keeps the defaults. |

The build fails if the package is not installed. For languages that need more scripts than your main font covers (Arabic, Chinese, Vietnamese), list extra packages in `serviceGuide.extraFontPackages`, for example `["@fontsource/noto-sans"]`; each must also be installed.

## 6. Radius

`theme.radius` sets four corner sizes, each a `rem` or `px` value such as `0.5rem`:

| Key | Used for |
| --- | --- |
| `chip` | `MuiChip` |
| `control` | Buttons, text fields, selects, and MUI's default `shape.borderRadius` |
| `card` | `MuiCard` |
| `panel` | `MuiPaper`, `MuiDialog`, `MuiDrawer` |

Set them all to `0rem` for square corners. The Cedar Ridge County preset uses square controls and cards; Austin uses rounder values.

## 7. Logo and browser-tab icon

Put your logo under `config/brand/<your-id>/` and point `brand.logoUrl` at it, relative to `config/`:

```json
"brand": { "logoUrl": "brand/my-city/logo.svg" }
```

- **Where it shows:** in the header and the landing page footer. The alt text is `agency.name`.
- **How it's served:** the build bundles the file with the app, so it is served from your own site. The build fails if the file is missing.
- **When it's `null`:** a generated tile is used instead: your `accent` color with the first letters of `agency.shortName`, in `onBrand` or the first of your colors that passes the contrast rule.

The browser-tab icon is generated at build time from your colors.

## 8. Map

`map.center` (`[lat, lng]`), `zoom`, `minZoom`, and `maxZoom` set the starting view of the resident map and the admin demand map. Map tiles come from OpenStreetMap's public tile server unless you set a tile server at build time. OSM's server is fine for a demo, but it is not meant for production traffic (see its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)). To use another provider, set both variables when you build (in the shell, in `frontend/.env`, or as Docker build args):

```bash
VITE_MAP_TILE_URL='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
VITE_MAP_TILE_ATTRIBUTION='&copy; OpenStreetMap contributors &copy; CARTO'
```

- The URL is a Leaflet template: `{z}/{x}/{y}` are required, and `{s}` picks a subdomain. It must be `https://`.
- The attribution is HTML shown in the map corner. It is required with a custom URL; the build fails without it.
- Both values are built into the browser bundle, so any API key in the URL is public. Use a key your provider lets you restrict to your domain.
- The offline service worker caches tiles from the URL's host for 60 days. Check that your provider's terms allow that.

## 9. The `serviceGuide` block

Everything specific to this app sits in one optional block. Every key is optional, and any key you leave out gets a default.

| Key | Where it shows | Default |
| --- | --- | --- |
| `shortName` | PWA short name | `agency.shortName` |
| `description` | Page description meta tag, PWA description | Built from `appName`, `region.cityName`, `agency.name` |
| `copy.tagline` | Landing page headline text | "Find services you may qualify for — in minutes" |
| `copy.footerDisclaimer` | Landing page footer | `agency.name \| agency.parent` |
| `copy.privacyNotice` | The notice above the chat and search boxes | A generic "do not enter your name, address, phone, or SSN" notice |
| `contact.phone311` | The "Call …" footer link | `311` |
| `contact.agencyWebsite` | Footer agency link | Empty (the link is hidden) |
| `contact.accessibilityUrl` | Footer "Accessibility" link | Empty (the link is hidden) |
| `darkColors` | Dark mode palette | Derived (see [Dark mode](#4-dark-mode)) |
| `categoryColors` | See below | Series colors |
| `extraFontPackages` | Extra scripts | None |
| `pwa.themeColor`, `pwa.backgroundColor` | PWA manifest | `primary` and `page` |
| `timezone` | IANA zone, for example `America/Chicago`. Drives "open now" and next-open hours on the backend. An unknown zone fails backend startup | UTC, so set it |
| `languages` | Language codes in the selector, in display order, from `en, es, zh, hi, ar, vi, fr, ko`. Must include `en` | All eight |

The privacy notice is English-only.

### Category colors

`theme.palette.brand.category(slug)` returns the color for a service category (the map pins and the admin eligibility table use it). It uses `serviceGuide.categoryColors[slug]` when you set one, and otherwise cycles through `series` in the order of `backend/app/data/categories.yaml`. Unknown slugs in `categoryColors` fail the build.

## 10. The theme guard

Components must use the theme, not literal colors. Use `useBrandConfig()` for config values, and `theme.palette.*` and `theme.palette.brand.*` for colors. `frontend/src/theme/themeGuard.test.ts` runs under `npm test` and fails on hex literals, `rgb()`/`hsl()`/`oklch()` values, named CSS colors used as values, and `@mui/material/colors` imports in `frontend/src` (the `theme/` folder and test files are excluded). For a rare exception, add a `theme-exempt: <reason>` comment on the same line.

The guard compares each file against `frontend/src/theme/themeGuard.baseline.json`. A file may not exceed its baseline, and must not fall below it either, so the baseline shrinks as literals are removed.

## 11. Check your work

```bash
cd frontend
export CITY_CONFIG=presets/my-city.json CITY_DATA_DIR=data/my-city
npm run build                                       # schema, logo, fonts, contrast gate, categories
npm test                                            # includes the theme guard
npm run validate:catalog -- --data-dir ../config/data/my-city   # your catalog against the schema
cd ../backend
python -m compileall -q app
```

The backend test suite includes tests of the bundled Austin content, so it is a check of this repository, not of your pack. A bad pack fails backend startup with a message that names the file.

The City of Austin and Austin Public Health names, logos, and palette identify the City. Replace them in your deployment. The Austin presets use a generated logo tile (`logoUrl` is `null`), not a City logo.

## Your data pack

The city config says who you are. The data pack says what is there: your services and the other local data. The bundled pack in `backend/app/data/` is the Austin reference. To make your own:

```bash
cp -r backend/app/data config/data/my-city
```

Then set `CITY_DATA_DIR=data/my-city` for the backend, for the frontend build, and as a Docker build argument. A relative value resolves under `config/`, and the Docker image already copies `config/`, so the pack ships with it. An absolute path is used as-is. Unset means the bundled Austin pack. A missing directory, or one with no `categories.yaml`, fails startup instead of serving another city's data.

Replace the files in your copy (and delete the Austin `README.md`):

| File | What it does |
| --- | --- |
| `services/<slug>.yaml` | One service per file. The service catalog. Required. |
| `categories.yaml` | Service categories. Required. The frontend build reads it too. |
| `life_events.yaml` | Life-event entry points on the landing page. Required, may be `[]`. |
| `crisis_resources.yaml` | Local crisis lines. Required, may be `[]`. A `crisis_topic` (`mental_health` or `domestic_violence`) puts a local line into the crisis response. 988, 911 and the National DV Hotline are national defaults in code. |
| `zip_centroids.yaml` | ZIP centers for distance filtering, and the ZIP buttons in the scripted demo flow (`featured`). Optional. |
| `matching_rules.yaml` | Heat-risk ZIPs, crisis-direct and prevention services (by slug), benefit estimates. Optional. |
| `service_translations.yaml` | Translated service descriptions. Optional. |
| `personas.yaml` | Demo personas. Optional. With none, the demo launcher is hidden. |
| `admin_demo.yaml` | Synthetic data for the admin console, including `council_districts`. Optional. With none, admin views are empty. |

Field-by-field schemas, validation rules and the loader are in [backend/app/data/README.md](../backend/app/data/README.md). Do not repeat them here.

Your records are unverified until your staff check them. Run `npm run validate:catalog -- --data-dir ../config/data/my-city` from `frontend/` to check the YAML against `config/services.schema.json` (it does not read `CITY_DATA_DIR`; without `--data-dir` it checks the bundled pack). It reports unverified entries, and `--strict` fails on them. Do not describe a catalog as verified until it is.

## What is still Austin-specific

- **The bundled data pack's content.** It is the reference pack. Nothing in your deployment uses it once `CITY_DATA_DIR` points at your own.
- **Speech defaults.** On-device speech recognition and synthesis default to `en-US`.
- **The model prompt assumes a US setting.** It names no place, but it talks about 988, 911, SNAP and Medicaid. One tool description in `tool_schemas.py` names Integral Care as an example.
- **The Austin presets and the City's names and logos.** Replace them.

## Checklist for a new deployment

1. **City config.** Copy a preset to `config/presets/<id>.json`; set `appName`, `agency`, `region`, colors, `map`, contact links and `serviceGuide.timezone` (and `languages` if you offer fewer).
2. **Logo.** Put it under `config/brand/<id>/` and set `brand.logoUrl`, or leave it `null` for the generated tile.
3. **Data pack.** Copy `backend/app/data` to `config/data/<id>/` and replace the files.
4. **Map tiles.** Set `VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION` for production (see [Map](#8-map)).
5. **Environment variables.** `CITY_CONFIG=presets/<id>.json` and `CITY_DATA_DIR=data/<id>` for the build and the runtime; then the usual `OPENAI_API_KEY`, `PUBLIC_ORIGIN`, `CORS_ORIGINS`, `ADMIN_API_TOKEN` (see [deploy/README.md](../deploy/README.md)).
6. **Verify.** Run the build, tests and catalog check in [Check your work](#11-check-your-work) with your variables set.

The admin console has no real authentication, and the privacy, security and legal reviews in [SECURITY.md](../SECURITY.md) still apply.

The backend fails at startup with a `CityConfigError` if the selected config is missing or malformed. It does not fall back to Austin, so a mistyped `CITY_CONFIG` can't silently greet residents as the wrong city. It looks for `config/` in `CITY_CONFIG_DIR`, then next to the `app` folder (`/app/config` in the Docker image), then at the repository root.

## Using the same file as Austin Health Pulse

Austin Health Pulse uses the same city config format. The shared core is identical in both apps: `$schema`, `id`, `appName`, `agency`, `region`, `brand.logoUrl`, `theme` (colors, `dataScale`, `series`, typography, radius), and `map`.

- A Health Pulse config validates here unchanged. Its Health Pulse-only keys (`showBuildStory`, `featuredZips`, `dataQualityNotes`, `serviceGuideUrl`, `data`, `dataSources`, `dataAsOf`, `pipeline`) are accepted and ignored by this app. A test checks a copy of the Health Pulse key shape (`frontend/src/theme/__fixtures__/health-pulse.city.config.json`).
- The `serviceGuide` block is read only here. Health Pulse does not accept it yet, so a config that contains it will not validate in Health Pulse until that app's schema is updated (planned follow-up). Until then, keep two files, or strip `serviceGuide` before using one in Health Pulse.
- Contrast results can differ between the apps, because each resolves text colors for its own screens.

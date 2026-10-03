# ZYA Imprint Signal Vault v3.2

Privacy-first, local-first page analytics for Neocities and other static sites, plus a dashboard for imported snapshots, optional aggregate collection, and public Neocities totals.

## v3.2 reliability patch

### Follow-up correctness fixes

- Neocities builds enforce API-disabled mode in Vite, including when the surrounding environment enables APIs. The shared `.env.neocities` defaults are included in the repository.
- Auto mode falls back to the same-origin static snapshot when the Node API is unavailable; it does not contact a public proxy.
- Tracker flushes persist and send only new engagement/error counters. Manual navigation, SPA navigation, and repeated unload events use the same accounting path.
- Consent applies to optional Neocities polling, delayed performance writes, error collection, and lifecycle sends. Revocation stops active polling and discards pending totals responses; a new explicit grant resumes tracking.
- Rich device, session, and navigation diagnostics stay local. The bundled collector ignores those fields from older trackers and removes them from existing collector files on startup, preserving page counts and aggregate history.
- Successful orbit refreshes clear prior failure state even when public totals have not changed.

The tracker storage schema remains version 2. These fixes prevent future overcounting; they cannot reconstruct engagement totals already inflated by an older tracker.

### Original v3.2 changes

- Static deployments no longer call missing `/api/*` routes or public CORS proxies.
- `npm run build:neocities` generates a validated `neocities-cache.json`; the dashboard reloads that same-origin snapshot when “Refresh orbit” is pressed.
- Node deployments use one same-origin `/api/neocities/batch` request with bounded concurrency and a five-minute server cache.
- A failed live lookup falls back to the last good static snapshot for that site.
- Identical cached snapshots are deduplicated instead of inflating history curves.
- Build-time prefetch retries transient failures and preserves prior successful entries.
- The install verifier is server-only; static builds disable it rather than sending inspected URLs through public proxies.
- Optional tracker-side Neocities totals now require an explicit same-origin or CORS-enabled endpoint/cache URL.
- Removed remote Google Fonts and corrected the favicon base path for subdirectory deployments.

## Architecture

### Local mode

Each website origin writes only to its own `localStorage`. Browsers intentionally isolate storage by origin. Export a site snapshot with:

```js
zyaImprint.export()
```

Then import that JSON into Signal Vault.

### Static Neocities mode

A static site cannot run Express routes. The build process fetches public Neocities totals server-side and bundles them as `neocities-cache.json`. Browser refreshes reload this file with `cache: no-store` and never attempt direct Neocities API calls.

Static refresh means “load the newest deployed cache,” not “call Neocities live from the browser.” To update totals, rebuild and redeploy.

### Node mode

The Express server provides:

- `GET /api/health`
- `GET /api/neocities/info?sitename=...`
- `GET /api/neocities/batch?sites=site1,site2`
- `GET /api/inspect?url=...`
- optional collector routes under `/api/imprint`

### Collector mode

Set `IMPRINT_COLLECTOR_ENABLED=true`, configure `IMPRINT_ALLOWED_ORIGINS`, and provide `IMPRINT_READ_TOKEN`. The collector stores aggregate page fields only. It does not persist IP addresses or user agents.

Local snapshots can contain device/user-agent, session, and navigation diagnostics. Remote payloads omit `device`, `session`, `sessionId`, `navigation`, and `fullReferrer`; the Node collector also rejects those diagnostic fields by omission when older clients send them. Its retained fields include page metadata, sanitized referrer, counters, errors, performance metrics, and public Neocities totals. Older collector files have their rich diagnostic fields removed on startup. This migration preserves counts and requires a writable collector data file.

Remote installs default to `consent: "required"`:

```js
zyaImprint.grantConsent()
```

Call `zyaImprint.denyConsent()` to stop further tracking and remote sends. Existing snapshots remain available for inspection/export. Revocation cannot retract a request already handed to the browser or remove copies already received by another server.

## Install

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build for deffy.me / Neocities

The default deployment path is `/zya-imprint/`:

```bash
npm run build:neocities
```

This command:

1. fetches all configured Neocities sites with retries and bounded concurrency;
2. preserves the last good snapshot when a transient refresh fails;
3. refuses to replace the cache if a site has no usable current or previous snapshot;
4. builds with `VITE_RUNTIME_API=disabled`, preventing browser API probes and CORS fallbacks.

Upload the contents of `dist/` into `/zya-imprint/`. Upload `dist/zya-imprint.js` to the desired tracker URL.

To customize the prefetch list, create `.neocities-sites` with one sitename per line before building.

Optional prefetch controls:

```bash
NEOCITIES_PREFETCH_ATTEMPTS=3
NEOCITIES_PREFETCH_CONCURRENCY=4
NEOCITIES_PREFETCH_TIMEOUT_MS=15000
```

`NEOCITIES_PREFETCH_ALLOW_PARTIAL=true` is available for intentional partial builds, but is not recommended for normal releases.

## Production Node mode

```bash
npm run build
npm start
```

The dashboard is served at `/zya-imprint/`, the tracker at `/zya-imprint.js`, and APIs under `/api/`.

## Quality checks

```bash
npm run check
npm run audit:prod
```

## Minimal tracker install

```html
<script src="/zya-imprint.js" data-site-id="deffy" defer></script>
```

## Full tracker install

```html
<script>
window.ZYA_IMPRINT = {
  siteId: "deffy",
  retentionDays: 90,
  spa: true,
  respectPrivacy: true,
  consent: "implicit",
  trackEngagement: true,
  trackDevice: true,
  trackPerformance: true,
  trackErrors: true,
  trackNeocities: false
};
</script>
<script src="/zya-imprint.js" defer></script>
```

To attach public Neocities totals to tracker snapshots, provide an endpoint the page is actually allowed to fetch:

```js
window.ZYA_IMPRINT = {
  siteId: "deffy",
  trackNeocities: true,
  neocitiesSite: "deffy",
  neocitiesEndpoint: "/api/neocities/info"
};
```

A JSON cache URL is also supported. The tracker searches its `sites` array for the configured sitename.

## Tracker options

| Option | Default | Description |
|---|---:|---|
| `siteId` | hostname | Unique site identifier |
| `retentionDays` | 90 | Local daily-history retention, 7–730 days |
| `spa` | true | Track `pushState`, `replaceState`, and `popstate` navigation |
| `respectPrivacy` | true | Respect DNT and GPC signals |
| `consent` | implicit | `implicit`, `required`, or `disabled` |
| `collector` | none | Optional collector POST endpoint |
| `trackEngagement` | true | Time, scroll, clicks, interactions, bounces |
| `trackDevice` | true | Browser/device environment fields |
| `trackPerformance` | true | Navigation and paint timings |
| `trackErrors` | true | Uncaught errors and rejected promises |
| `trackNeocities` | false | Attach public totals when an endpoint is configured |
| `neocitiesSite` | `siteId` | Sitename to locate |
| `neocitiesEndpoint` | none | Same-origin or CORS-enabled API/cache URL |

## Browser API

```js
zyaImprint.track()
zyaImprint.getSnapshot()
zyaImprint.getEngagement()
zyaImprint.flushEngagement()
zyaImprint.fetchNeocities()
zyaImprint.export()
zyaImprint.clear()
zyaImprint.grantConsent()
zyaImprint.denyConsent()
```

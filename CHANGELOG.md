# Changelog

## Unreleased — Accounting and Privacy Corrections

### Fixed
- Enforced cache-only Neocities builds independently of local environment files and added the shared `.env.neocities` file to the tracked configuration.
- Removed the remaining public CORS-proxy fallback from automatic orbit refresh.
- Changed static-cache success messages to explain rebuild/redeploy freshness and reserve warning severity for partial/retained results.
- Fixed successful orbit recovery being deduplicated against an error entry; matching timestamps no longer suppress changed totals.
- Replaced cumulative engagement/error sends with per-visit deltas shared by manual, SPA, and lifecycle flush paths.
- Deferred bounce classification until a visit ends, avoiding false bounces from intermediate manual flushes.
- Preserved engagement across repeat manual views of the same path and persisted errors when engagement tracking is disabled.
- Applied consent/privacy gates to polling, pending totals responses, delayed performance writes, error capture, persistence, and remote sends.
- Made explicit denial effective in implicit-consent mode and stopped active listeners/polling on revocation.
- Kept device/session/navigation diagnostics local and scrubbed those fields from legacy collector files on startup.

### Validation and Dependencies
- Added tracker lifecycle/consent tests, orbit boundary/recovery tests, real collector HTTP tests, and deployment configuration tests.
- Updated compatible dependency versions in the lockfile; production dependency audit reports zero known vulnerabilities. Development-only Vitest advisories require a separate test-runner upgrade.
- Build-time prefetch retained all 19 existing site snapshots after upstream HTTP 502 responses; the generated cache labels those entries stale and keeps their original timestamps.

## 3.2.0 — Static Orbit Reliability Patch

### Fixed
- Eliminated the static deployment's 17/19 CORS/404 failure cascade.
- Static builds now load same-origin `neocities-cache.json` and never probe unavailable APIs or public proxies.
- Added per-site cache fallback for failed live Node lookups.
- Deduplicated identical history points and corrected snapshot/source labeling.
- Removed direct Neocities browser fetches from the optional tracker integration.
- Disabled remote install verification in static mode instead of using public CORS proxies.
- Fixed favicon base-path handling.

### Added
- `/api/neocities/batch` with bounded upstream concurrency and a five-minute success cache.
- Retry/backoff, last-good preservation, completeness metadata, and strict failure behavior for build-time prefetch.
- `VITE_RUNTIME_API` and `VITE_API_BASE_URL` deployment controls.
- Static Neocities build mode via `.env.neocities`.
- Cache/batch/fallback/deduplication tests and Vitest project configuration.

### Changed
- Version bumped to 3.2.0.
- Removed third-party Google Fonts for a fully first-party dashboard load.
- Updated documentation to state static-versus-Node capabilities accurately.

## 3.1.0 — Full Pass Polish

### Fixed
- Accessibility: tab buttons now have `id` attributes matching `aria-labelledby` on tabpanels
- Accessibility: Graph Vault view toggle has `role="group"`, `aria-label`, and `aria-pressed`
- OverviewTab: selected page/site now auto-updates when data loads asynchronously or current selection is removed
- Graph Vault: empty states now distinguish "no data yet" from "no search results"
- Compare table: numeric columns now right-aligned for readability

### Improved
- CSS: added `:focus-visible` outlines for buttons, tabs, dropdown items, toggle rows, and range pills
- CSS: added Firefox `scrollbar-width`/`scrollbar-color` styling to match WebKit scrollbar theme
- Server: exported `parseTracker`, `cleanSiteName`, `isPublicIp`, `isAllowedOrigin` for testability
- Server: guarded auto-start with `NODE_ENV !== "test"` to prevent side effects during tests

### Added
- Vitest config with jsdom environment and `@testing-library/react` setup
- Component tests: `AnimatedCounter`, `SummaryCards`, `Sparkline`, `ChartToolbar`, `ErrorBoundary` (17 tests)
- Server tests: `parseTracker`, `cleanSiteName`, `isPublicIp` (20 tests)
- Utility tests expanded from 10 to 53 tests covering 12 functions

## 3.0.0 — Signal Vault Evolution

### Fixed
- Base path mismatch: Vite default now `/stats/` to match server route
- Version mismatch: package.json bumped from 2.0.0 to 3.0.0
- Windows compatibility: `clean` script no longer uses Unix-only `rm -rf`
- Tracker `saveStore` now prunes to 30-day minimal snapshot on `QuotaExceededError`
- Dashboard Neocities fetch now tries server `/api/neocities/info` first instead of relying solely on third-party CORS proxies
- InstallLab inspect URL now uses `BASE_URL` prefix for server API endpoint
- Tracker Neocities fetch no longer uses third-party CORS proxies (official API works directly)
- SiteDetail chart x-axis labels no longer overlap (uses `formatDate` instead of `formatDateTime`)

### Improved
- Graph Vault: added search/filter input and page/site toggle
- Table headers: clickable for sort with directional arrows
- SiteDetail: Neocities tags now displayed as chips
- Header: last refreshed indicator shows when orbit data was pulled
- Footer: brand closure with privacy reminder
- Summary cards: responsive grid improved to 3 columns on small screens
- Accessibility: `prefers-reduced-motion` disables all animations

### Refactored
- Extracted `formatDuration` to `utils.ts` (was duplicated in `LocalDetail` and `SummaryCards`)
- Extracted `createSorter` generic utility to `utils.ts` (was duplicated inline in `OverviewTab`)
- Extracted `fetchWithTimeout` to `utils.ts` (was inline in `App.tsx`)
- Extracted `fetchNeocitiesSite` and `refreshSiteWideStats` into `useNeocitiesFetch` hook
- Broke `GraphVaultTab` into `PageGraphCard` and `SiteGraphCard` sub-components
- Added `LocalSummary` and `SiteSummary` interfaces to `types.ts`, replacing `any` props

## 2.0.0 — Signal Vault Rebuild

- Added ZYA Imprint standalone tracker.
- Added multi-origin dashboard data model.
- Added safe snapshot import/export.
- Added optional aggregate collector and collector sync.
- Added hardened install verifier.
- Added bounded local and remote retention.
- Added consent, GPC, DNT, and SPA support.
- Redesigned all dashboard views with Deffy/PYAH palette.
- Removed public proxy fallbacks and unused AI dependencies.
- Fixed production server, auto-refresh, and package security issues.

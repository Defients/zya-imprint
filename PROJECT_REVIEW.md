# ZYA Imprint v3.2 — Completion Review

## Critical production defect corrected

The deployed dashboard was static, but its refresh path first requested `/api/neocities/info` as though Express were running on `deffy.me`. Every request returned 404. The client then attempted the official Neocities endpoint and public proxy services from the browser; those requests were blocked by CORS or failed independently. The result was the reported 2/19 success rate and a large console-error cascade.

## v3.2 corrections

1. **Deployment-aware runtime**
   - `build:neocities` now uses `.env.neocities` with `VITE_RUNTIME_API=disabled`.
   - Static builds perform no `/api/health`, `/api/neocities/*`, or third-party proxy requests.
   - Node builds retain live API functionality.

2. **Reliable static cache**
   - Build-time prefetch uses retries, bounded concurrency, response validation, and explicit failure policy.
   - Last good per-site snapshots survive temporary upstream failures.
   - A build aborts rather than replacing a complete cache with unusable gaps.

3. **Efficient Node live refresh**
   - Added `/api/neocities/batch`.
   - Server limits upstream concurrency and caches successful responses for five minutes.
   - Client falls back per-site to the static cache when live lookup fails.

4. **History correctness**
   - Refresh metadata records whether a point came from live API or static cache.
   - Identical points are deduplicated.
   - UI labels the source and snapshot age instead of claiming every click was a live pull.

5. **Related CORS traps removed**
   - Install verifier no longer leaks target URLs through public proxy services.
   - Static builds clearly report that verification requires the Node server.
   - Tracker-side Neocities totals require an explicit allowed endpoint/cache URL and no longer call Neocities directly.

6. **Polish**
   - Removed external Google Fonts.
   - Fixed favicon routing under `/zya-imprint/`.
   - Migrated Vitest environment routing to supported test projects.
   - Added focused tests for cache compatibility, batch parsing, fallback summaries, deduplication, batch sanitization, and concurrency ordering.

## Deployment truth

- A static Neocities deployment can host the dashboard, tracker, imports, local analytics, and a build-generated public-total cache.
- It cannot execute Express APIs, inspect arbitrary remote HTML server-side, or collect cross-origin POST events without a separate backend.
- “Refresh orbit” on a static deployment reloads the newest deployed cache. Fresh public totals require rebuilding and redeploying that cache.

## Verification target

A release is acceptable when:

- TypeScript passes with no errors.
- All tests pass.
- Standard and static builds complete.
- The static bundle is built in API-disabled mode.
- The bundled cache contains a usable entry for every configured site.
- Production dependency audit reports no known vulnerabilities.

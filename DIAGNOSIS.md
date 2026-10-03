### Symptom

**TL;DR:** Diagnosed and corrected static-build drift, orbit recovery suppression, tracker engagement overcounting, incomplete consent enforcement, and rich diagnostics leaking into collector storage. Full local checks pass: 131 tests, TypeScript, standard/static builds, production dependency audit, and Chromium checks at desktop/mobile widths. Live Neocities freshness remains unresolved.

Inspected on October 3, 2026 (America/New_York). The initial clean checkout matched GitHub main at `cd7c2676f39c4bf7bc4894db12920a61a3fbedff`. No specific runtime symptom was supplied; investigation covered static deployment, orbit refresh/history, tracker lifecycle/consent, and collector boundaries. This is a focused diagnosis, not an exhaustive security certification.

Verified observations:

- Existing baseline: 105 tests and the standard build passed, while `npm run audit:prod` reported seven vulnerable package entries.
- `.gitignore` excluded `.env.neocities`, although release documentation depended on that file to disable APIs for static builds. The local ignored file existed; a fresh clone did not receive it.
- `src/hooks/useNeocitiesFetch.ts` still contained a public CORS-proxy fallback in auto mode, contradicting the README.
- Two tracker flushes at 10 and 15 seconds persisted 25 seconds, two clicks, and two errors for a visit with 15 seconds, one click, and one error. SPA navigation persisted the same old-page engagement twice. Manual navigation omitted the old page's remote engagement event; repeat manual views of the same path discarded pending engagement.
- Optional totals polling and delayed performance callbacks could write without consent; lifecycle flushes could send after revocation. Explicit denial was ignored by implicit-consent mode.
- A successful orbit snapshot with unchanged totals could be deduplicated against an error entry, leaving the site marked failed.
- The collector copied raw device/session/navigation objects into its file, including user-agent and session ID, despite its documented aggregate-only contract.

### Root Cause

1. **Deployment contract depended on a missing local input.** Build mode did not enforce runtime capability, and the shared mode file was ignored. Auto mode then entered an external proxy path whenever health detection failed.
2. **Snapshots were consumed as increments.** `flushEngagement()` returned cumulative visit totals, and both local persistence and the collector added those totals on each flush. SPA routing flushed before calling `track()`, which flushed again. Manual and SPA transitions used different persistence paths.
3. **Permission was checked at pageview entry, not at side-effect boundaries.** Polling, response completion, deferred performance writes, error capture, and unload sends bypassed that check. Revocation changed status but left active listeners, polling, and old visit state intact.
4. **History deduplication ignored outcome state.** An error entry retained the old counters, making the next successful result appear identical. A matching timestamp also suppressed changed counters.
5. **Local diagnostic payloads crossed the remote boundary unchanged.** The tracker sent its rich local event object, and the collector stored the corresponding objects directly.

These causes are verified by source inspection and focused reproductions. The cause of upstream HTTP 502/non-JSON responses during live prefetch is unresolved; those responses establish failed freshness attempts, not a proven Neocities outage.

### Minimal Fix

Implemented in the working tree:

- `vite.config.ts` forces `VITE_RUNTIME_API="disabled"` for Neocities mode, including when ambient configuration enables APIs. `.gitignore` now permits the shared `.env.neocities` file.
- `src/runtime.ts`, `.env.example`, and `src/hooks/useNeocitiesFetch.ts` remove the public proxy configuration/path. Auto mode uses the Node batch when available and otherwise uses the same-origin cache. Complete cache loads use informational messaging; partial/retained results remain warnings.
- `src/services/neocities.ts` only deduplicates successful outcomes with equal totals/update metadata. Matching timestamps alone no longer suppress a changed result.
- `public/zya-imprint.js` checkpoints engagement/error counters and sends/persists only newly observed deltas. Manual, repeated-path, SPA, and lifecycle flows share the same flush path. Checkpoints advance before event emission to prevent reentrant double-flushes. Bounces are classified when a visit ends, rather than at an intermediate checkpoint. Error-only tracking also persists correctly.
- The tracker checks permission at persistence/network/async completion boundaries. Revocation clears visit state, removes engagement listeners, stops polling, and invalidates pending totals responses. Explicit denial applies in every consent mode.
- Remote events omit `device`, `session`, `sessionId`, `navigation`, and `fullReferrer`. The collector ignores those rich diagnostic fields from older clients and scrubs them from legacy files on startup, preserving page counts and aggregate history. Rich diagnostics remain available in local snapshots.
- `package-lock.json` contains compatible security updates. README and changelog describe the corrected behavior.

Blast-radius checks cover manual/SPA/repeated-path/unload flushes, cumulative `getEngagement()` behavior, errors without engagement tracking, explicit denial/regrant, pending async responses, mixed live/cache results, successful deduplication, legacy collector files, older tracker payloads, duplicate event IDs, unauthorized reads, and unconfigured origins.

Storage schema version 2, pageview/session counters, local diagnostic availability, imports/exports, and standard Node API configuration remain intact. The fix does not attempt to reconstruct inflated historical engagement, add a guaranteed delivery protocol, redesign the dashboard, or change public Neocities totals.

### Enhancement Opportunities

Ranked by expected engineering value; these are follow-up opportunities, not completed changes:

| Rank | Improvement | Effort | Value | Compounding Effect |
| --- | --- | --- | --- | --- |
| 1 | Validate collector counters and nested telemetry against explicit bounded schemas. | Small | Correctness, privacy, reliability. Numeric conversion and optional object storage still accept loosely shaped inputs. | Bad payloads fail at ingress rather than contaminating persisted aggregates and future imports. |
| 2 | Persist collector updates atomically and surface persistence failure before reporting durable acceptance. | Medium | Reliability, observability. Current HTTP 202 precedes queued file persistence, and write failures are logged. | Prevents acknowledged data loss and gives future retries a clear durable boundary. |
| 3 | Upgrade the development test runner to a patched supported Vitest release and validate project configuration. | Small | Security, maintainability. Full audit still flags Vitest and its mocker dependency. | Removes the remaining advisory chain and avoids carrying an unsupported runner into future work. |
| 4 | Preserve and display per-site retained-cache warnings alongside snapshot age. | Small | Observability, diagnosis. Prefetch captured HTTP 502 reasons for all 19 retained entries; the client parser currently drops those warning strings. | Distinguishes missing coverage, retained data, and upstream freshness failures at the point of use. |

The Vitest advisory identifies patched release 4.1.11: [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9). No major dependency upgrade was forced in this patch.

### Verification + Residual Risk

| Check | Status | Evidence |
| --- | --- | --- |
| TypeScript (`npm run lint`) | PASS | `tsc --noEmit`; this command is type checking, not a separate ESLint run. |
| Full tests (`npm test`) | PASS | 131/131 tests across 14 files; 26 added tests exercise the newly covered boundaries. |
| Standard Node dashboard build | PASS | `npm run check` completed including `vite build`. |
| Static build command | PASS / STALE DATA | `npm run build:neocities` completed with 19/19 usable snapshots: 0 refreshed, 19 retained, 0 unusable. |
| API-enabled ambient environment vs. static mode | PASS | Build configuration test and a static build with `VITE_RUNTIME_API=enabled` verify the forced disabled define. |
| Compiled static dashboard in Chromium | PASS | 1440px and 390px; each run made two same-origin cache requests, zero API/external requests, zero page/HTTP errors, and had no horizontal overflow. |
| Standalone tracker in Chromium | PASS | 15 seconds, one click, one error; stored snapshot unchanged after revocation and lifecycle flush. |
| Collector HTTP boundary | PASS | Legacy migration, older rich payload, event deduplication, read-token rejection, and origin rejection. |
| Production dependency audit | PASS | Zero known vulnerabilities reported by `npm run audit:prod`. |
| Full dependency audit | OPEN | Two moderate development-only entries: Vitest and `@vitest/mocker`. |
| Diff whitespace | PASS | `git diff --check`. |
| Remote CI/deployment and live Neocities freshness | NOT VERIFIED | No push or deployment; live prefetch returned HTTP 502/non-JSON responses. |

The final `dist/` is a Neocities-mode build. Its 19 retained entries preserve the original August 14, 2026 snapshot timestamps and are explicitly marked stale; the October 3 generation time is not a new observation time.

Residual limitations:

- Historical inflated engagement cannot be corrected without an independent source of truth.
- Consent revocation prevents future sends/persistence, but cannot recall a request already handed to the browser or erase copies already received elsewhere.
- Collector delivery remains best effort; lost events can leave remote totals incomplete. Exactly-once delivery, disk-failure recovery, and multi-process writer coordination were not established.
- Legacy diagnostic scrubbing changes collector files on startup and requires writable storage. Backups and external collectors are outside this migration.
- Browser coverage is Chromium only. Firefox, WebKit, and back/forward-cache restoration were not tested.
- This pass does not establish exhaustive verifier/SSRF, malformed-storage, accessibility, or security coverage. The client-side password gate is a UI gate, not server-side authorization; collector read protection was tested separately.

Changes are local and uncommitted. Deploy only after reviewing the patch and deciding whether the retained August 14 snapshots meet the desired freshness requirement.

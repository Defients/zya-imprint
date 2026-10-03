import { useCallback, useRef, useState } from "react";
import { MAX_SITE_HISTORY_POINTS, SITE_HISTORY_KEY } from "../constants";
import { apiUrl, corsProxyUrl, hasRuntimeApi, RUNTIME_API_MODE } from "../runtime";
import {
  cachedSite,
  failedNeocitiesResult,
  normalizeNeocitiesInfo,
  parseBatchPayload,
  parseNeocitiesCache,
  sameHistoryPoint,
  summarizeOrbitRefresh,
  type NeocitiesCacheFile,
  type NeocitiesSiteResult,
  type OrbitRefreshSummary
} from "../services/neocities";
import { fetchWithTimeout, formatRelativeTime, normalizeSiteId, safeParse } from "../utils";
import { useToast } from "../components/Toast";

const EMPTY_CACHE: NeocitiesCacheFile = {
  schemaVersion: 1,
  generatedAt: null,
  fetchedAt: null,
  complete: false,
  sites: []
};

function refreshMessage(summary: OrbitRefreshSummary) {
  const staleNote = summary.staleCount ? ` · ${summary.staleCount} retained snapshot${summary.staleCount === 1 ? "" : "s"}` : "";
  if (summary.source === "live-api" && summary.failed === 0) {
    return `Pulled all ${summary.succeeded} sites live${staleNote}.`;
  }
  if (summary.source === "mixed") {
    return `Pulled ${summary.liveCount} live; restored ${summary.cacheCount} from cache; ${summary.failed} failed${staleNote}.`;
  }
  if (summary.source === "static-cache") {
    const age = summary.timestamp ? ` · snapshot ${formatRelativeTime(summary.timestamp)}` : "";
    return `Loaded ${summary.succeeded}/${summary.requested} from the static cache${age}${staleNote}. No live API server detected — start the server for fresh data.`;
  }
  return `Orbit refresh failed for all ${summary.requested} sites.`;
}

export function useNeocitiesFetch(siteSettingsSites: string[], saveSiteHistoryStore: (store: any) => void) {
  const { toast } = useToast();
  const [siteRefreshInFlight, setSiteRefreshInFlight] = useState(false);
  const [lastRefreshSummary, setLastRefreshSummary] = useState<OrbitRefreshSummary | null>(null);
  const siteRefreshInFlightRef = useRef(false);

  const loadStaticCache = useCallback(async (): Promise<NeocitiesCacheFile> => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}neocities-cache.json`, { cache: "no-store" });
      if (!response.ok) return EMPTY_CACHE;
      return parseNeocitiesCache(await response.json());
    } catch {
      return EMPTY_CACHE;
    }
  }, []);

  const fetchLiveBatch = useCallback(async (sites: string[]): Promise<NeocitiesSiteResult[]> => {
    const fetchedAt = new Date().toISOString();
    const response = await fetchWithTimeout(
      apiUrl(`/api/neocities/batch?sites=${encodeURIComponent(sites.join(","))}`),
      20_000
    );
    if (!response.ok) throw new Error(`Runtime API returned HTTP ${response.status}`);
    const payload = await response.json();
    const parsed = parseBatchPayload(payload, fetchedAt);
    if (!parsed.length) throw new Error("Runtime API returned no Neocities results");
    return parsed;
  }, []);

  // Direct Neocities API calls through a CORS proxy, used when the runtime API
  // is unreachable. Per-site failures are swallowed so the caller can fall back
  // to the static cache for those sites. Returns only successful results.
  const fetchDirectBatch = useCallback(async (sites: string[]): Promise<NeocitiesSiteResult[]> => {
    const fetchedAt = new Date().toISOString();
    const settled = await Promise.all(
      sites.map(async (siteName): Promise<NeocitiesSiteResult | null> => {
        try {
          const target = `https://neocities.org/api/info?sitename=${encodeURIComponent(siteName)}`;
          const response = await fetchWithTimeout(`${corsProxyUrl}${encodeURIComponent(target)}`, 12_000);
          if (!response.ok) return null;
          const payload = await response.json().catch(() => null);
          if (!payload || payload.result !== "success" || !payload.info) return null;
          return normalizeNeocitiesInfo(siteName, payload.info, fetchedAt, "live-api");
        } catch {
          return null;
        }
      })
    );
    return settled.filter((result): result is NeocitiesSiteResult => result !== null);
  }, []);

  const refreshSiteWideStats = useCallback(async (customSites?: string[]): Promise<OrbitRefreshSummary | null> => {
    if (siteRefreshInFlightRef.current) return null;
    const list = [...new Set((customSites || siteSettingsSites).map((site) => normalizeSiteId(site, "")).filter(Boolean))];
    if (!list.length) {
      toast("Orbit list is empty.", "warning");
      return null;
    }

    siteRefreshInFlightRef.current = true;
    setSiteRefreshInFlight(true);

    try {
      const cachePromise = loadStaticCache();
      const runtimeAvailable = await hasRuntimeApi(true);
      const cache = await cachePromise;
      let liveResults: NeocitiesSiteResult[] = [];
      let liveFailure: string | null = null;
      let liveAttempted = false;

      if (runtimeAvailable) {
        liveAttempted = true;
        try {
          liveResults = await fetchLiveBatch(list);
        } catch (error) {
          liveFailure = error instanceof Error ? error.message : "Runtime API failed";
        }
      } else if (RUNTIME_API_MODE !== "disabled") {
        // No runtime server detected — try the Neocities API directly through a
        // CORS proxy before falling back to the static cache. Skipped in
        // `disabled` mode, which is meant to be cache-only with no CORS probes.
        liveAttempted = true;
        try {
          liveResults = await fetchDirectBatch(list);
        } catch (error) {
          liveFailure = error instanceof Error ? error.message : "Direct Neocities API failed";
        }
      }

      const liveBySite = new Map(liveResults.map((result) => [result.siteName, result]));
      const results = list.map((siteName): NeocitiesSiteResult => {
        const live = liveBySite.get(siteName);
        if (live && !live.error) return live;
        const cached = cachedSite(cache, siteName);
        if (cached) return cached;
        const reason = live?.error || liveFailure || (liveAttempted
          ? "No live result and no cached snapshot"
          : "Site is not present in the static build cache");
        return failedNeocitiesResult(siteName, reason, liveAttempted ? "live-api" : "static-cache");
      });

      const store = safeParse<any>(localStorage.getItem(SITE_HISTORY_KEY), { meta: { version: 2 }, sites: {} });
      let changed = false;
      results.forEach((result) => {
        const entries = Array.isArray(store.sites[result.siteName]) ? store.sites[result.siteName] : [];
        const latest = entries.at(-1);

        if (result.error) {
          if (latest?.error && latest?.timestamp === result.timestamp) return;
          entries.push({
            siteName: result.siteName,
            views: Number(latest?.views || 0),
            hits: Number(latest?.hits || 0),
            createdAt: latest?.createdAt || null,
            lastUpdated: latest?.lastUpdated || null,
            domain: latest?.domain || null,
            tags: Array.isArray(latest?.tags) ? latest.tags : [],
            error: result.error,
            timestamp: result.timestamp,
            source: result.source,
            stale: result.stale
          });
          store.sites[result.siteName] = entries.slice(-MAX_SITE_HISTORY_POINTS);
          changed = true;
          return;
        }

        if (sameHistoryPoint(latest, result)) return;
        entries.push({
          siteName: result.siteName,
          views: result.views,
          hits: result.hits,
          createdAt: result.createdAt,
          lastUpdated: result.lastUpdated,
          domain: result.domain,
          tags: result.tags,
          error: null,
          timestamp: result.timestamp,
          source: result.source,
          stale: result.stale
        });
        store.sites[result.siteName] = entries.slice(-MAX_SITE_HISTORY_POINTS);
        changed = true;
      });
      if (changed) {
        try {
          saveSiteHistoryStore(store);
        } catch (persistError) {
          toast(
            `Fetched OK but couldn't save history: ${persistError instanceof Error ? persistError.message : "storage quota exceeded"}.`,
            "warning"
          );
        }
      }

      const summary = summarizeOrbitRefresh(results);
      setLastRefreshSummary(summary);
      const toastLevel = summary.source === "static-cache"
        ? (summary.succeeded ? "warning" : "error")
        : summary.failed === 0 ? "success" : summary.succeeded ? "warning" : "error";
      toast(refreshMessage(summary), toastLevel);
      return summary;
    } catch (error) {
      toast(`Orbit refresh failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
      return null;
    } finally {
      siteRefreshInFlightRef.current = false;
      setSiteRefreshInFlight(false);
    }
  }, [siteSettingsSites, saveSiteHistoryStore, toast, loadStaticCache, fetchLiveBatch, fetchDirectBatch]);

  return { siteRefreshInFlight, lastRefreshSummary, refreshSiteWideStats };
}

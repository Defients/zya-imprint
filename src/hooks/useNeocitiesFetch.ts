import { useCallback, useRef, useState } from "react";
import { MAX_SITE_HISTORY_POINTS, SITE_HISTORY_KEY } from "../constants";
import { apiUrl, hasRuntimeApi } from "../runtime";
import {
  cachedSite,
  failedNeocitiesResult,
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
    return `Loaded ${summary.succeeded}/${summary.requested} from the static cache${age}${staleNote}. For fresh static totals, rebuild and redeploy.`;
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
        ? (summary.failed || summary.staleCount ? "warning" : "info")
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
  }, [siteSettingsSites, saveSiteHistoryStore, toast, loadStaticCache, fetchLiveBatch]);

  return { siteRefreshInFlight, lastRefreshSummary, refreshSiteWideStats };
}

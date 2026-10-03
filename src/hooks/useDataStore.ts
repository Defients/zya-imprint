import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_REFRESH_KEY,
  COLLECTOR_CACHE_KEY,
  DASHBOARD_ARCHIVE_KEY,
  DEFAULT_SITE_LIST,
  LEGACY_PAGE_STORAGE_KEYS,
  LEGACY_SITE_HISTORY_KEY,
  SITE_HISTORY_KEY,
  SITE_SETTINGS_KEY,
  TRACKER_STORAGE_V2
} from "../constants";
import type { PageRecord, PageSource, SiteRecord } from "../types";
import {
  mergeSnapshot,
  normalizePath,
  normalizeSiteId,
  pageKey,
  safeParse,
  safeSetItem
} from "../utils";

interface PageStore {
  meta?: Record<string, any>;
  pages?: Record<string, any>;
}

function normalizePage(meta: Record<string, any>, rawKey: string, rawPage: any, source: PageSource): PageRecord {
  const origin = String(rawPage?.origin || meta?.origin || meta?.siteOrigin || "");
  let fallbackSite = "unknown-site";
  try { fallbackSite = origin ? new URL(origin).hostname : window.location.hostname; } catch {}
  const siteId = normalizeSiteId(rawPage?.siteId || meta?.siteId || fallbackSite);
  const path = normalizePath(rawPage?.path || rawKey || "/");
  const daily: Record<string, number> = {};

  Object.entries(rawPage?.daily || {}).forEach(([day, value]: [string, any]) => {
    daily[day] = typeof value === "number" ? Number(value || 0) : Number(value?.views || 0);
  });

  return {
    key: pageKey(siteId, path),
    siteId,
    origin,
    path,
    title: String(rawPage?.title || path),
    label: String(rawPage?.label || ""),
    views: Number(rawPage?.totalViews != null ? rawPage.totalViews : rawPage?.views || 0),
    uniqueSessions: Array.isArray(rawPage?.uniqueSessions)
      ? rawPage.uniqueSessions.length
      : Number(rawPage?.uniqueSessions || 0),
    firstSeen: rawPage?.firstSeen || meta?.createdAt || null,
    lastSeen: rawPage?.lastSeen || meta?.updatedAt || null,
    lastReferrer: String(rawPage?.lastReferrer || rawPage?.referrer || ""),
    daily,
    source,
    totalTimeOnPage: Number(rawPage?.totalTimeOnPage || 0) || undefined,
    maxScrollPercent: Number(rawPage?.maxScrollPercent || 0) || undefined,
    scrollMilestones: Array.isArray(rawPage?.scrollMilestones) ? rawPage.scrollMilestones : undefined,
    bounces: Number(rawPage?.bounces || 0) || undefined,
    returnVisits: Number(rawPage?.returnVisits || 0) || undefined,
    clickCount: Number(rawPage?.clickCount || 0) || undefined,
    interactionCount: Number(rawPage?.interactionCount || 0) || undefined,
    jsErrors: Number(rawPage?.jsErrors || 0) || undefined,
    lastError: rawPage?.lastError || undefined,
    device: rawPage?.device || undefined,
    performance: rawPage?.performance || undefined,
    navigation: rawPage?.navigation || undefined,
    session: rawPage?.session || undefined,
    neocities: rawPage?.neocities || undefined
  };
}

function pagesFromStore(store: PageStore | null, source: PageSource): PageRecord[] {
  if (!store || typeof store !== "object" || !store.pages) return [];
  return Object.entries(store.pages).map(([key, page]) => normalizePage(store.meta || {}, key, page, source));
}

function pagesFromCollector(summary: any): PageRecord[] {
  const results: PageRecord[] = [];
  Object.entries(summary?.sites || {}).forEach(([siteId, site]: [string, any]) => {
    Object.entries(site?.pages || {}).forEach(([path, page]: [string, any]) => {
      results.push(normalizePage(
        { siteId, origin: site?.origin || "", createdAt: summary?.meta?.createdAt, updatedAt: summary?.meta?.updatedAt },
        path,
        page,
        "collector"
      ));
    });
  });
  return results;
}

function mergeRecords(records: PageRecord[]) {
  const map = new Map<string, PageRecord>();
  records.forEach((record) => map.set(record.key, mergeSnapshot(map.get(record.key), record)));
  return Array.from(map.values()).sort((a, b) => {
    const byRecent = new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime();
    return byRecent || b.views - a.views || a.key.localeCompare(b.key);
  });
}

export function useDataStore() {
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [siteSettings, setSiteSettings] = useState<{ sites: string[] }>({ sites: DEFAULT_SITE_LIST });
  const lastRawSnapshot = useRef<string>("");

  const loadData = useCallback(() => {
    const keys = [
      TRACKER_STORAGE_V2, ...LEGACY_PAGE_STORAGE_KEYS, DASHBOARD_ARCHIVE_KEY,
      COLLECTOR_CACHE_KEY, SITE_HISTORY_KEY, LEGACY_SITE_HISTORY_KEY, SITE_SETTINGS_KEY
    ];
    const rawSnapshot = keys.map((k) => localStorage.getItem(k) || "").join("\u0000");
    if (rawSnapshot === lastRawSnapshot.current) return;
    lastRawSnapshot.current = rawSnapshot;

    const allPages: PageRecord[] = [];
    allPages.push(...pagesFromStore(safeParse<PageStore | null>(localStorage.getItem(TRACKER_STORAGE_V2), null), "local"));
    LEGACY_PAGE_STORAGE_KEYS.forEach((key) => {
      allPages.push(...pagesFromStore(safeParse<PageStore | null>(localStorage.getItem(key), null), "legacy"));
    });

    const archive = safeParse<PageStore | null>(localStorage.getItem(DASHBOARD_ARCHIVE_KEY), null);
    allPages.push(...pagesFromStore(archive, "import"));
    const collector = safeParse<PageStore | null>(localStorage.getItem(COLLECTOR_CACHE_KEY), null);
    allPages.push(...pagesFromStore(collector, "collector"));
    setPages(mergeRecords(allPages));

    const parsedSettings = safeParse<{ sites?: string[] }>(localStorage.getItem(SITE_SETTINGS_KEY), {});
    const candidateSites = Array.isArray(parsedSettings.sites) && parsedSettings.sites.length ? parsedSettings.sites : DEFAULT_SITE_LIST;
    const normalizedList = [...new Set(candidateSites.map((site) => normalizeSiteId(site, "")).filter(Boolean))];
    setSiteSettings({ sites: normalizedList });

    const history = safeParse<any>(
      localStorage.getItem(SITE_HISTORY_KEY) || localStorage.getItem(LEGACY_SITE_HISTORY_KEY),
      { meta: { version: 2, updatedAt: null }, sites: {} }
    );

    const normalizedSites: SiteRecord[] = normalizedList.map((siteName) => {
      const rawEntries = Array.isArray(history?.sites?.[siteName]) ? history.sites[siteName] : [];
      const entries = rawEntries.filter((e: any) => !e.error);
      const latestRaw = rawEntries.at(-1) || {};
      const latest = entries.at(-1) || {};
      const previous = entries.length > 1 ? entries.at(-2) : null;
      const views = Number(latest.views || 0);
      const hits = Number(latest.hits || 0);
      const previousViews = Number(previous?.views || 0);
      const previousHits = Number(previous?.hits || 0);
      return {
        siteName,
        views,
        hits,
        deltaViews: previous ? views - previousViews : 0,
        deltaHits: previous ? hits - previousHits : 0,
        growthRate: previousViews > 0 ? ((views - previousViews) / previousViews) * 100 : 0,
        lastUpdated: latest.lastUpdated || null,
        createdAt: latest.createdAt || null,
        domain: latest.domain || null,
        tags: Array.isArray(latest.tags) ? latest.tags : [],
        lastRefreshAt: latestRaw.timestamp || latest.timestamp || null,
        error: latestRaw.error || (entries.length ? null : "Not fetched yet"),
        history: entries
      };
    });
    setSites(normalizedSites);
  }, []);

  useEffect(() => loadData(), [loadData]);

  useEffect(() => {
    const trackedKeys = [
      TRACKER_STORAGE_V2, ...LEGACY_PAGE_STORAGE_KEYS, DASHBOARD_ARCHIVE_KEY,
      COLLECTOR_CACHE_KEY, SITE_HISTORY_KEY, LEGACY_SITE_HISTORY_KEY, SITE_SETTINGS_KEY, AUTO_REFRESH_KEY
    ];
    const onStorage = (e: StorageEvent) => {
      if (!e.key || trackedKeys.includes(e.key)) loadData();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadData]);

  const saveSiteSettings = useCallback((settings: { sites: string[] }) => {
    const normalized = [...new Set((settings.sites || []).map((site) => normalizeSiteId(site, "")).filter(Boolean))];
    safeSetItem(SITE_SETTINGS_KEY, JSON.stringify({ sites: normalized }));
    loadData();
  }, [loadData]);

  const saveSiteHistoryStore = useCallback((store: any) => {
    store.meta = { ...(store.meta || {}), version: 2, updatedAt: new Date().toISOString() };
    safeSetItem(SITE_HISTORY_KEY, JSON.stringify(store));
    loadData();
  }, [loadData]);

  const clearSiteHistory = useCallback(() => {
    localStorage.removeItem(SITE_HISTORY_KEY);
    localStorage.removeItem(LEGACY_SITE_HISTORY_KEY);
    loadData();
  }, [loadData]);

  const clearPages = useCallback(() => {
    localStorage.removeItem(TRACKER_STORAGE_V2);
    localStorage.removeItem(DASHBOARD_ARCHIVE_KEY);
    localStorage.removeItem(COLLECTOR_CACHE_KEY);
    LEGACY_PAGE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    loadData();
  }, [loadData]);

  const removePage = useCallback((key: string) => {
    [TRACKER_STORAGE_V2, DASHBOARD_ARCHIVE_KEY, COLLECTOR_CACHE_KEY].forEach((storageKey) => {
      const store = safeParse<PageStore>(localStorage.getItem(storageKey), { meta: {}, pages: {} });
      if (!store.pages) return;
      delete store.pages[key];
      safeSetItem(storageKey, JSON.stringify(store));
    });
    loadData();
  }, [loadData]);

  const writeSnapshotStore = useCallback((storageKey: string, records: PageRecord[], sourceLabel: string) => {
    const current = safeParse<PageStore>(localStorage.getItem(storageKey), { meta: {}, pages: {} });
    const existing = pagesFromStore(current, sourceLabel === "collector" ? "collector" : "import");
    const merged = mergeRecords([...existing, ...records]);
    const next: PageStore = {
      meta: {
        version: 2,
        source: sourceLabel,
        createdAt: current.meta?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      pages: {}
    };
    merged.forEach((record) => { next.pages![record.key] = record; });
    safeSetItem(storageKey, JSON.stringify(next));
    loadData();
    return merged.length;
  }, [loadData]);

  const importBundle = useCallback((payload: any) => {
    const records: PageRecord[] = [];
    const candidates = [payload?.pageStore, payload?.trackerStore, payload];
    candidates.forEach((candidate) => {
      if (candidate?.pages && !Array.isArray(candidate.pages)) records.push(...pagesFromStore(candidate, "import"));
      if (Array.isArray(candidate?.pages)) {
        candidate.pages.forEach((page: any) => records.push(normalizePage(candidate.meta || {}, page.key || page.path, page, "import")));
      }
    });
    if (payload?.sites && !payload?.pages) records.push(...pagesFromCollector(payload));

    const deduped = mergeRecords(records);
    if (!deduped.length) throw new Error("No compatible ZYA Imprint page records found.");
    writeSnapshotStore(DASHBOARD_ARCHIVE_KEY, deduped, "import");

    if (payload?.siteHistory?.sites) {
      safeSetItem(SITE_HISTORY_KEY, JSON.stringify(payload.siteHistory));
    }
    if (Array.isArray(payload?.siteSettings?.sites)) {
      safeSetItem(SITE_SETTINGS_KEY, JSON.stringify({ sites: payload.siteSettings.sites }));
    }
    loadData();
    return deduped.length;
  }, [loadData, writeSnapshotStore]);

  const mergeCollectorSummary = useCallback((summary: any) => {
    const records = pagesFromCollector(summary);
    if (!records.length) throw new Error("Collector returned no page records.");
    writeSnapshotStore(COLLECTOR_CACHE_KEY, records, "collector");
    return records.length;
  }, [writeSnapshotStore]);

  const addManualPage = useCallback((page: Partial<PageRecord>) => {
    const record = normalizePage(
      { siteId: page.siteId, origin: page.origin },
      page.path || "/",
      { ...page, views: page.views || 0, uniqueSessions: page.uniqueSessions || 0, daily: page.daily || {} },
      "manual"
    );
    writeSnapshotStore(DASHBOARD_ARCHIVE_KEY, [record], "import");
    return record;
  }, [writeSnapshotStore]);

  const getExportBundle = useCallback(() => ({
    format: "zya-imprint-dashboard-bundle",
    version: 2,
    exportedAt: new Date().toISOString(),
    pages,
    siteHistory: safeParse(localStorage.getItem(SITE_HISTORY_KEY), {}),
    siteSettings
  }), [pages, siteSettings]);

  return {
    pages,
    sites,
    siteSettings,
    loadData,
    saveSiteSettings,
    saveSiteHistoryStore,
    clearSiteHistory,
    clearPages,
    removePage,
    importBundle,
    mergeCollectorSummary,
    addManualPage,
    getExportBundle
  };
}

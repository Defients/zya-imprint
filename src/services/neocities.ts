export type NeocitiesDataSource = "live-api" | "static-cache";

export interface NeocitiesSiteResult {
  siteName: string;
  views: number;
  hits: number;
  createdAt: string | null;
  lastUpdated: string | null;
  domain: string | null;
  tags: string[];
  error: string | null;
  timestamp: string;
  source: NeocitiesDataSource;
  stale: boolean;
}

export interface NeocitiesCacheFile {
  schemaVersion: number;
  generatedAt: string | null;
  fetchedAt: string | null;
  complete: boolean;
  sites: NeocitiesSiteResult[];
}

export interface OrbitRefreshSummary {
  requested: number;
  succeeded: number;
  failed: number;
  liveCount: number;
  cacheCount: number;
  staleCount: number;
  timestamp: string | null;
  source: "live-api" | "static-cache" | "mixed" | "none";
  errors: Array<{ siteName: string; error: string }>;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asTimestamp(value: unknown, fallback: string) {
  const candidate = asNullableString(value);
  if (!candidate) return fallback;
  return Number.isNaN(new Date(candidate).getTime()) ? fallback : candidate;
}

function asTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
    : [];
}

export function normalizeNeocitiesInfo(
  siteName: string,
  info: Record<string, unknown>,
  timestamp: string,
  source: NeocitiesDataSource,
  stale = false
): NeocitiesSiteResult {
  return {
    siteName,
    views: Number(info.views || 0),
    hits: Number(info.hits || 0),
    createdAt: asNullableString(info.created_at ?? info.createdAt),
    lastUpdated: asNullableString(info.last_updated ?? info.lastUpdated),
    domain: asNullableString(info.domain),
    tags: asTags(info.tags),
    error: null,
    timestamp,
    source,
    stale
  };
}

export function failedNeocitiesResult(
  siteName: string,
  error: string,
  source: NeocitiesDataSource,
  timestamp = new Date().toISOString()
): NeocitiesSiteResult {
  return {
    siteName,
    views: 0,
    hits: 0,
    createdAt: null,
    lastUpdated: null,
    domain: null,
    tags: [],
    error,
    timestamp,
    source,
    stale: false
  };
}

export function parseNeocitiesCache(payload: unknown): NeocitiesCacheFile {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const fallbackTimestamp = new Date().toISOString();
  const generatedAt = asNullableString(raw.generatedAt) || asNullableString(raw.fetchedAt);
  const fetchedAt = asNullableString(raw.fetchedAt) || generatedAt;
  const rawSites = Array.isArray(raw.sites) ? raw.sites : [];

  const sites = rawSites
    .filter((site): site is Record<string, unknown> => Boolean(site) && typeof site === "object")
    .map((site) => {
      const siteName = String(site.siteName || "").trim().toLowerCase();
      const timestamp = asTimestamp(site.timestamp, fetchedAt || generatedAt || fallbackTimestamp);
      const error = asNullableString(site.error);
      if (!siteName) return null;
      if (error) return failedNeocitiesResult(siteName, error, "static-cache", timestamp);
      return {
        siteName,
        views: Number(site.views || 0),
        hits: Number(site.hits || 0),
        createdAt: asNullableString(site.createdAt ?? site.created_at),
        lastUpdated: asNullableString(site.lastUpdated ?? site.last_updated),
        domain: asNullableString(site.domain),
        tags: asTags(site.tags),
        error: null,
        timestamp,
        source: "static-cache" as const,
        stale: site.stale === true
      };
    })
    .filter((site): site is NeocitiesSiteResult => Boolean(site));

  return {
    schemaVersion: Number(raw.schemaVersion || 1),
    generatedAt,
    fetchedAt,
    complete: raw.complete === true || sites.every((site) => !site.error),
    sites
  };
}

export function cachedSite(cache: NeocitiesCacheFile, siteName: string): NeocitiesSiteResult | null {
  return cache.sites.find((site) => site.siteName === siteName && !site.error) || null;
}

export function parseBatchPayload(payload: unknown, fallbackTimestamp: string): NeocitiesSiteResult[] {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const timestamp = asTimestamp(raw.fetchedAt, fallbackTimestamp);
  if (!Array.isArray(raw.sites)) return [];

  return raw.sites
    .filter((site): site is Record<string, unknown> => Boolean(site) && typeof site === "object")
    .map((site) => {
      const siteName = String(site.siteName || "").trim().toLowerCase();
      if (!siteName) return null;
      const error = asNullableString(site.error);
      if (error) return failedNeocitiesResult(siteName, error, "live-api", timestamp);
      return normalizeNeocitiesInfo(siteName, site, timestamp, "live-api");
    })
    .filter((site): site is NeocitiesSiteResult => Boolean(site));
}

export function summarizeOrbitRefresh(results: NeocitiesSiteResult[]): OrbitRefreshSummary {
  const succeededResults = results.filter((result) => !result.error);
  const liveCount = succeededResults.filter((result) => result.source === "live-api").length;
  const cacheCount = succeededResults.filter((result) => result.source === "static-cache").length;
  const timestamps = succeededResults
    .map((result) => new Date(result.timestamp).getTime())
    .filter((value) => Number.isFinite(value));

  return {
    requested: results.length,
    succeeded: succeededResults.length,
    failed: results.length - succeededResults.length,
    liveCount,
    cacheCount,
    staleCount: succeededResults.filter((result) => result.stale).length,
    timestamp: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    source: liveCount && cacheCount ? "mixed" : liveCount ? "live-api" : cacheCount ? "static-cache" : "none",
    errors: results
      .filter((result) => result.error)
      .map((result) => ({ siteName: result.siteName, error: result.error || "Unknown error" }))
  };
}

export function sameHistoryPoint(
  existing: { timestamp?: string; views?: number; hits?: number; lastUpdated?: string | null; error?: string | null } | undefined,
  incoming: NeocitiesSiteResult
) {
  if (!existing || existing.error) return false;
  return Number(existing.views || 0) === incoming.views
      && Number(existing.hits || 0) === incoming.hits
      && (existing.lastUpdated || null) === incoming.lastUpdated;
}

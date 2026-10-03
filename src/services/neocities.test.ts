import { describe, expect, it } from "vitest";
import {
  cachedSite,
  normalizeNeocitiesInfo,
  parseBatchPayload,
  parseNeocitiesCache,
  sameHistoryPoint,
  summarizeOrbitRefresh
} from "./neocities";

describe("parseNeocitiesCache", () => {
  it("normalizes the v1 cache shape used by existing deployments", () => {
    const cache = parseNeocitiesCache({
      fetchedAt: "2026-07-15T19:45:21.643Z",
      sites: [{
        siteName: "deffy",
        views: 10,
        hits: 20,
        createdAt: "created",
        lastUpdated: "updated",
        domain: "deffy.me",
        tags: ["personal"],
        error: null
      }]
    });

    expect(cache.complete).toBe(true);
    expect(cachedSite(cache, "deffy")).toMatchObject({
      siteName: "deffy",
      views: 10,
      hits: 20,
      source: "static-cache",
      timestamp: "2026-07-15T19:45:21.643Z"
    });
  });

  it("keeps retained snapshots marked stale", () => {
    const cache = parseNeocitiesCache({
      schemaVersion: 2,
      generatedAt: "2026-07-15T20:00:00.000Z",
      sites: [{ siteName: "phexotial", views: 5, hits: 8, stale: true, timestamp: "2026-07-14T20:00:00.000Z" }]
    });
    expect(cachedSite(cache, "phexotial")?.stale).toBe(true);
  });
});

describe("parseBatchPayload", () => {
  it("parses successful and failed results without losing site identity", () => {
    const results = parseBatchPayload({
      fetchedAt: "2026-07-15T20:00:00.000Z",
      sites: [
        { siteName: "deffy", views: 10, hits: 20, lastUpdated: "updated", error: null },
        { siteName: "missing", error: "Lookup failed" }
      ]
    }, "fallback");

    expect(results[0]).toMatchObject({ siteName: "deffy", source: "live-api", error: null });
    expect(results[1]).toMatchObject({ siteName: "missing", source: "live-api", error: "Lookup failed" });
  });
});

describe("orbit refresh summaries", () => {
  it("reports mixed live/cache refreshes accurately", () => {
    const live = normalizeNeocitiesInfo("deffy", { views: 10, hits: 20 }, "2026-07-15T20:00:00.000Z", "live-api");
    const cached = normalizeNeocitiesInfo("phexotial", { views: 5, hits: 8 }, "2026-07-15T19:00:00.000Z", "static-cache", true);
    const summary = summarizeOrbitRefresh([live, cached]);

    expect(summary).toMatchObject({
      requested: 2,
      succeeded: 2,
      failed: 0,
      liveCount: 1,
      cacheCount: 1,
      staleCount: 1,
      source: "mixed"
    });
  });

  it("deduplicates identical history points", () => {
    const incoming = normalizeNeocitiesInfo("deffy", { views: 10, hits: 20, last_updated: "updated" }, "2026-07-15T20:00:00.000Z", "static-cache");
    expect(sameHistoryPoint({ timestamp: incoming.timestamp, views: 1, hits: 2 }, incoming)).toBe(false);
    expect(sameHistoryPoint({ timestamp: "older", views: 10, hits: 20, lastUpdated: "updated" }, incoming)).toBe(true);
    expect(sameHistoryPoint({ timestamp: "older", views: 11, hits: 20, lastUpdated: "updated" }, incoming)).toBe(false);
  });
});

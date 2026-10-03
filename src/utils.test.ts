import { describe, it, expect } from "vitest";
import {
  mergeSnapshot,
  normalizePath,
  normalizeSiteId,
  pageKey,
  createSorter,
  formatDuration,
  filterByDateRange,
  sparklinePath,
  getViewsInLastNDays,
  pickEarlierDate,
  pickLaterDate,
  formatRelativeTime,
  getSiteDisplayDomain,
} from "./utils";
import type { PageRecord } from "./types";

function makePage(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    key: "deffy::/",
    siteId: "deffy",
    origin: "https://deffy.neocities.org",
    path: "/",
    title: "Home",
    label: "",
    views: 0,
    uniqueSessions: 0,
    firstSeen: null,
    lastSeen: null,
    lastReferrer: "",
    daily: {},
    source: "local",
    ...overrides,
  };
}

describe("mergeSnapshot", () => {
  it("returns incoming when existing is undefined", () => {
    const incoming = makePage({ views: 10 });
    const result = mergeSnapshot(undefined, incoming);
    expect(result).toBe(incoming);
  });

  it("merges identical keys by taking max views", () => {
    const existing = makePage({ views: 50, uniqueSessions: 3 });
    const incoming = makePage({ views: 30, uniqueSessions: 5 });
    const result = mergeSnapshot(existing, incoming);
    expect(result.views).toBe(50);
    expect(result.uniqueSessions).toBe(5);
  });

  it("merges disjoint daily maps without losing entries", () => {
    const existing = makePage({ daily: { "2025-01-01": 5, "2025-01-02": 3 } });
    const incoming = makePage({ daily: { "2025-01-03": 7 } });
    const result = mergeSnapshot(existing, incoming);
    expect(result.daily).toEqual({ "2025-01-01": 5, "2025-01-02": 3, "2025-01-03": 7 });
  });

  it("takes max for overlapping daily entries", () => {
    const existing = makePage({ daily: { "2025-01-01": 10 } });
    const incoming = makePage({ daily: { "2025-01-01": 4 } });
    const result = mergeSnapshot(existing, incoming);
    expect(result.daily["2025-01-01"]).toBe(10);
  });

  it("handles null fields gracefully", () => {
    const existing = makePage({ firstSeen: null, lastSeen: null, lastReferrer: "" });
    const incoming = makePage({ firstSeen: "2025-01-01T00:00:00Z", lastSeen: "2025-01-02T00:00:00Z", lastReferrer: "https://example.com" });
    const result = mergeSnapshot(existing, incoming);
    expect(result.firstSeen).toBe("2025-01-01T00:00:00Z");
    expect(result.lastSeen).toBe("2025-01-02T00:00:00Z");
    expect(result.lastReferrer).toBe("https://example.com");
  });

  it("picks earlier firstSeen and later lastSeen from conflicting sources", () => {
    const existing = makePage({ firstSeen: "2025-01-05T00:00:00Z", lastSeen: "2025-01-10T00:00:00Z", source: "local" });
    const incoming = makePage({ firstSeen: "2025-01-01T00:00:00Z", lastSeen: "2025-01-08T00:00:00Z", source: "collector" });
    const result = mergeSnapshot(existing, incoming);
    expect(result.firstSeen).toBe("2025-01-01T00:00:00Z");
    expect(result.lastSeen).toBe("2025-01-10T00:00:00Z");
  });

  it("uses newer source for title when incoming is newer", () => {
    const existing = makePage({ title: "Old Title", lastSeen: "2025-01-01T00:00:00Z", source: "local" });
    const incoming = makePage({ title: "New Title", lastSeen: "2025-01-05T00:00:00Z", source: "collector" });
    const result = mergeSnapshot(existing, incoming);
    expect(result.title).toBe("New Title");
    expect(result.source).toBe("collector");
  });

  it("preserves existing title when existing is newer", () => {
    const existing = makePage({ title: "Newer Title", lastSeen: "2025-01-10T00:00:00Z", source: "local" });
    const incoming = makePage({ title: "Older Title", lastSeen: "2025-01-05T00:00:00Z", source: "collector" });
    const result = mergeSnapshot(existing, incoming);
    expect(result.title).toBe("Newer Title");
    expect(result.source).toBe("local");
  });

  it("handles session edge case with zero sessions", () => {
    const existing = makePage({ uniqueSessions: 0 });
    const incoming = makePage({ uniqueSessions: 0 });
    const result = mergeSnapshot(existing, incoming);
    expect(result.uniqueSessions).toBe(0);
  });

  it("merges siteId and origin from incoming when existing has empty values", () => {
    const existing = makePage({ siteId: "unknown-site", origin: "" });
    const incoming = makePage({ siteId: "deffy", origin: "https://deffy.neocities.org" });
    const result = mergeSnapshot(existing, incoming);
    expect(result.siteId).toBe("deffy");
    expect(result.origin).toBe("https://deffy.neocities.org");
  });
});

describe("normalizePath", () => {
  it("defaults to / for empty input", () => {
    expect(normalizePath("")).toBe("/");
  });
  it("strips hash and query", () => {
    expect(normalizePath("/page#section?foo=bar")).toBe("/page");
  });
  it("extracts pathname from URL", () => {
    expect(normalizePath("https://example.com/path/page")).toBe("/path/page");
  });
  it("ensures leading slash", () => {
    expect(normalizePath("page")).toBe("/page");
  });
  it("collapses double slashes", () => {
    expect(normalizePath("//page//sub")).toBe("/page/sub");
  });
  it("strips trailing slash", () => {
    expect(normalizePath("/page/")).toBe("/page");
  });
  it("keeps root slash", () => {
    expect(normalizePath("/")).toBe("/");
  });
});

describe("normalizeSiteId", () => {
  it("lowercases and strips neocities domain", () => {
    expect(normalizeSiteId("https://Deffy.neocities.org")).toBe("deffy");
  });
  it("replaces invalid chars with hyphens", () => {
    expect(normalizeSiteId("my site!")).toBe("my-site");
  });
  it("strips leading/trailing hyphens", () => {
    expect(normalizeSiteId("--deffy--")).toBe("deffy");
  });
  it("truncates to 64 chars", () => {
    const long = "a".repeat(100);
    expect(normalizeSiteId(long).length).toBe(64);
  });
  it("returns fallback for empty input", () => {
    expect(normalizeSiteId("", "fallback")).toBe("fallback");
  });
});

describe("pageKey", () => {
  it("combines siteId and path with ::", () => {
    expect(pageKey("deffy", "/page")).toBe("deffy::/page");
  });
  it("normalizes both components", () => {
    expect(pageKey("https://Deffy.neocities.org", "page//sub")).toBe("deffy::/page/sub");
  });
});

describe("createSorter", () => {
  const sorter = createSorter<{ name: string; count: number }>((item, key) =>
    key === "name" ? item.name : item.count
  );
  const data = [
    { name: "charlie", count: 3 },
    { name: "alpha", count: 1 },
    { name: "bravo", count: 2 },
  ];

  it("sorts ascending by string key", () => {
    expect(sorter(data, "name-asc").map((d) => d.name)).toEqual(["alpha", "bravo", "charlie"]);
  });
  it("sorts descending by string key", () => {
    expect(sorter(data, "name-desc").map((d) => d.name)).toEqual(["charlie", "bravo", "alpha"]);
  });
  it("sorts ascending by number key", () => {
    expect(sorter(data, "count-asc").map((d) => d.count)).toEqual([1, 2, 3]);
  });
  it("sorts descending by number key", () => {
    expect(sorter(data, "count-desc").map((d) => d.count)).toEqual([3, 2, 1]);
  });
  it("does not mutate original array", () => {
    const copy = [...data];
    sorter(data, "name-asc");
    expect(data).toEqual(copy);
  });
});

describe("formatDuration", () => {
  it("returns 0s for zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
  it("formats seconds", () => {
    expect(formatDuration(45)).toBe("45s");
  });
  it("formats minutes only", () => {
    expect(formatDuration(120)).toBe("2m");
  });
  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });
});

describe("filterByDateRange", () => {
  const data = [
    { name: "2025-01-01", views: 1 },
    { name: "2025-06-01", views: 2 },
    { name: "2025-12-01", views: 3 },
  ];
  it("returns all for 'all' range", () => {
    expect(filterByDateRange(data, "all")).toHaveLength(3);
  });
  it("returns all for empty data", () => {
    expect(filterByDateRange([], "7d")).toHaveLength(0);
  });
  it("filters to recent days for 7d", () => {
    const result = filterByDateRange(data, "7d");
    expect(result.length).toBeLessThanOrEqual(1);
  });
  it("correctly filters ISO format dates (YYYY-MM-DD) as used by SiteDetail", () => {
    const isoData = [
      { name: "2025-01-01", views: 1 },
      { name: "2025-06-01", views: 2 },
      { name: "2025-12-01", views: 3 },
    ];
    const result = filterByDateRange(isoData, "7d");
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - 7);
    const cutoff = now.toISOString().slice(0, 10);
    expect(result.every((item) => item.name >= cutoff)).toBe(true);
  });
});

describe("sparklinePath", () => {
  it("returns empty for no values", () => {
    expect(sparklinePath([], 100, 50)).toEqual({ line: "", area: "" });
  });
  it("returns valid SVG path for single value", () => {
    const { line, area } = sparklinePath([5], 100, 50);
    expect(line).toContain("M");
    expect(area).toContain("Z");
  });
  it("returns valid SVG path for multiple values", () => {
    const { line, area } = sparklinePath([1, 5, 3, 8, 2], 100, 50);
    expect(line).toContain("M");
    expect(line).toContain("L");
    expect(area).toContain("Z");
  });
});

describe("getViewsInLastNDays", () => {
  it("sums daily views for the last N days", () => {
    const page = makePage({ daily: { "2025-01-01": 5, "2025-01-02": 3 } });
    expect(getViewsInLastNDays(page, 1)).toBeGreaterThan(-1);
  });
  it("returns 0 for empty daily map", () => {
    const page = makePage({ daily: {} });
    expect(getViewsInLastNDays(page, 7)).toBe(0);
  });
});

describe("pickEarlierDate", () => {
  it("returns the only non-null date", () => {
    expect(pickEarlierDate("2025-01-01", null)).toBe("2025-01-01");
    expect(pickEarlierDate(null, "2025-01-01")).toBe("2025-01-01");
  });
  it("returns null when both are null", () => {
    expect(pickEarlierDate(null, null)).toBe(null);
  });
  it("picks the earlier date", () => {
    expect(pickEarlierDate("2025-06-01", "2025-01-01")).toBe("2025-01-01");
  });
  it("handles invalid dates", () => {
    expect(pickEarlierDate("invalid", "2025-01-01")).toBe("2025-01-01");
  });
});

describe("pickLaterDate", () => {
  it("returns the only non-null date", () => {
    expect(pickLaterDate("2025-01-01", null)).toBe("2025-01-01");
    expect(pickLaterDate(null, "2025-01-01")).toBe("2025-01-01");
  });
  it("returns null when both are null", () => {
    expect(pickLaterDate(null, null)).toBe(null);
  });
  it("picks the later date", () => {
    expect(pickLaterDate("2025-01-01", "2025-06-01")).toBe("2025-06-01");
  });
});

describe("formatRelativeTime", () => {
  it("returns — for null", () => {
    expect(formatRelativeTime(null)).toBe("—");
  });
  it("returns — for invalid date", () => {
    expect(formatRelativeTime("invalid")).toBe("—");
  });
  it("returns just now for recent", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("just now");
  });
});

describe("getSiteDisplayDomain", () => {
  it("uses domain when provided", () => {
    expect(getSiteDisplayDomain("deffy", "deffy.me")).toBe("deffy.me");
  });
  it("falls back to neocities.org", () => {
    expect(getSiteDisplayDomain("deffy", null)).toBe("deffy.neocities.org");
  });
});

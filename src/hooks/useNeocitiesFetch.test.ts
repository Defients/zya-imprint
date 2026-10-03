import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../runtime", () => ({
  apiUrl: (path: string) => `http://localhost:3000${path}`,
  hasRuntimeApi: vi.fn().mockResolvedValue(false),
  RUNTIME_API_MODE: "disabled",
}));

vi.mock("../components/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../utils", () => ({
  fetchWithTimeout: vi.fn(),
  formatRelativeTime: vi.fn(() => "recently"),
  normalizeSiteId: vi.fn((s: string) => s),
  safeParse: vi.fn((_v: string, d: any) => d),
}));

import { useNeocitiesFetch } from "./useNeocitiesFetch";
import { fetchWithTimeout } from "../utils";

const OLD_TIMESTAMP = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const CACHE_WITH_OLD_ENTRY = {
  schemaVersion: 2,
  generatedAt: OLD_TIMESTAMP,
  fetchedAt: OLD_TIMESTAMP,
  complete: true,
  sites: [
    {
      siteName: "deffy",
      views: 100,
      hits: 200,
      createdAt: "2020-01-01T00:00:00Z",
      lastUpdated: "2020-06-01T00:00:00Z",
      domain: "deffy.neocities.org",
      tags: [],
      error: null,
      stale: false,
      timestamp: OLD_TIMESTAMP,
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("{}", { status: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useNeocitiesFetch — static cache fallback (BUG-002)", () => {
  it("uses cached site results regardless of age when no live API is available", async () => {
    const saveHistory = vi.fn();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("neocities-cache.json")) {
        return Promise.resolve(
          new Response(JSON.stringify(CACHE_WITH_OLD_ENTRY), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as any;

    const { result } = renderHook(() =>
      useNeocitiesFetch(["deffy"], saveHistory)
    );

    let summary: any = null;
    await act(async () => {
      summary = await result.current.refreshSiteWideStats();
      vi.runAllTimersAsync?.();
    });

    expect(summary).not.toBeNull();
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.cacheCount).toBe(1);
  });
});

describe("useNeocitiesFetch — error entries persisted to history (BUG-006)", () => {
  it("writes error entries to history store when a site fails to fetch", async () => {
    const saveHistory = vi.fn();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("neocities-cache.json")) {
        return Promise.resolve(
          new Response(JSON.stringify({ schemaVersion: 2, sites: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as any;

    const { result } = renderHook(() =>
      useNeocitiesFetch(["unknown-site"], saveHistory)
    );

    let summary: any = null;
    await act(async () => {
      summary = await result.current.refreshSiteWideStats();
      vi.runAllTimersAsync?.();
    });

    expect(summary).not.toBeNull();
    expect(summary.failed).toBe(1);
    expect(saveHistory).toHaveBeenCalledTimes(1);

    const storeArg = saveHistory.mock.calls[0][0];
    const entry = storeArg.sites["unknown-site"]?.at(-1);
    expect(entry).toBeDefined();
    expect(entry.error).toBeTruthy();
    expect(entry.views).toBe(0);
  });
});

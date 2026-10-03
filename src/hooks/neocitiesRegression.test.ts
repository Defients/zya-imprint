import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SITE_HISTORY_KEY } from "../constants";

const runtime = vi.hoisted(() => ({ apiUrl: (path: string) => path, hasRuntimeApi: vi.fn(), RUNTIME_API_MODE: "auto", corsProxyUrl: "https://corsproxy.io/?url=" }));
vi.mock("../runtime", () => runtime);
const toast = vi.hoisted(() => vi.fn());
vi.mock("../components/Toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("../utils", async (importOriginal) => ({ ...await importOriginal<typeof import("../utils")>(), fetchWithTimeout: vi.fn() }));
import { useNeocitiesFetch } from "./useNeocitiesFetch";
import { fetchWithTimeout } from "../utils";

const timestamp = "2026-08-14T17:11:08.933Z";
const snapshot = { siteName: "deffy", views: 100, hits: 200, lastUpdated: "updated", timestamp };
const cache = { schemaVersion: 2, fetchedAt: timestamp, complete: true, sites: [snapshot] };
const response = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  runtime.hasRuntimeApi.mockResolvedValue(false);
  vi.mocked(fetchWithTimeout).mockRejectedValue(new Error("Unexpected API/proxy request"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(cache)));
});
afterEach(() => vi.unstubAllGlobals());

describe("orbit refresh boundaries", () => {
  it("uses an old static snapshot without contacting a public proxy in auto mode", async () => {
    const { result } = renderHook(() => useNeocitiesFetch(["deffy"], vi.fn()));
    await act(async () => { await result.current.refreshSiteWideStats(); });
    expect(result.current.lastRefreshSummary).toMatchObject({ succeeded: 1, cacheCount: 1, timestamp });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("neocities-cache.json"), { cache: "no-store" });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("rebuild and redeploy"), "info");
  });
  it("recovers a failed history entry when the same successful snapshot returns", async () => {
    localStorage.setItem(SITE_HISTORY_KEY, JSON.stringify({ sites: { deffy: [snapshot, { ...snapshot, timestamp: "2026-08-15T00:00:00Z", error: "Lookup failed" }] } }));
    const save = vi.fn();
    const { result } = renderHook(() => useNeocitiesFetch(["deffy"], save));
    await act(async () => { await result.current.refreshSiteWideStats(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].sites.deffy.at(-1)).toMatchObject({ error: null, views: 100 });
  });
  it("keeps duplicate successful snapshots out of history", async () => {
    localStorage.setItem(SITE_HISTORY_KEY, JSON.stringify({ sites: { deffy: [snapshot] } }));
    const save = vi.fn();
    const { result } = renderHook(() => useNeocitiesFetch(["deffy"], save));
    await act(async () => { await result.current.refreshSiteWideStats(); });
    expect(save).not.toHaveBeenCalled();
  });
  it("persists a missing site's error without discarding its last successful totals", async () => {
    localStorage.setItem(SITE_HISTORY_KEY, JSON.stringify({ sites: { missing: [{ ...snapshot, siteName: "missing" }] } }));
    const save = vi.fn();
    const { result } = renderHook(() => useNeocitiesFetch(["missing"], save));
    await act(async () => { await result.current.refreshSiteWideStats(); });
    expect(result.current.lastRefreshSummary).toMatchObject({ failed: 1 });
    expect(save.mock.calls[0][0].sites.missing.at(-1)).toMatchObject({ views: 100, hits: 200, error: expect.any(String) });
  });
  it("uses one runtime batch and falls back per site", async () => {
    runtime.hasRuntimeApi.mockResolvedValue(true);
    vi.mocked(fetchWithTimeout).mockResolvedValue(response({ fetchedAt: timestamp, sites: [{ siteName: "deffy", error: "Upstream unavailable" }, { siteName: "peerly", views: 5, hits: 10 }] }));
    const { result } = renderHook(() => useNeocitiesFetch(["deffy", "peerly"], vi.fn()));
    await act(async () => { await result.current.refreshSiteWideStats(); });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.lastRefreshSummary).toMatchObject({ source: "mixed", liveCount: 1, cacheCount: 1, failed: 0 });
  });
});

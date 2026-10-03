import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../public/zya-imprint.js", import.meta.url), "utf8");
const windows: JSDOM[] = [];
function tracker(config: Record<string, unknown> = {}, privacy = false) {
  const dom = new JSDOM("<!doctype html><title>Test</title>", { url: "https://example.com/start", runScripts: "outside-only", pretendToBeVisual: true });
  windows.push(dom);
  const win = dom.window;
  let now = Date.parse("2026-08-15T00:00:00Z");
  const timeouts: Array<() => void> = [];
  const intervals = new Map<number, () => void>();
  vi.spyOn(win.Date, "now").mockImplementation(() => now);
  Object.defineProperty(win.document, "readyState", { value: "complete" });
  Object.defineProperty(win.navigator, "globalPrivacyControl", { value: privacy, configurable: true });
  Object.defineProperty(win.performance, "getEntriesByType", { value: vi.fn(() => []) });
  win.setTimeout = ((fn: () => void) => { timeouts.push(fn); return timeouts.length; }) as any;
  win.setInterval = ((fn: () => void) => { const id = intervals.size + 1; intervals.set(id, fn); return id; }) as any;
  win.clearInterval = (id: number) => { intervals.delete(id); };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ info: { views: 10, hits: 20 } }) });
  Object.assign(win, { fetch, ZYA_IMPRINT: { siteId: "test", trackDevice: false, trackPerformance: false, ...config } });
  const events: any[] = [];
  win.addEventListener("zya:imprint:engagement", (event: any) => events.push(event.detail));
  win.eval(source);
  const api = (win as any).zyaImprint;
  return { win, api, fetch, events, intervals, advance: (ms: number) => { now += ms; }, runTimeouts: () => { timeouts.splice(0).forEach((fn) => fn()); }, page: (path = "/start") => api.getSnapshot().pages[path] };
}
afterEach(() => { windows.splice(0).forEach((dom) => dom.window.close()); vi.restoreAllMocks(); });

describe("standalone tracker accounting", () => {
  it("persists and sends only new engagement and errors on repeated flushes", () => {
    const t = tracker({ collector: "/api/imprint", consent: "implicit" });
    t.win.document.dispatchEvent(new t.win.MouseEvent("click", { bubbles: true }));
    t.win.dispatchEvent(new t.win.ErrorEvent("error", { message: "test error" }));
    t.advance(10_000); t.api.flushEngagement();
    t.advance(5_000); t.api.flushEngagement();
    expect(t.page()).toMatchObject({ totalTimeOnPage: 15, clickCount: 1, jsErrors: 1, bounces: 0 });
    const remote = t.fetch.mock.calls.map(([, options]) => JSON.parse(options.body)).filter((event) => event.type === "engagement");
    expect(remote.map((event) => event.engagement.totalTimeOnPage)).toEqual([10, 5]);
    expect(remote.map((event) => event.engagement.clickCount)).toEqual([1, 0]);
    expect(remote.map((event) => event.errors.count)).toEqual([1, 0]);
  });
  it("does not count the same bounce twice across unload lifecycle events", () => {
    const t = tracker(); t.advance(1000);
    t.win.dispatchEvent(new t.win.Event("beforeunload"));
    t.win.dispatchEvent(new t.win.Event("pagehide"));
    expect(t.page()).toMatchObject({ totalTimeOnPage: 1, bounces: 1 });
    expect(t.events.reduce((sum, event) => sum + event.engagement.bounces, 0)).toBe(1);
  });
  it("flushes a manual path transition once locally and remotely", () => {
    const t = tracker({ collector: "/api/imprint", consent: "implicit" });
    t.advance(10_000); t.api.track({ path: "/next" });
    expect(t.page()).toMatchObject({ totalTimeOnPage: 10 });
    expect(t.fetch.mock.calls.map(([, options]) => JSON.parse(options.body).type)).toEqual(["pageview", "engagement", "pageview"]);
  });
  it("flushes a SPA transition without attributing old engagement to the new page", () => {
    const t = tracker(); t.advance(10_000);
    t.win.history.pushState({}, "", "/next"); t.runTimeouts();
    expect(t.page()).toMatchObject({ totalTimeOnPage: 10, views: 1 });
    expect(t.page("/next")).toMatchObject({ totalTimeOnPage: 0, views: 1 });
  });
  it("preserves engagement when a later manual view uses the same path", () => {
    const t = tracker(); t.advance(10_000); t.api.track();
    expect(t.page()).toMatchObject({ totalTimeOnPage: 10, views: 2 });
  });
  it("persists errors when engagement tracking is disabled", () => {
    const t = tracker({ trackEngagement: false });
    t.win.dispatchEvent(new t.win.ErrorEvent("error", { message: "test error" }));
    t.api.flushEngagement(); expect(t.page().jsErrors).toBe(1);
  });
  it("classifies bounces only at visit end, so an early checkpoint cannot misclassify a later engaged visit", () => {
    const t = tracker(); t.advance(1000); t.api.flushEngagement();
    expect(t.page().bounces).toBe(0);
    t.advance(9000); t.api.flushEngagement();
    t.win.dispatchEvent(new t.win.Event("pagehide"));
    expect(t.page()).toMatchObject({ bounces: 0, totalTimeOnPage: 10 });
  });
  it("keeps getEngagement cumulative while flushes consume only the new counters", () => {
    const t = tracker(); t.advance(10_000);
    expect(t.api.getEngagement().totalTimeOnPage).toBe(10);
    t.api.flushEngagement(); t.advance(5000);
    expect(t.api.getEngagement().totalTimeOnPage).toBe(15);
    t.api.flushEngagement(); expect(t.page().totalTimeOnPage).toBe(15);
  });
  it("checkpoints before emitting events that can trigger another flush", () => {
    const t = tracker();
    t.win.addEventListener("zya:imprint:engagement", () => t.api.flushEngagement());
    t.advance(10_000); t.api.flushEngagement();
    expect(t.page().totalTimeOnPage).toBe(10); expect(t.events).toHaveLength(1);
  });
  it("retains rich diagnostics locally while remote events contain only aggregate fields", () => {
    const t = tracker({ trackDevice: true, collector: "/api/imprint", consent: "implicit" });
    expect(t.page().device.userAgent).toBeTruthy(); expect(t.page().session.id).toBeTruthy();
    const remote = JSON.parse(t.fetch.mock.calls[0][1].body);
    for (const key of ["device", "session", "sessionId", "navigation", "fullReferrer"]) expect(remote).not.toHaveProperty(key);
    expect(remote).toMatchObject({ type: "pageview", path: "/start", newSession: true });
  });
});

describe("standalone tracker permission boundaries", () => {
  it.each([false, true])("does not poll or persist optional totals before permission (privacy signal: %s)", async (privacy) => {
    const t = tracker({ consent: "required", trackNeocities: true, neocitiesEndpoint: "/totals.json" }, privacy);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(t.fetch).not.toHaveBeenCalled(); expect(t.win.localStorage.length).toBe(0); expect(t.intervals.size).toBe(0);
  });
  it("stops local and remote writes after consent is revoked", () => {
    const t = tracker({ collector: "/api/imprint", consent: "required" });
    t.api.grantConsent(); t.advance(10_000); t.api.denyConsent();
    const stored = t.win.localStorage.getItem("zyaImprintV2"); const sends = t.fetch.mock.calls.length;
    t.api.flushEngagement(); t.win.dispatchEvent(new t.win.Event("pagehide"));
    expect(t.win.localStorage.getItem("zyaImprintV2")).toBe(stored); expect(t.fetch).toHaveBeenCalledTimes(sends); expect(t.api.status.enabled).toBe(false);
  });
  it("honors explicit denial in implicit mode and resumes after a new grant", () => {
    const t = tracker(); t.api.denyConsent(); t.advance(1000);
    expect(t.api.track()).toBe(false); t.advance(1000); expect(t.api.grantConsent()).toBe(true);
  });
  it("blocks delayed performance persistence when initial tracking is denied", () => {
    const t = tracker({ consent: "required", trackPerformance: true });
    (t.win.performance.getEntriesByType as any).mockReturnValue([{ startTime: 0, loadEventEnd: 100 }]); t.runTimeouts();
    expect(t.win.localStorage.length).toBe(0);
  });
  it("discards optional totals that finish after consent is revoked", async () => {
    const t = tracker(); t.api.config.trackNeocities = true; t.api.config.neocitiesEndpoint = "/totals.json";
    let resolve!: (value: unknown) => void;
    t.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    t.api.fetchNeocities(); t.api.denyConsent(); const stored = t.win.localStorage.getItem("zyaImprintV2");
    resolve({ ok: true, json: async () => ({ info: { views: 10, hits: 20 } }) });
    await new Promise((done) => setImmediate(done)); expect(t.win.localStorage.getItem("zyaImprintV2")).toBe(stored);
  });
});

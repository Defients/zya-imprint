import type { PageRecord } from "./types";

export function safeParse<T = any>(value: string | null, fallback: T): T {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function normalizePath(input: string) {
  let path = String(input || "/").trim();
  if (!path) path = "/";
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname || "/";
  } catch {}
  path = path.split("#")[0].split("?")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

export function normalizeSiteId(value: string, fallback = "unknown-site") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.neocities\.org.*$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function pageKey(siteId: string, path: string) {
  return `${normalizeSiteId(siteId)}::${normalizePath(path)}`;
}

export function formatNumber(value: number | string) {
  return Number(value || 0).toLocaleString();
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function formatRelativeDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffDay < 1) return "today";
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return date.toLocaleDateString();
}

export function dayKeyFromOffset(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - Number(offset || 0));
  return date.toISOString().slice(0, 10);
}

export function getViewsInLastNDays(page: Pick<PageRecord, "daily">, days: number) {
  let total = 0;
  for (let i = 0; i < days; i += 1) total += Number((page.daily || {})[dayKeyFromOffset(i)] || 0);
  return total;
}

export function getSiteDisplayDomain(siteName: string, domain: string | null) {
  return domain || `${siteName}.neocities.org`;
}

export function pickEarlierDate(a: string | null, b: string | null) {
  if (!a) return b || null;
  if (!b) return a || null;
  const at = new Date(a).getTime();
  const bt = new Date(b).getTime();
  if (Number.isNaN(at)) return b;
  if (Number.isNaN(bt)) return a;
  return at <= bt ? a : b;
}

export function pickLaterDate(a: string | null, b: string | null) {
  if (!a) return b || null;
  if (!b) return a || null;
  const at = new Date(a).getTime();
  const bt = new Date(b).getTime();
  if (Number.isNaN(at)) return b;
  if (Number.isNaN(bt)) return a;
  return at >= bt ? a : b;
}

export function mergeSnapshot(existing: PageRecord | undefined, incoming: PageRecord): PageRecord {
  if (!existing) return incoming;
  const incomingIsNewer = new Date(incoming.lastSeen || 0).getTime() >= new Date(existing.lastSeen || 0).getTime();
  const daily = { ...existing.daily };
  Object.entries(incoming.daily || {}).forEach(([day, count]) => {
    // Imports and collector payloads are snapshots. Max prevents duplicate imports from inflating counts.
    daily[day] = Math.max(Number(daily[day] || 0), Number(count || 0));
  });
  return {
    ...existing,
    siteId: incoming.siteId || existing.siteId,
    origin: incoming.origin || existing.origin,
    title: incomingIsNewer ? incoming.title || existing.title : existing.title || incoming.title,
    label: incomingIsNewer ? incoming.label || existing.label : existing.label || incoming.label,
    views: Math.max(Number(existing.views || 0), Number(incoming.views || 0)),
    uniqueSessions: Math.max(Number(existing.uniqueSessions || 0), Number(incoming.uniqueSessions || 0)),
    firstSeen: pickEarlierDate(existing.firstSeen, incoming.firstSeen),
    lastSeen: pickLaterDate(existing.lastSeen, incoming.lastSeen),
    lastReferrer: incomingIsNewer ? incoming.lastReferrer || existing.lastReferrer : existing.lastReferrer || incoming.lastReferrer,
    daily,
    source: incomingIsNewer ? incoming.source : existing.source,
    totalTimeOnPage: Math.max(Number(existing.totalTimeOnPage || 0), Number(incoming.totalTimeOnPage || 0)) || undefined,
    maxScrollPercent: Math.max(Number(existing.maxScrollPercent || 0), Number(incoming.maxScrollPercent || 0)) || undefined,
    scrollMilestones: Array.from(new Set([...(existing.scrollMilestones || []), ...(incoming.scrollMilestones || [])])) || undefined,
    bounces: Math.max(Number(existing.bounces || 0), Number(incoming.bounces || 0)) || undefined,
    returnVisits: Math.max(Number(existing.returnVisits || 0), Number(incoming.returnVisits || 0)) || undefined,
    clickCount: Math.max(Number(existing.clickCount || 0), Number(incoming.clickCount || 0)) || undefined,
    interactionCount: Math.max(Number(existing.interactionCount || 0), Number(incoming.interactionCount || 0)) || undefined,
    jsErrors: Math.max(Number(existing.jsErrors || 0), Number(incoming.jsErrors || 0)) || undefined,
    lastError: incomingIsNewer ? (incoming.lastError || existing.lastError) : (existing.lastError || incoming.lastError),
    device: incomingIsNewer ? (incoming.device || existing.device) : (existing.device || incoming.device),
    performance: incomingIsNewer ? (incoming.performance || existing.performance) : (existing.performance || incoming.performance),
    navigation: incomingIsNewer ? (incoming.navigation || existing.navigation) : (existing.navigation || incoming.navigation),
    session: incomingIsNewer ? (incoming.session || existing.session) : (existing.session || incoming.session),
    neocities: incomingIsNewer ? (incoming.neocities || existing.neocities) : (existing.neocities || incoming.neocities)
  };
}

export function createSorter<T>(valueFn: (item: T, key: string) => string | number) {
  return (items: T[], sortKey: string): T[] => {
    const [key, direction] = sortKey.split("-");
    const multiplier = direction === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = valueFn(a, key);
      const bv = valueFn(b, key);
      const compared = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv))
        : Number(av) - Number(bv);
      return Math.sign(compared) * multiplier;
    });
  };
}

export async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

export function formatDuration(seconds: number) {
  if (!seconds) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export type DateRangeKey = "7d" | "30d" | "90d" | "all";

export function filterByDateRange<T extends { name: string }>(data: T[], range: DateRangeKey): T[] {
  if (range === "all" || !data.length) return data;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return data.filter((item) => item.name >= cutoffStr);
}

export function sparklinePath(values: number[], width: number, height: number): { line: string; area: string } {
  if (!values.length) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width.toFixed(1)},${height.toFixed(1)} L0,${height.toFixed(1)} Z`;
  return { line, area };
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      window.dispatchEvent(new CustomEvent("zya:storage:quota", { detail: { key, error: error.name } }));
      const pruned = safeSetItemWithPrune(key, value);
      if (pruned) return true;
    }
    return false;
  }
}

function safeSetItemWithPrune(key: string, value: string): boolean {
  try {
    const store = safeParse<any>(localStorage.getItem(key), null);
    if (store && typeof store === "object") {
      if (store.pages && typeof store.pages === "object") {
        const entries = Object.entries(store.pages) as [string, any][];
        if (entries.length > 1) {
          entries.sort((a, b) => {
            const at = new Date(a[1]?.lastSeen || a[1]?.meta?.updatedAt || 0).getTime();
            const bt = new Date(b[1]?.lastSeen || b[1]?.meta?.updatedAt || 0).getTime();
            return at - bt;
          });
          const keepCount = Math.max(1, Math.floor(entries.length / 2));
          store.pages = Object.fromEntries(entries.slice(-keepCount));
          if (store.meta) store.meta.updatedAt = new Date().toISOString();
          const prunedValue = JSON.stringify(store);
          localStorage.setItem(key, prunedValue);
          return true;
        }
      }
      if (store.sites && typeof store.sites === "object") {
        const siteEntries = Object.entries(store.sites) as [string, any[]][];
        let pruned = false;
        siteEntries.forEach(([name, entries]) => {
          if (Array.isArray(entries) && entries.length > 2) {
            store.sites[name] = entries.slice(-Math.ceil(entries.length / 2));
            pruned = true;
          }
        });
        if (pruned) {
          if (store.meta) store.meta.updatedAt = new Date().toISOString();
          const prunedValue = JSON.stringify(store);
          localStorage.setItem(key, prunedValue);
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

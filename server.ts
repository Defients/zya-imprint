import express from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const PORT = Number(process.env.PORT || 3000);
const collectorEnabled = process.env.IMPRINT_COLLECTOR_ENABLED === "true";
const collectorReadToken = process.env.IMPRINT_READ_TOKEN || "";
const collectorFile = path.resolve(process.env.IMPRINT_DATA_FILE || path.join(__dirname, "data", "imprints.json"));
const collectorRetentionDays = Math.max(7, Math.min(3650, Number(process.env.IMPRINT_RETENTION_DAYS || 365)));
const allowedOrigins = (process.env.IMPRINT_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

interface CollectorStore {
  meta: { version: number; createdAt: string; updatedAt: string };
  sites: Record<string, {
    origin: string;
    pages: Record<string, {
      path: string;
      title: string;
      label: string;
      views: number;
      uniqueSessions: number;
      firstSeen: string;
      lastSeen: string;
      lastReferrer: string;
      daily: Record<string, number>;
      totalTimeOnPage?: number;
      maxScrollPercent?: number;
      scrollMilestones?: string[];
      bounces?: number;
      returnVisits?: number;
      clickCount?: number;
      interactionCount?: number;
      jsErrors?: number;
      lastError?: { message: string; source: string; line: number; timestamp: string } | null;
      performance?: Record<string, any> | null;
      neocities?: Record<string, any> | null;
    }>;
  }>;
  recentEventIds: string[];
}

function freshCollectorStore(): CollectorStore {
  const now = new Date().toISOString();
  return { meta: { version: 1, createdAt: now, updatedAt: now }, sites: {}, recentEventIds: [] };
}

let collectorStore: CollectorStore = freshCollectorStore();
let writeChain = Promise.resolve();

async function loadCollectorStore() {
  if (!collectorEnabled) return;
  try {
    collectorStore = JSON.parse(await readFile(collectorFile, "utf8"));
    // Upgrade existing files to the collector's aggregate-only privacy contract.
    if (scrubCollectorDiagnostics(collectorStore)) {
      queueCollectorWrite();
      await writeChain;
    }
  } catch {
    collectorStore = freshCollectorStore();
  }
}

function scrubCollectorDiagnostics(store: CollectorStore) {
  let changed = false;
  for (const site of Object.values(store.sites)) {
    for (const page of Object.values(site.pages)) {
      for (const key of ["device", "session", "navigation", "sessionId", "fullReferrer"] as const) {
        if (Object.hasOwn(page, key)) {
          delete (page as any)[key];
          changed = true;
        }
      }
    }
  }
  return changed;
}

function queueCollectorWrite() {
  collectorStore.meta.updatedAt = new Date().toISOString();
  writeChain = writeChain.then(async () => {
    await mkdir(path.dirname(collectorFile), { recursive: true });
    await writeFile(collectorFile, JSON.stringify(collectorStore, null, 2), "utf8");
  }).catch((error) => console.error("Collector persistence failed:", error));
}

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return allowedOrigins.some((rule) => {
    if (rule === origin) return true;
    if (rule.startsWith("*.")) {
      try { return new URL(origin).hostname.endsWith(rule.slice(1)); } catch { return false; }
    }
    return false;
  });
}

function isPublicIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    if (value === "::1" || value === "::") return false;
    if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return false;
    if (value.startsWith("::ffff:")) return isPublicIp(value.replace("::ffff:", ""));
    return true;
  }
  return false;
}

async function validatePublicUrl(raw: string) {
  if (raw.length > 2048) throw new Error("URL is too long");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are allowed");
  if (url.username || url.password) throw new Error("Credentialed URLs are not allowed");
  if (/^(localhost|.*\.localhost)$/i.test(url.hostname)) throw new Error("Local destinations are blocked");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) throw new Error("Private or reserved destinations are blocked");
  return url;
}

async function readResponseText(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error(`Response exceeds ${Math.round(maxBytes / 1000)} KB limit`);
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeds ${Math.round(maxBytes / 1000)} KB limit`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function safeFetch(raw: string, redirects = 0, maxBytes = 1_000_000): Promise<{ response: Response; finalUrl: string; text: string }> {
  if (redirects > 3) throw new Error("Too many redirects");
  const url = await validatePublicUrl(raw);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Upstream request timed out after 10 seconds"));
    }, 10_000);
  });

  const request = fetch(url, {
    redirect: "manual",
    signal: controller.signal,
    headers: { "User-Agent": "ZyaImprintVerifier/3.2", Accept: "text/html,application/json;q=0.9,*/*;q=0.8" }
  }).then(async (response) => {
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Redirect missing location");
      return safeFetch(new URL(location, url).toString(), redirects + 1, maxBytes);
    }
    const text = await readResponseText(response, maxBytes);
    return { response, finalUrl: url.toString(), text };
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cleanSiteName(value: unknown) {
  return String(value || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.neocities\.org.*$/, "")
    .split(".")[0]
    .toLowerCase();
}

function cleanSiteNames(value: unknown, limit = 50) {
  return [...new Set(String(value || "")
    .split(",")
    .map((site) => cleanSiteName(site.trim()))
    .filter((site) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(site)))]
    .slice(0, limit);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const neocitiesResponseCache = new Map<string, { expiresAt: number; payload: any }>();
const NEOCITIES_CACHE_TTL_MS = 5 * 60_000;

async function fetchNeocitiesPayload(siteName: string) {
  const cached = neocitiesResponseCache.get(siteName);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const { response, text } = await safeFetch(
    `https://neocities.org/api/info?sitename=${encodeURIComponent(siteName)}`,
    0,
    256_000
  );
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Neocities returned invalid JSON (HTTP ${response.status})`);
  }
  if (!response.ok || payload?.result !== "success" || !payload?.info) {
    const message = String(payload?.error_type || payload?.message || payload?.result || `HTTP ${response.status}`);
    throw new Error(`Neocities lookup failed: ${message}`);
  }
  neocitiesResponseCache.set(siteName, { expiresAt: Date.now() + NEOCITIES_CACHE_TTL_MS, payload });
  return payload;
}

function parseTracker(html: string) {
  const found = /zya-imprint(?:\.min)?\.js/i.test(html) || /window\.ZYA_IMPRINT\s*=/i.test(html);
  const siteId = html.match(/data-site-id=["']([^"']+)["']/i)?.[1]
    || html.match(/["']?siteId["']?\s*:\s*["']([^"']+)["']/i)?.[1]
    || "";
  const pagePath = html.match(/["']?path["']?\s*:\s*["']([^"']+)["']/i)?.[1] || "";
  const label = html.match(/["']?label["']?\s*:\s*["']([^"']+)["']/i)?.[1] || "";
  const collector = /data-collector=|["']?collector["']?\s*:/i.test(html);
  return { found, siteId, path: pagePath, label, collector };
}

const rateWindow = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string, limit = 120) {
  const now = Date.now();
  const existing = rateWindow.get(key);
  if (!existing || existing.resetAt <= now) {
    rateWindow.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  existing.count += 1;
  return existing.count > limit;
}

if (process.env.NODE_ENV !== "test") {
  await loadCollectorStore();
}

async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(express.json({ limit: "32kb", type: ["application/json", "text/plain"] }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, collectorEnabled }));

  app.get("/api/neocities/info", async (req, res) => {
    const siteName = cleanSiteName(req.query.sitename);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(siteName)) return res.status(400).json({ error: "Invalid Neocities sitename" });
    try {
      const payload = await fetchNeocitiesPayload(siteName);
      res.setHeader("Cache-Control", "private, max-age=60");
      res.json(payload);
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Neocities pull failed" });
    }
  });

  app.get("/api/neocities/batch", async (req, res) => {
    const siteNames = cleanSiteNames(req.query.sites);
    if (!siteNames.length) return res.status(400).json({ error: "At least one valid sitename is required" });

    const fetchedAt = new Date().toISOString();
    const sites = await mapWithConcurrency(siteNames, 4, async (siteName) => {
      try {
        const payload = await fetchNeocitiesPayload(siteName);
        const info = payload.info;
        return {
          siteName,
          views: Number(info.views || 0),
          hits: Number(info.hits || 0),
          createdAt: info.created_at || null,
          lastUpdated: info.last_updated || null,
          domain: info.domain || null,
          tags: Array.isArray(info.tags) ? info.tags : [],
          error: null
        };
      } catch (error) {
        return {
          siteName,
          views: 0,
          hits: 0,
          createdAt: null,
          lastUpdated: null,
          domain: null,
          tags: [],
          error: error instanceof Error ? error.message : "Neocities pull failed"
        };
      }
    });

    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ result: "success", fetchedAt, sites });
  });

  app.get("/api/inspect", async (req, res) => {
    const raw = String(req.query.url || "");
    if (!raw) return res.status(400).json({ error: "url is required" });
    try {
      const { response, finalUrl, text: html } = await safeFetch(raw, 0, 1_000_000);
      if (!response.ok) return res.status(502).json({ error: `Destination returned HTTP ${response.status}` });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) return res.status(415).json({ error: "Destination is not HTML" });
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 200) || "";
      res.json({ finalUrl, title, tracker: parseTracker(html) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Inspection failed" });
    }
  });

  app.options("/api/imprint", (req, res) => {
    const origin = String(req.headers.origin || "");
    if (!isAllowedOrigin(origin)) return res.sendStatus(403);
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });

  app.post("/api/imprint", (req, res) => {
    if (!collectorEnabled) return res.status(503).json({ error: "Collector is disabled" });
    const originHeader = String(req.headers.origin || "");
    if (!isAllowedOrigin(originHeader)) return res.status(403).json({ error: "Origin is not allowed" });
    res.setHeader("Access-Control-Allow-Origin", originHeader);
    res.setHeader("Vary", "Origin");
    if (rateLimited(req.ip || "unknown")) return res.status(429).json({ error: "Rate limit exceeded" });

    const body = req.body || {};
    const siteId = String(body.siteId || "").toLowerCase();
    const pagePath = String(body.path || "");
    const viewedAt = String(body.viewedAt || "");
    const day = String(body.day || "");
    const eventId = String(body.eventId || "");
    if (body.type !== "pageview" && body.type !== "engagement") return res.status(400).json({ error: "Unsupported event type" });
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(siteId)) return res.status(400).json({ error: "Invalid siteId" });
    if (!pagePath.startsWith("/") || pagePath.length > 512) return res.status(400).json({ error: "Invalid path" });
    if (Number.isNaN(new Date(viewedAt).getTime())) return res.status(400).json({ error: "Invalid timestamp" });
    if (body.type === "pageview" && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: "Invalid day" });
    if (!eventId || eventId.length > 100) return res.status(400).json({ error: "Invalid eventId" });
    if (String(body.origin || "") !== originHeader) return res.status(400).json({ error: "Payload origin mismatch" });

    if (collectorStore.recentEventIds.includes(eventId)) return res.status(202).json({ ok: true, duplicate: true });
    collectorStore.recentEventIds.push(eventId);
    collectorStore.recentEventIds = collectorStore.recentEventIds.slice(-5000);

    const site = collectorStore.sites[siteId] || { origin: originHeader, pages: {} };
    site.origin = originHeader;
    const page = site.pages[pagePath] || {
      path: pagePath,
      title: String(body.title || pagePath).slice(0, 200),
      label: String(body.label || "").slice(0, 120),
      views: 0,
      uniqueSessions: 0,
      firstSeen: viewedAt,
      lastSeen: viewedAt,
      lastReferrer: "",
      daily: {},
      totalTimeOnPage: 0,
      maxScrollPercent: 0,
      scrollMilestones: [],
      bounces: 0,
      returnVisits: 0,
      clickCount: 0,
      interactionCount: 0,
      jsErrors: 0
    };

    if (body.type === "engagement") {
      const eng = body.engagement || {};
      page.totalTimeOnPage = Number(page.totalTimeOnPage || 0) + Number(eng.totalTimeOnPage || 0);
      page.maxScrollPercent = Math.max(Number(page.maxScrollPercent || 0), Number(eng.maxScrollPercent || 0));
      page.scrollMilestones = Array.from(new Set([...(page.scrollMilestones || []), ...(Array.isArray(eng.scrollMilestones) ? eng.scrollMilestones : [])]));
      page.clickCount = Number(page.clickCount || 0) + Number(eng.clickCount || 0);
      page.interactionCount = Number(page.interactionCount || 0) + Number(eng.interactionCount || 0);
      page.bounces = Number(page.bounces || 0) + Number(eng.bounces || 0);
      page.returnVisits = Math.max(0, Number(page.views || 0) - Number(page.uniqueSessions || 0));
      if (body.errors) {
        page.jsErrors = Number(page.jsErrors || 0) + Number(body.errors.count || 0);
        if (body.errors.lastError) page.lastError = {
          message: String(body.errors.lastError.message || "").slice(0, 500),
          source: String(body.errors.lastError.source || "").slice(0, 300),
          line: Number(body.errors.lastError.line || 0),
          timestamp: String(body.errors.lastError.timestamp || viewedAt)
        };
      }
      page.lastSeen = viewedAt;
    } else {
      page.title = String(body.title || page.title).slice(0, 200);
      page.label = String(body.label || page.label).slice(0, 120);
      page.views += 1;
      page.uniqueSessions += body.newSession === true ? 1 : 0;
      page.lastSeen = viewedAt;
      page.lastReferrer = String(body.referrer || "").slice(0, 255);
      page.returnVisits = Math.max(0, page.views - page.uniqueSessions);
      page.daily[day] = Number(page.daily[day] || 0) + 1;

      if (body.performance && typeof body.performance === "object") page.performance = body.performance;
      if (body.neocities && typeof body.neocities === "object") page.neocities = body.neocities;
      if (body.errors) {
        page.jsErrors = Number(page.jsErrors || 0) + Number(body.errors.count || 0);
        if (body.errors.lastError) page.lastError = {
          message: String(body.errors.lastError.message || "").slice(0, 500),
          source: String(body.errors.lastError.source || "").slice(0, 300),
          line: Number(body.errors.lastError.line || 0),
          timestamp: String(body.errors.lastError.timestamp || viewedAt)
        };
      }
    }
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - collectorRetentionDays);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    Object.keys(page.daily).forEach((key) => { if (key < cutoffKey) delete page.daily[key]; });
    site.pages[pagePath] = page;
    collectorStore.sites[siteId] = site;
    queueCollectorWrite();
    res.status(202).json({ ok: true });
  });

  app.get("/api/imprint/summary", (req, res) => {
    if (!collectorEnabled) return res.status(503).json({ error: "Collector is disabled" });
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (collectorReadToken && token !== collectorReadToken) return res.status(401).json({ error: "Invalid read token" });
    if (isProduction && !collectorReadToken) return res.status(503).json({ error: "IMPRINT_READ_TOKEN must be configured in production" });
    const { recentEventIds: _ignored, ...summary } = collectorStore;
    res.setHeader("Cache-Control", "no-store");
    res.json(summary);
  });

  if (!isProduction) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use("/zya-imprint", express.static(distPath, { maxAge: "1h" }));
    app.get("/zya-imprint.js", (_req, res) => res.sendFile(path.join(distPath, "zya-imprint.js")));
    app.get(["/", "/zya-imprint", "/zya-imprint/*"], (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ZYA Imprint Signal Vault listening on http://localhost:${PORT}${isProduction ? "/zya-imprint/" : ""}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { parseTracker, cleanSiteName, cleanSiteNames, isPublicIp, isAllowedOrigin, mapWithConcurrency };

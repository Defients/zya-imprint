#!/usr/bin/env node
/**
 * Pre-fetch Neocities site data for static deployments.
 *
 * The browser cannot call Neocities' API directly because the API does not
 * expose cross-origin response headers. This script is the static deployment's
 * trusted server-side refresh step. It retries transient failures, limits
 * concurrency, and preserves the last good point for a site rather than
 * replacing usable data with an error.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "public", "neocities-cache.json");

const DEFAULT_SITE_LIST = [
  "astrimancy", "astrizda", "auralyx", "bridgebuilder", "confluxcircuit",
  "defears", "deffy", "defscribe", "du3l", "hybrix", "kovrycha",
  "madchatter", "peerly", "phexotial", "pikon", "pyah",
  "skriv", "skywardascent", "wikirace"
];

const FETCH_TIMEOUT_MS = Math.max(3000, Number(process.env.NEOCITIES_PREFETCH_TIMEOUT_MS || 15000));
const MAX_ATTEMPTS = Math.max(1, Math.min(5, Number(process.env.NEOCITIES_PREFETCH_ATTEMPTS || 3)));
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.NEOCITIES_PREFETCH_CONCURRENCY || 4)));
const ALLOW_PARTIAL = process.env.NEOCITIES_PREFETCH_ALLOW_PARTIAL === "true";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`));
    }, FETCH_TIMEOUT_MS);
  });

  const request = fetch(url, {
    signal: controller.signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "ZyaImprintStaticCache/3.2"
    }
  }).then(async (response) => ({ response, text: await response.text() }));

  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function readPreviousCache() {
  if (!existsSync(outputPath)) return { sites: [] };
  try {
    const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
    return parsed && Array.isArray(parsed.sites) ? parsed : { sites: [] };
  } catch {
    return { sites: [] };
  }
}

async function fetchSite(siteName, previous) {
  const url = `https://neocities.org/api/info?sitename=${encodeURIComponent(siteName)}`;
  let lastError = "Unknown fetch error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { response, text } = await fetchWithTimeout(url);
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON (HTTP ${response.status})`);
      }
      if (!response.ok || payload?.result !== "success" || !payload?.info) {
        throw new Error(String(payload?.error_type || payload?.message || `HTTP ${response.status}`));
      }

      const info = payload.info;
      return {
        siteName,
        views: Number(info.views || 0),
        hits: Number(info.hits || 0),
        createdAt: info.created_at || null,
        lastUpdated: info.last_updated || null,
        domain: info.domain || null,
        tags: Array.isArray(info.tags) ? info.tags : [],
        error: null,
        stale: false,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown fetch error";
      if (attempt < MAX_ATTEMPTS) await sleep(400 * (2 ** (attempt - 1)));
    }
  }

  if (previous && !previous.error) {
    return {
      ...previous,
      siteName,
      error: null,
      stale: true,
      warning: `Live refresh failed; retained previous snapshot: ${lastError}`
    };
  }

  return {
    siteName,
    views: 0,
    hits: 0,
    createdAt: null,
    lastUpdated: null,
    domain: null,
    tags: [],
    error: lastError,
    stale: false,
    timestamp: new Date().toISOString()
  };
}

async function main() {
  console.log("Pre-fetching Neocities site data...");

  let siteList = DEFAULT_SITE_LIST;
  const settingsPath = path.join(root, ".neocities-sites");
  if (existsSync(settingsPath)) {
    const parsed = readFileSync(settingsPath, "utf8")
      .split(/\r?\n/)
      .map((site) => site.trim().toLowerCase())
      .filter((site) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(site));
    if (parsed.length > 0) siteList = [...new Set(parsed)];
  }

  const previousCache = readPreviousCache();
  const previousBySite = new Map(previousCache.sites.map((site) => [site.siteName, site]));
  const results = await mapWithConcurrency(
    siteList,
    CONCURRENCY,
    (siteName) => fetchSite(siteName, previousBySite.get(siteName))
  );

  const succeeded = results.filter((result) => !result.error).length;
  const retained = results.filter((result) => result.stale).length;
  const failedResults = results.filter((result) => result.error);
  const generatedAt = new Date().toISOString();

  if (failedResults.length && !ALLOW_PARTIAL) {
    console.error(`Neocities cache refresh aborted: ${failedResults.length} site(s) have no usable snapshot.`);
    failedResults.forEach((result) => console.error(`- ${result.siteName}: ${result.error}`));
    console.error("The existing cache was left unchanged. Set NEOCITIES_PREFETCH_ALLOW_PARTIAL=true only when a partial cache is intentional.");
    process.exitCode = 1;
    return;
  }

  const cache = {
    schemaVersion: 2,
    generatedAt,
    fetchedAt: generatedAt,
    complete: failedResults.length === 0,
    counts: {
      requested: results.length,
      succeeded,
      refreshed: succeeded - retained,
      retained,
      failed: failedResults.length
    },
    sites: results
  };

  writeFileSync(outputPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  console.log(`Neocities cache written: ${succeeded}/${results.length} usable (${retained} retained, ${failedResults.length} failed).`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  console.error("Pre-fetch failed:", error);
  process.exitCode = 1;
});

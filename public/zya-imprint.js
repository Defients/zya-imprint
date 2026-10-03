/* ZYA IMPRINT v3.2.0 — full-spectrum first-party page analytics.
 * Engagement, device, performance, error, navigation, session, and Neocities API tracking.
 */
(function () {
  "use strict";

  var VERSION = "3.2.0";
  var DEFAULT_KEY = "zyaImprintV2";
  var currentScript = document.currentScript;
  var legacy = window.ZYA_IMPRINT_PAGE || {};
  var configured = window.ZYA_IMPRINT || {};
  var dataset = currentScript && currentScript.dataset ? currentScript.dataset : {};

  function bool(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return !/^(false|0|off|no)$/i.test(String(value));
  }

  function clampNumber(value, fallback, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.max(min, Math.min(max, number));
  }

  function cleanSiteId(value) {
    return String(value || location.hostname || "site")
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.neocities\.org$/, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "site";
  }

  function cleanPath(value) {
    var path = String(value || location.pathname || "/").split("#")[0].split("?")[0];
    if (path.charAt(0) !== "/") path = "/" + path;
    path = path.replace(/\/{2,}/g, "/");
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  }

  var collector = String(configured.collector || dataset.collector || "").trim();
  var config = {
    siteId: cleanSiteId(configured.siteId || dataset.siteId),
    storageKey: String(configured.storageKey || DEFAULT_KEY),
    retentionDays: clampNumber(configured.retentionDays || dataset.retentionDays, 90, 7, 730),
    spa: bool(configured.spa !== undefined ? configured.spa : dataset.spa, true),
    respectPrivacy: bool(configured.respectPrivacy !== undefined ? configured.respectPrivacy : dataset.respectPrivacy, true),
    consent: String(configured.consent || dataset.consent || (collector ? "required" : "implicit")).toLowerCase(),
    consentKey: String(configured.consentKey || ("zyaImprintConsent:" + cleanSiteId(configured.siteId || dataset.siteId))),
    collector: collector,
    debug: bool(configured.debug !== undefined ? configured.debug : dataset.debug, false),
    page: configured.page || legacy,
    trackEngagement: bool(configured.trackEngagement !== undefined ? configured.trackEngagement : dataset.trackEngagement, true),
    trackDevice: bool(configured.trackDevice !== undefined ? configured.trackDevice : dataset.trackDevice, true),
    trackPerformance: bool(configured.trackPerformance !== undefined ? configured.trackPerformance : dataset.trackPerformance, true),
    trackErrors: bool(configured.trackErrors !== undefined ? configured.trackErrors : dataset.trackErrors, true),
    trackNeocities: bool(configured.trackNeocities !== undefined ? configured.trackNeocities : dataset.trackNeocities, false),
    neocitiesSite: String(configured.neocitiesSite || dataset.neocitiesSite || "").trim(),
    neocitiesEndpoint: String(configured.neocitiesEndpoint || dataset.neocitiesEndpoint || "").trim()
  };

  var state = { enabled: true, reason: "ready", lastPath: "", lastTrackedAt: 0 };
  var engagement = createEngagementState();
  var errorCount = 0;
  var lastError = null;
  var neocitiesData = null;
  var neocitiesTimer = null;
  var cleanupFns = [];

  function createEngagementState() {
    return {
      path: "",
      startTime: Date.now(),
      totalTimeOnPage: 0,
      maxScrollPercent: 0,
      scrollMilestones: [],
      clickCount: 0,
      interactionCount: 0,
      visible: true,
      lastVisibleChange: Date.now(),
      rafPending: false
    };
  }

  function log() {
    if (config.debug && window.console) console.log.apply(console, ["[ZYA IMPRINT]"].concat([].slice.call(arguments)));
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (_) {}
  }

  function privacyBlocked() {
    if (!config.respectPrivacy) return false;
    var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    return navigator.globalPrivacyControl === true || String(dnt) === "1" || String(dnt).toLowerCase() === "yes";
  }

  function consentGranted() {
    if (config.consent === "disabled" || config.consent === "implicit") return true;
    try { return localStorage.getItem(config.consentKey) === "granted"; } catch (_) { return false; }
  }

  function canTrack() {
    if (privacyBlocked()) return { ok: false, reason: "privacy-signal" };
    if (!consentGranted()) return { ok: false, reason: "consent-required" };
    return { ok: true, reason: "ready" };
  }

  function randomId() {
    try { return crypto.randomUUID(); } catch (_) {
      return "zya-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    }
  }

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  }

  function nowIso() { return new Date().toISOString(); }
  function dayKey() { return new Date().toISOString().slice(0, 10); }

  function fullReferrer() {
    return String(document.referrer || "").slice(0, 500);
  }

  function categorizeReferrer(ref) {
    if (!ref) return "direct";
    try {
      var url = new URL(ref);
      if (url.origin === location.origin) return "internal";
      var host = url.hostname.toLowerCase();
      if (/\bgoogle\.|bing\.|duckduckgo\.|yahoo\.|baidu\.|yandex\./i.test(host)) return "search";
      if (/twitter\.|x\.com|facebook\.|instagram\.|reddit\.|t\.co|linkedin\./i.test(host)) return "social";
      return "external";
    } catch (_) { return "direct"; }
  }

  function safeReferrer() {
    if (!document.referrer) return "";
    try {
      var ref = new URL(document.referrer);
      return ref.origin === location.origin ? cleanPath(ref.pathname) : ref.origin;
    } catch (_) { return ""; }
  }

  /* ── Device & Environment Collection ── */
  function collectDeviceInfo() {
    if (!config.trackDevice) return null;
    var nav = navigator;
    var conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
    return {
      userAgent: String(nav.userAgent || "").slice(0, 500),
      screenWidth: Number(screen.width || 0),
      screenHeight: Number(screen.height || 0),
      viewportWidth: Number(window.innerWidth || 0),
      viewportHeight: Number(window.innerHeight || 0),
      colorDepth: Number(screen.colorDepth || 0),
      pixelRatio: Number(window.devicePixelRatio || 1),
      hardwareConcurrency: nav.hardwareConcurrency || null,
      deviceMemory: nav.deviceMemory || null,
      platform: String(nav.platform || "").slice(0, 100),
      language: String(nav.language || "").slice(0, 50),
      languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 10).map(function (l) { return String(l).slice(0, 50); }) : [],
      timezone: String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").slice(0, 100),
      touch: ("ontouchstart" in window) || (nav.maxTouchPoints || 0) > 0,
      connectionType: String(conn.effectiveType || "unknown").slice(0, 20),
      online: !!nav.onLine
    };
  }

  /* ── Performance Metrics Collection ── */
  function collectPerformanceMetrics() {
    if (!config.trackPerformance) return null;
    try {
      var entries = performance.getEntriesByType("navigation");
      if (!entries.length) return null;
      var nav = entries[0];
      var paintEntries = performance.getEntriesByType("paint");
      var fp = 0, fcp = 0;
      paintEntries.forEach(function (entry) {
        if (entry.name === "first-paint") fp = Math.round(entry.startTime);
        if (entry.name === "first-contentful-paint") fcp = Math.round(entry.startTime);
      });
      return {
        loadTime: Math.round(nav.loadEventEnd - nav.startTime) || 0,
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime) || 0,
        ttfb: Math.round(nav.responseStart - nav.requestStart) || 0,
        dnsTime: Math.round(nav.domainLookupEnd - nav.domainLookupStart) || 0,
        domInteractive: Math.round(nav.domInteractive - nav.startTime) || 0,
        transferSize: Number(nav.transferSize || 0),
        firstPaint: fp,
        fcp: fcp
      };
    } catch (_) { return null; }
  }

  /* ── Navigation Info Collection ── */
  function collectNavigationInfo() {
    var ref = fullReferrer();
    var navType = "navigate";
    var redirectCount = 0;
    try {
      var entries = performance.getEntriesByType("navigation");
      if (entries.length) {
        var nav = entries[0];
        navType = String(nav.type || "navigate");
        redirectCount = Number(nav.redirectCount || 0);
      }
    } catch (_) {}
    return {
      type: navType,
      redirectCount: redirectCount,
      referrer: ref,
      referrerType: categorizeReferrer(ref),
      entryType: navType
    };
  }

  /* ── Session Tracking ── */
  function getSessionId() {
    var key = "zyaImprintSession:" + config.siteId;
    try {
      var id = sessionStorage.getItem(key);
      if (!id) { id = randomId(); sessionStorage.setItem(key, id); }
      return id;
    } catch (_) { return randomId(); }
  }

  function getSessionInfo() {
    var key = "zyaImprintSession:" + config.siteId;
    var startKey = "zyaImprintSessionStart:" + config.siteId;
    var countKey = "zyaImprintSessionPageCount:" + config.siteId;
    var durationKey = "zyaImprintSessionDuration:" + config.siteId;
    try {
      var id = sessionStorage.getItem(key) || randomId();
      var startTime = sessionStorage.getItem(startKey);
      if (!startTime) { startTime = nowIso(); sessionStorage.setItem(startKey, startTime); }
      var pageCount = Number(sessionStorage.getItem(countKey) || 0) + 1;
      sessionStorage.setItem(countKey, String(pageCount));
      var duration = Number(sessionStorage.getItem(durationKey) || 0) + (engagement.totalTimeOnPage || 0);
      sessionStorage.setItem(durationKey, String(duration));
      return { id: id, startTime: startTime, duration: duration, pageCount: pageCount };
    } catch (_) {
      return { id: randomId(), startTime: nowIso(), duration: 0, pageCount: 1 };
    }
  }

  function isNewPageSession(path) {
    var key = "zyaImprintSeen:" + config.siteId + ":" + path;
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
      return true;
    } catch (_) { return true; }
  }

  function isDailyUnique() {
    var key = "zyaImprintDailyUnique:" + config.siteId + ":" + dayKey();
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
      return true;
    } catch (_) { return true; }
  }

  function incrementTotalUniques() {
    var key = "zyaImprintTotalUniques:" + config.siteId;
    try {
      var count = Number(localStorage.getItem(key) || 0) + 1;
      localStorage.setItem(key, String(count));
      return count;
    } catch (_) { return 0; }
  }

  /* ── Error Tracking ── */
  function setupErrorTracking() {
    if (!config.trackErrors) return;
    window.addEventListener("error", function (event) {
      errorCount += 1;
      lastError = {
        message: String(event.message || "Unknown error").slice(0, 500),
        source: String(event.filename || event.source || "").slice(0, 300),
        line: Number(event.lineno || 0),
        timestamp: nowIso()
      };
      log("error captured", lastError);
    });
    window.addEventListener("unhandledrejection", function (event) {
      errorCount += 1;
      var reason = event.reason;
      lastError = {
        message: String(reason && reason.message || reason || "Unhandled promise rejection").slice(0, 500),
        source: "promise",
        line: 0,
        timestamp: nowIso()
      };
      log("unhandled rejection", lastError);
    });
  }

  /* ── Engagement Tracking ── */
  function setupEngagementTracking(path) {
    if (!config.trackEngagement) return;
    engagement = createEngagementState();
    engagement.path = path;

    var scrollHandler = function () {
      if (engagement.rafPending) return;
      engagement.rafPending = true;
      requestAnimationFrame(function () {
        engagement.rafPending = false;
        var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        var scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollHeight <= 0) {
          engagement.maxScrollPercent = 100;
        } else {
          var pct = Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
          if (pct > engagement.maxScrollPercent) engagement.maxScrollPercent = pct;
        }
        [25, 50, 75, 100].forEach(function (milestone) {
          if (engagement.maxScrollPercent >= milestone && engagement.scrollMilestones.indexOf(String(milestone)) === -1) {
            engagement.scrollMilestones.push(String(milestone));
          }
        });
      });
    };

    var clickHandler = function () {
      engagement.clickCount += 1;
    };

    var interactionHandler = function (event) {
      var target = event.target;
      if (target && (target.tagName === "BUTTON" || target.tagName === "A" || target.getAttribute && target.getAttribute("role") === "button")) {
        engagement.interactionCount += 1;
      }
    };

    var submitHandler = function () {
      engagement.interactionCount += 1;
    };

    var visibilityHandler = function () {
      var now = Date.now();
      if (document.hidden) {
        if (engagement.visible) {
          engagement.totalTimeOnPage += Math.round((now - engagement.lastVisibleChange) / 1000);
          engagement.visible = false;
        }
      } else {
        engagement.visible = true;
        engagement.lastVisibleChange = now;
      }
    };

    window.addEventListener("scroll", scrollHandler, { passive: true });
    document.addEventListener("click", clickHandler, true);
    document.addEventListener("click", interactionHandler, true);
    document.addEventListener("submit", submitHandler, true);
    document.addEventListener("visibilitychange", visibilityHandler);

    cleanupFns.push(function () {
      window.removeEventListener("scroll", scrollHandler);
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("click", interactionHandler, true);
      document.removeEventListener("submit", submitHandler, true);
      document.removeEventListener("visibilitychange", visibilityHandler);
    });
  }

  function cleanupEngagement() {
    cleanupFns.forEach(function (fn) { try { fn(); } catch (_) {} });
    cleanupFns = [];
  }

  function flushEngagement(path) {
    if (!config.trackEngagement) return null;
    var now = Date.now();
    if (engagement.visible) {
      engagement.totalTimeOnPage += Math.round((now - engagement.lastVisibleChange) / 1000);
      engagement.lastVisibleChange = now;
    }
    var data = {
      totalTimeOnPage: engagement.totalTimeOnPage,
      maxScrollPercent: engagement.maxScrollPercent,
      scrollMilestones: engagement.scrollMilestones.slice(),
      clickCount: engagement.clickCount,
      interactionCount: engagement.interactionCount,
      bounces: engagement.totalTimeOnPage < 5 && engagement.clickCount === 0 ? 1 : 0
    };
    return data;
  }

  function saveEngagementToStore(path, data) {
    if (!data) return;
    var store = loadStore();
    var page = store.pages[path];
    if (!page) return;
    page.totalTimeOnPage = Number(page.totalTimeOnPage || 0) + data.totalTimeOnPage;
    page.maxScrollPercent = Math.max(Number(page.maxScrollPercent || 0), data.maxScrollPercent);
    page.scrollMilestones = Array.from(new Set([].concat(page.scrollMilestones || [], data.scrollMilestones)));
    page.clickCount = Number(page.clickCount || 0) + data.clickCount;
    page.interactionCount = Number(page.interactionCount || 0) + data.interactionCount;
    page.bounces = Number(page.bounces || 0) + data.bounces;
    page.returnVisits = Math.max(0, Number(page.views || 0) - Number(page.uniqueSessions || 0));
    page.jsErrors = Number(page.jsErrors || 0) + errorCount;
    if (lastError) page.lastError = lastError;
    store.pages[path] = page;
    saveStore(store);
  }

  /* ── Optional Neocities Totals Integration ── */
  function neocitiesRequestUrl(endpoint, site) {
    if (endpoint.indexOf("{sitename}") !== -1) {
      return endpoint.replace(/\{sitename\}/g, encodeURIComponent(site));
    }
    if (/\.json(?:[?#]|$)/i.test(endpoint)) return endpoint;
    return endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") + "sitename=" + encodeURIComponent(site);
  }

  function fetchNeocitiesInfo() {
    if (!config.trackNeocities) return;
    var site = config.neocitiesSite || config.siteId;
    var endpoint = config.neocitiesEndpoint;
    if (!site || !endpoint) {
      log("neocities totals skipped: configure neocitiesEndpoint with a same-origin or CORS-enabled API/cache URL");
      return;
    }

    fetch(neocitiesRequestUrl(endpoint, site), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (payload) {
        var info = payload && payload.info;
        if (!info && payload && Array.isArray(payload.sites)) {
          info = payload.sites.find(function (entry) {
            return entry && String(entry.siteName || entry.sitename || "").toLowerCase() === String(site).toLowerCase() && !entry.error;
          });
        }
        if (!info) throw new Error("Missing Neocities info payload");
        neocitiesData = {
          views: Number(info.views || 0),
          hits: Number(info.hits || 0),
          createdAt: info.created_at || info.createdAt || null,
          lastUpdated: info.last_updated || info.lastUpdated || null,
          domain: info.domain || null,
          tags: Array.isArray(info.tags) ? info.tags : [],
          lastFetchedAt: nowIso()
        };
        log("neocities data fetched", neocitiesData);
        var store = loadStore();
        store.meta.neocities = neocitiesData;
        saveStore(store);
      })
      .catch(function (error) {
        log("neocities totals fetch failed", error && error.message ? error.message : error);
      });
  }

  function startNeocitiesPolling() {
    if (!config.trackNeocities || !config.neocitiesEndpoint) return;
    fetchNeocitiesInfo();
    neocitiesTimer = setInterval(fetchNeocitiesInfo, 1800000);
  }

  /* ── Store Management ── */
  function loadStore() {
    var fallback = {
      meta: {
        version: 2,
        trackerVersion: VERSION,
        siteId: config.siteId,
        origin: location.origin,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        retentionDays: config.retentionDays
      },
      pages: {}
    };
    try {
      var parsed = safeParse(localStorage.getItem(config.storageKey), fallback);
      if (!parsed || typeof parsed !== "object" || !parsed.pages) return fallback;
      parsed.meta = parsed.meta || fallback.meta;
      parsed.meta.version = 2;
      parsed.meta.trackerVersion = VERSION;
      parsed.meta.siteId = config.siteId;
      parsed.meta.origin = location.origin;
      parsed.meta.retentionDays = config.retentionDays;
      return parsed;
    } catch (_) { return fallback; }
  }

  function prune(store) {
    var cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - config.retentionDays);
    var cutoffKey = cutoff.toISOString().slice(0, 10);
    Object.keys(store.pages || {}).forEach(function (path) {
      var page = store.pages[path];
      var retained = {};
      Object.keys(page.daily || {}).forEach(function (day) {
        if (day >= cutoffKey) retained[day] = Number(page.daily[day] || 0);
      });
      page.daily = retained;
    });
  }

  function saveStore(store) {
    store.meta.updatedAt = nowIso();
    prune(store);
    try { localStorage.setItem(config.storageKey, JSON.stringify(store)); }
    catch (error) {
      if (error && (error.name === "QuotaExceededError" || error.code === 22)) {
        try {
          prune(store);
          var minimal = { meta: store.meta, pages: {} };
          var paths = Object.keys(store.pages || {});
          var cutoff = new Date();
          cutoff.setUTCDate(cutoff.getUTCDate() - Math.min(config.retentionDays, 30));
          var cutoffKey = cutoff.toISOString().slice(0, 10);
          paths.forEach(function (path) {
            var page = store.pages[path];
            var recentDays = {};
            Object.keys(page.daily || {}).forEach(function (day) {
              if (day >= cutoffKey) recentDays[day] = page.daily[day];
            });
            page.daily = recentDays;
            delete page.device;
            delete page.performance;
            delete page.navigation;
            delete page.session;
            delete page.neocities;
            minimal.pages[path] = page;
          });
          localStorage.setItem(config.storageKey, JSON.stringify(minimal));
          emit("zya:imprint:error", { stage: "storage", message: "Quota exceeded; pruned to 30-day minimal snapshot." });
          return;
        } catch (_) {}
      }
      emit("zya:imprint:error", { stage: "storage", message: String(error && error.message || error) });
    }
  }

  /* ── Remote Sending ── */
  function sendRemote(payload) {
    if (!config.collector) return;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var accepted = navigator.sendBeacon(config.collector, new Blob([body], { type: "application/json" }));
        if (accepted) return;
      }
    } catch (_) {}
    try {
      fetch(config.collector, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        credentials: "omit"
      }).catch(function (error) { log("collector error", error); });
    } catch (_) {}
  }

  /* ── Main Track Function ── */
  function track(overrides) {
    overrides = overrides || {};
    var permission = canTrack();
    if (!permission.ok) {
      state.enabled = false;
      state.reason = permission.reason;
      emit("zya:imprint:blocked", { reason: permission.reason });
      return false;
    }

    var path = cleanPath(overrides.path || config.page.path || location.pathname);
    var timestamp = Date.now();
    if (path === state.lastPath && timestamp - state.lastTrackedAt < 300) return false;

    if (state.lastPath && state.lastPath !== path) {
      var flushed = flushEngagement(state.lastPath);
      saveEngagementToStore(state.lastPath, flushed);
      cleanupEngagement();
    }

    state.lastPath = path;
    state.lastTrackedAt = timestamp;
    state.enabled = true;
    state.reason = "ready";

    var title = String(overrides.title || config.page.title || document.title || path).slice(0, 200);
    var label = String(overrides.label || config.page.label || "").slice(0, 120);
    var referrer = safeReferrer();
    var fullRef = fullReferrer();
    var viewedAt = nowIso();
    var day = dayKey();
    var newSession = isNewPageSession(path);
    var dailyUnique = isDailyUnique();
    var totalUniques = dailyUnique ? incrementTotalUniques() : 0;

    var deviceInfo = collectDeviceInfo();
    var perfMetrics = collectPerformanceMetrics();
    var navInfo = collectNavigationInfo();
    var sessionInfo = getSessionInfo();

    var store = loadStore();
    var page = store.pages[path] || {
      path: path,
      title: title,
      label: label,
      views: 0,
      uniqueSessions: 0,
      firstSeen: viewedAt,
      lastSeen: viewedAt,
      lastReferrer: "",
      daily: {},
      totalTimeOnPage: 0,
      maxScrollPercent: 0,
      scrollMilestones: [],
      clickCount: 0,
      interactionCount: 0,
      bounces: 0,
      returnVisits: 0,
      jsErrors: 0
    };

    page.title = title || page.title;
    page.label = label || page.label;
    page.views = Number(page.views || 0) + 1;
    page.uniqueSessions = Number(page.uniqueSessions || 0) + (newSession ? 1 : 0);
    page.firstSeen = page.firstSeen || viewedAt;
    page.lastSeen = viewedAt;
    page.lastReferrer = referrer;
    page.returnVisits = Math.max(0, page.views - page.uniqueSessions);
    page.daily[day] = Number(page.daily[day] || 0) + 1;
    page.jsErrors = Number(page.jsErrors || 0) + errorCount;
    if (lastError) page.lastError = lastError;

    if (deviceInfo) {
      store.meta.device = deviceInfo;
      page.device = deviceInfo;
    }
    if (perfMetrics) {
      store.meta.performance = perfMetrics;
      page.performance = perfMetrics;
    }
    if (navInfo) {
      store.meta.navigation = navInfo;
      page.navigation = navInfo;
    }
    if (sessionInfo) {
      store.meta.session = sessionInfo;
      page.session = sessionInfo;
    }
    if (neocitiesData) {
      store.meta.neocities = neocitiesData;
      page.neocities = neocitiesData;
    }

    store.pages[path] = page;
    saveStore(store);

    var payload = {
      version: 2,
      eventId: randomId(),
      type: "pageview",
      siteId: config.siteId,
      origin: location.origin,
      path: path,
      title: title,
      label: label,
      referrer: referrer,
      fullReferrer: fullRef,
      referrerType: navInfo ? navInfo.referrerType : "direct",
      day: day,
      viewedAt: viewedAt,
      sessionId: sessionInfo.id,
      newSession: newSession,
      dailyUnique: dailyUnique,
      totalUniques: totalUniques,
      engagement: config.trackEngagement ? {
        totalTimeOnPage: 0,
        maxScrollPercent: 0,
        scrollMilestones: [],
        clickCount: 0,
        interactionCount: 0,
        bounces: 0
      } : undefined,
      device: deviceInfo || undefined,
      performance: perfMetrics || undefined,
      navigation: navInfo || undefined,
      session: sessionInfo || undefined,
      neocities: neocitiesData || undefined,
      errors: config.trackErrors ? {
        count: errorCount,
        lastError: lastError || undefined
      } : undefined
    };
    sendRemote(payload);
    emit("zya:imprint", payload);
    log("tracked", payload);

    setupEngagementTracking(path);
    return true;
  }

  function flushCurrentPage() {
    if (state.lastPath) {
      var flushed = flushEngagement(state.lastPath);
      if (flushed) {
        saveEngagementToStore(state.lastPath, flushed);
        if (config.collector) {
          sendRemote({
            version: 2,
            eventId: randomId(),
            type: "engagement",
            siteId: config.siteId,
            origin: location.origin,
            path: state.lastPath,
            viewedAt: nowIso(),
            engagement: flushed,
            errors: config.trackErrors ? { count: errorCount, lastError: lastError || undefined } : undefined
          });
        }
        emit("zya:imprint:engagement", { path: state.lastPath, engagement: flushed });
        log("flushed engagement", { path: state.lastPath, engagement: flushed });
      }
    }
  }

  function snapshot() { return loadStore(); }

  function exportSnapshot() {
    var blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "zya-imprint-" + config.siteId + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function clear() {
    try { localStorage.removeItem(config.storageKey); } catch (_) {}
  }

  function grantConsent() {
    try { localStorage.setItem(config.consentKey, "granted"); } catch (_) {}
    state.enabled = true;
    state.reason = "ready";
    return track();
  }

  function denyConsent() {
    try { localStorage.setItem(config.consentKey, "denied"); } catch (_) {}
    state.enabled = false;
    state.reason = "consent-denied";
  }

  function getEngagement() {
    return flushEngagement(state.lastPath);
  }

  function fetchNeocities() {
    fetchNeocitiesInfo();
    return neocitiesData;
  }

  window.zyaImprint = {
    version: VERSION,
    config: config,
    status: state,
    track: track,
    getSnapshot: snapshot,
    getEngagement: getEngagement,
    export: exportSnapshot,
    clear: clear,
    grantConsent: grantConsent,
    denyConsent: denyConsent,
    flushEngagement: flushCurrentPage,
    fetchNeocities: fetchNeocities
  };

  /* ── SPA Route Tracking ── */
  function routeTrack() {
    flushCurrentPage();
    cleanupEngagement();
    errorCount = 0;
    lastError = null;
    config.page = {};
    track({ path: location.pathname, title: document.title });
  }

  if (config.spa && window.history) {
    ["pushState", "replaceState"].forEach(function (method) {
      var original = history[method];
      if (typeof original !== "function") return;
      history[method] = function () {
        var result = original.apply(this, arguments);
        setTimeout(routeTrack, 0);
        return result;
      };
    });
    window.addEventListener("popstate", routeTrack);
  }

  /* ── Page Lifecycle Handlers ── */
  window.addEventListener("pagehide", function () {
    flushCurrentPage();
    if (neocitiesTimer) clearInterval(neocitiesTimer);
  });
  window.addEventListener("beforeunload", function () {
    flushCurrentPage();
  });

  /* ── Initialization ── */
  setupErrorTracking();
  startNeocitiesPolling();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      track();
      if (config.trackPerformance && !collectPerformanceMetrics()) {
        setTimeout(function () {
          var perf = collectPerformanceMetrics();
          if (perf) {
            var store = loadStore();
            store.meta.performance = perf;
            var page = store.pages[state.lastPath];
            if (page) { page.performance = perf; store.pages[state.lastPath] = page; }
            saveStore(store);
            log("deferred performance metrics", perf);
          }
        }, 2000);
      }
    }, { once: true });
  } else {
    track();
    if (config.trackPerformance && !collectPerformanceMetrics()) {
      setTimeout(function () {
        var perf = collectPerformanceMetrics();
        if (perf) {
          var store = loadStore();
          store.meta.performance = perf;
          var page = store.pages[state.lastPath];
          if (page) { page.performance = perf; store.pages[state.lastPath] = page; }
          saveStore(store);
          log("deferred performance metrics", perf);
        }
      }, 2000);
    }
  }
})();

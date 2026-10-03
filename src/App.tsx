import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  ChartNoAxesCombined,
  ChevronDown,
  Download,
  Gauge,
  RefreshCw,
  Trash2,
  Upload,
  WandSparkles
} from "lucide-react";
import { useAutoRefresh } from "./hooks/useAutoRefresh";
import { useDataStore } from "./hooks/useDataStore";
import { useNeocitiesFetch } from "./hooks/useNeocitiesFetch";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SkeletonPanel } from "./components/SkeletonPanel";
import { useToast } from "./components/Toast";
import {
  AUTO_REFRESH_LABELS,
  DEFAULT_SITE_LIST
} from "./constants";
import { downloadJson, formatRelativeTime, getViewsInLastNDays, normalizeSiteId } from "./utils";

const InstallLab = lazy(() => import("./components/InstallLab").then((m) => ({ default: m.InstallLab })));
const GraphVaultTab = lazy(() => import("./components/GraphVaultTab").then((m) => ({ default: m.GraphVaultTab })));
const OverviewTab = lazy(() => import("./components/OverviewTab").then((m) => ({ default: m.OverviewTab })));

type Tab = "overview" | "install" | "graphs";

export default function App() {
  const {
    pages,
    sites,
    siteSettings,
    loadData,
    saveSiteSettings,
    saveSiteHistoryStore,
    clearSiteHistory,
    clearPages,
    removePage,
    importBundle,
    mergeCollectorSummary,
    addManualPage,
    getExportBundle
  } = useDataStore();

  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [autoRefreshDropdownOpen, setAutoRefreshDropdownOpen] = useState(false);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownToggleRef = useRef<HTMLButtonElement>(null);
  const dropdownItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prefetchMap = useRef<Set<Tab>>(new Set(["overview"]));

  const { siteRefreshInFlight, lastRefreshSummary, refreshSiteWideStats: rawRefresh } = useNeocitiesFetch(siteSettings.sites, saveSiteHistoryStore);

  const refreshSiteWideStats = useCallback(async (customSites?: string[]) => {
    const summary = await rawRefresh(customSites);
    if (summary?.timestamp) setLastRefreshAt(summary.timestamp);
  }, [rawRefresh]);

  const { autoRefreshInterval, nextRefreshAt, setAutoRefresh } = useAutoRefresh(() => refreshSiteWideStats());

  const didAutoFetch = useRef(false);
  useEffect(() => {
    if (didAutoFetch.current) return;
    const hasHistory = sites.some((site) => site.history.length > 0);
    if (!hasHistory && siteSettings.sites.length > 0) {
      didAutoFetch.current = true;
      void refreshSiteWideStats();
    }
  }, [sites, siteSettings.sites, refreshSiteWideStats]);

  useEffect(() => {
    const latest = sites
      .map((site) => site.lastRefreshAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    if (latest && (!lastRefreshAt || new Date(latest).getTime() > new Date(lastRefreshAt).getTime())) {
      setLastRefreshAt(latest);
    }
  }, [sites, lastRefreshAt]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setAutoRefreshDropdownOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!autoRefreshDropdownOpen) return;
    const firstItem = dropdownItemRefs.current[0];
    if (firstItem) firstItem.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAutoRefreshDropdownOpen(false);
        dropdownToggleRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Tab") return;
      e.preventDefault();
      const items = dropdownItemRefs.current.filter(Boolean) as HTMLButtonElement[];
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        items[(currentIndex + 1) % items.length]?.focus();
      } else {
        items[(currentIndex - 1 + items.length) % items.length]?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [autoRefreshDropdownOpen]);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (!prefetchMap.current.has(tab)) {
      prefetchMap.current.add(tab);
      if (tab === "install") void import("./components/InstallLab");
      else if (tab === "graphs") void import("./components/GraphVaultTab");
      else if (tab === "overview") void import("./components/OverviewTab");
    }
  }, []);

  useEffect(() => {
    const onQuota = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setQuotaWarning(`Storage quota exceeded for "${detail?.key || "localStorage"}". Older entries were pruned to make room.`);
    };
    window.addEventListener("zya:storage:quota", onQuota);
    return () => window.removeEventListener("zya:storage:quota", onQuota);
  }, []);

  const localSummary = useMemo(() => ({
    trackedPages: pages.length,
    trackedOrigins: new Set(pages.map((page) => page.siteId)).size,
    totalViews: pages.reduce((sum, page) => sum + Number(page.views || 0), 0),
    todayViews: pages.reduce((sum, page) => sum + getViewsInLastNDays(page, 1), 0),
    weekViews: pages.reduce((sum, page) => sum + getViewsInLastNDays(page, 7), 0),
    uniqueSessions: pages.reduce((sum, page) => sum + Number(page.uniqueSessions || 0), 0),
    totalTimeOnPage: pages.reduce((sum, page) => sum + Number(page.totalTimeOnPage || 0), 0),
    totalClicks: pages.reduce((sum, page) => sum + Number(page.clickCount || 0), 0),
    totalInteractions: pages.reduce((sum, page) => sum + Number(page.interactionCount || 0), 0),
    totalBounces: pages.reduce((sum, page) => sum + Number(page.bounces || 0), 0),
    totalJsErrors: pages.reduce((sum, page) => sum + Number(page.jsErrors || 0), 0),
    avgScrollDepth: pages.length ? Math.round(pages.reduce((sum, page) => sum + Number(page.maxScrollPercent || 0), 0) / pages.length) : 0,
    avgTimeOnPage: pages.length ? Math.round(pages.reduce((sum, page) => sum + Number(page.totalTimeOnPage || 0), 0) / pages.length) : 0,
    bounceRate: pages.length ? Math.round((pages.reduce((sum, page) => sum + Number(page.bounces || 0), 0) / pages.reduce((sum, page) => sum + Number(page.views || 0), 1)) * 100) : 0
  }), [pages]);

  const siteSummary = useMemo(() => ({
    trackedSites: sites.length,
    totalViews: sites.reduce((sum, site) => sum + site.views, 0),
    totalHits: sites.reduce((sum, site) => sum + site.hits, 0),
    deltaViews: sites.reduce((sum, site) => sum + site.deltaViews, 0),
    deltaHits: sites.reduce((sum, site) => sum + site.deltaHits, 0)
  }), [sites]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const count = importBundle(payload);
      toast(`Imported or refreshed ${count} page snapshot${count === 1 ? "" : "s"} without double-counting.`, "success");
    } catch (error) {
      toast(`Import rejected: ${error instanceof Error ? error.message : "invalid JSON"}`, "error");
    } finally {
      event.target.value = "";
    }
  };

  const autoRefreshText = useMemo(() => autoRefreshInterval === "off"
    ? "Auto-refresh off"
    : `${AUTO_REFRESH_LABELS[autoRefreshInterval]}${nextRefreshAt ? ` · next ${new Date(nextRefreshAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`, [autoRefreshInterval, nextRefreshAt]);

  const orbitSourceText = lastRefreshSummary?.source === "live-api"
    ? "Orbit source: live API"
    : lastRefreshSummary?.source === "mixed"
      ? "Orbit source: live + cache"
      : lastRefreshSummary?.source === "static-cache"
        ? "Orbit source: static cache"
        : null;

  const tabs: { id: Tab; label: string; icon: typeof Gauge }[] = [
    { id: "overview", label: "Signal Overview", icon: Gauge },
    { id: "install", label: "Imprint Lab", icon: WandSparkles },
    { id: "graphs", label: "Graph Vault", icon: ChartNoAxesCombined }
  ];

  return (
    <div className="min-h-screen">
      <header className="top-shell sticky top-0 z-40">
        <div className="mx-auto max-w-[1540px] px-4 py-4 md:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="brand-sigil" aria-hidden="true"><span>Z</span></div>
              <div className="min-w-0">
                <p className="eyebrow">DEFFY // ZYA SYSTEMS</p>
                <h1 className="brand-title">IMPRINT SIGNAL VAULT</h1>
                <p className="mt-1 text-sm text-slate-300">First-party page pulses + public Neocities orbit totals. No fingerprint sludge.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="split-button" ref={dropdownRef}>
                <button className="cosmo-btn cosmo-btn-primary split-button-main rounded-2xl px-4 py-2.5 text-sm font-bold" onClick={() => refreshSiteWideStats()} disabled={siteRefreshInFlight}>
                  <RefreshCw size={16} className={siteRefreshInFlight ? "animate-spin" : ""} />
                  {siteRefreshInFlight ? "Pulling…" : "Refresh orbit"}
                </button>
                <button ref={dropdownToggleRef} className="cosmo-btn cosmo-btn-primary split-button-toggle rounded-2xl" onClick={() => setAutoRefreshDropdownOpen((open) => !open)} aria-label="Auto-refresh options" aria-expanded={autoRefreshDropdownOpen} aria-haspopup="menu">
                  <ChevronDown size={16} className={autoRefreshDropdownOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
                <div className={`dropdown-menu ${autoRefreshDropdownOpen ? "is-open" : ""}`} role="menu" aria-label="Auto-refresh interval">
                  {Object.entries(AUTO_REFRESH_LABELS).map(([key, label], idx) => (
                    <button key={key} ref={(el) => { dropdownItemRefs.current[idx] = el; }} className={`dropdown-item ${key === autoRefreshInterval ? "is-active" : ""}`} role="menuitem" onClick={() => { setAutoRefresh(key); setAutoRefreshDropdownOpen(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button className="cosmo-btn rounded-2xl px-3.5 py-2.5 text-sm font-semibold" onClick={() => { downloadJson(`zya-signal-vault-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, getExportBundle()); toast("Export downloaded.", "success"); }}>
                <Download size={16} /> Export
              </button>
              <label className="cosmo-btn cursor-pointer rounded-2xl px-3.5 py-2.5 text-sm font-semibold">
                <Upload size={16} /> Import
                <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
              </label>
              <button className="cosmo-btn cosmo-btn-danger rounded-2xl px-3.5 py-2.5 text-sm font-semibold" onClick={() => { if (window.confirm("Clear all page snapshots stored by this dashboard?")) { clearPages(); toast("All page snapshots cleared.", "success"); } }}>
                <Trash2 size={16} /> Clear pages
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap gap-2" aria-label="Dashboard views" role="tablist">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} id={`tab-${id}`} role="tab" aria-selected={activeTab === id} aria-controls={`tabpanel-${id}`} className={`cosmo-tab rounded-2xl px-4 py-2.5 text-sm font-bold ${activeTab === id ? "is-active" : ""}`} onClick={() => handleTabChange(id)} onMouseEnter={() => { if (!prefetchMap.current.has(id)) { prefetchMap.current.add(id); if (id === "install") void import("./components/InstallLab"); else if (id === "graphs") void import("./components/GraphVaultTab"); else if (id === "overview") void import("./components/OverviewTab"); } }}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="status-dot"><i /> Local-first mode active.</span>
              <span>{autoRefreshText}</span>
              {orbitSourceText && <span>{orbitSourceText}</span>}
              {lastRefreshAt && <span title={new Date(lastRefreshAt).toLocaleString()}>Data snapshot {formatRelativeTime(lastRefreshAt)}</span>}
            </div>
          </div>
        </div>
      </header>

      {quotaWarning && (
        <div className="mx-auto max-w-[1540px] px-4 pt-4 md:px-6" role="alert" aria-live="polite">
          <div className="flex items-center gap-3 rounded-2xl border border-gold-300/40 bg-gold-300/10 p-4 text-sm text-gold-300">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <span className="flex-1">{quotaWarning}</span>
            <button className="cosmo-btn rounded-xl px-3 py-1.5 text-xs font-bold" onClick={() => setQuotaWarning(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1540px] px-4 py-6 md:px-6">
        <div key={activeTab} className="animate-fade-in" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === "overview" && (
          <ErrorBoundary label="Signal Overview">
          <Suspense fallback={<SkeletonPanel height="500px" label="Loading Signal Overview…" />}>
          <OverviewTab
            pages={pages}
            sites={sites}
            siteSettings={siteSettings}
            localSummary={localSummary}
            siteSummary={siteSummary}
            onSaveSiteList={(list: string[]) => {
              const cleaned = [...new Set(list.map((site) => normalizeSiteId(site, "")).filter(Boolean))];
              saveSiteSettings({ sites: cleaned });
              toast("Saved orbit list; pulling fresh totals.", "info");
              void refreshSiteWideStats(cleaned);
            }}
            onResetSiteList={() => {
              saveSiteSettings({ sites: DEFAULT_SITE_LIST });
              void refreshSiteWideStats(DEFAULT_SITE_LIST);
            }}
            onClearSiteHistory={() => { clearSiteHistory(); toast("Neocities history cleared.", "success"); }}
            onRemovePage={(key: string) => { removePage(key); toast("Page snapshot removed.", "success"); }}
          />
          </Suspense>
          </ErrorBoundary>
        )}
        {activeTab === "install" && (
          <ErrorBoundary label="Imprint Lab">
          <Suspense fallback={<SkeletonPanel height="600px" label="Loading Imprint Lab…" />}>
          <InstallLab
            onAddManualPage={(page) => {
              const saved = addManualPage(page);
              toast(`Linked ${saved.siteId}${saved.path} as a zero-count manual snapshot.`, "success");
              loadData();
            }}
            onCollectorSummary={(summary) => {
              const count = mergeCollectorSummary(summary);
              toast(`Synced ${count} collector page snapshot${count === 1 ? "" : "s"}.`, "success");
              return count;
            }}
          />
          </Suspense>
          </ErrorBoundary>
        )}
        {activeTab === "graphs" && (
          <ErrorBoundary label="Graph Vault">
          <Suspense fallback={<SkeletonPanel height="500px" label="Loading Graph Vault…" />}>
            <GraphVaultTab pages={pages} sites={sites} />
          </Suspense>
          </ErrorBoundary>
        )}
        </div>
      </main>

      <footer className="mx-auto max-w-[1540px] px-4 py-6 md:px-6">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-white/8 pt-5 text-xs text-slate-500 sm:flex-row">
          <span>ZYA Imprint Signal Vault v3 — DEFFY // ZYA SYSTEMS</span>
          <span>Privacy-first. No fingerprinting. No visitor-level data sent to third parties.</span>
        </div>
      </footer>
    </div>
  );
}

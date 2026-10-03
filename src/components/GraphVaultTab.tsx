import { useMemo, useState } from "react";
import { BarChart3, Globe, LineChart, Search } from "lucide-react";
import type { PageRecord, SiteRecord } from "../types";
import { formatDuration, formatNumber, getSiteDisplayDomain, type DateRangeKey } from "../utils";
import { useDebounce } from "../hooks/useDebounce";
import { ChartToolbar, useChartToolbarState } from "./ChartToolbar";
import { LazyChart as CosmoChart } from "./LazyChart";

function PageGraphCard({ page, chartType, dateRange }: { page: PageRecord; chartType: "line" | "area"; dateRange: DateRangeKey }) {
  const chartData = useMemo(
    () => Object.entries(page.daily || {}).sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ name: day, views: Number(count || 0) })),
    [page]
  );
  return (
    <article className="graph-card glass-panel rounded-[28px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{page.siteId} // {page.source}</p>
          <h4 className="mt-2 break-words font-black text-white">{page.title || page.path}</h4>
          <p className="mono mt-1 break-all text-xs text-slate-400">{page.path}</p>
        </div>
        <span className="mode-badge">{formatNumber(page.views)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="cosmo-chip rounded-full px-2 py-0.5">⏱ {formatDuration(page.totalTimeOnPage || 0)}</span>
        <span className="cosmo-chip rounded-full px-2 py-0.5">↓ {page.maxScrollPercent || 0}%</span>
        <span className="cosmo-chip rounded-full px-2 py-0.5">⊕ {formatNumber(page.clickCount || 0)}</span>
        {page.jsErrors ? <span className="cosmo-chip rounded-full px-2 py-0.5 text-red-300">⚠ {page.jsErrors}</span> : null}
      </div>
      <div className="mt-4 h-[230px]">
        <CosmoChart data={chartData} lines={[{ key: "views", color: "#ff69b4", name: "Views" }]} chartType={chartType} dateRange={dateRange} />
      </div>
    </article>
  );
}

function SiteGraphCard({ site, chartType, dateRange }: { site: SiteRecord; chartType: "line" | "area"; dateRange: DateRangeKey }) {
  const chartData = useMemo(
    () => site.history.map((entry) => ({ name: entry.timestamp.slice(0, 10), views: entry.views, hits: entry.hits })),
    [site]
  );
  return (
    <article className="graph-card glass-panel rounded-[28px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">NEOCITIES SITE</p>
          <h4 className="mt-2 font-black text-white">{site.siteName}</h4>
          <p className="mono mt-1 text-xs text-slate-400">{getSiteDisplayDomain(site.siteName, site.domain)}</p>
        </div>
        <span className="mode-badge">{formatNumber(site.views)}</span>
      </div>
      <div className="mt-4 h-[230px]">
        <CosmoChart data={chartData} lines={[{ key: "views", color: "#6a0dad", name: "Views" }, { key: "hits", color: "#ffd700", name: "Hits" }]} chartType={chartType} dateRange={dateRange} />
      </div>
    </article>
  );
}

export function GraphVaultTab({ pages, sites }: { pages: PageRecord[]; sites: SiteRecord[] }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"pages" | "sites">("pages");
  const debouncedSearch = useDebounce(search);
  const { dateRange, setDateRange, chartType, setChartType } = useChartToolbarState();

  const filteredPages = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return pages.filter((page) => !term || [page.siteId, page.path, page.title, page.label].join(" ").toLowerCase().includes(term));
  }, [debouncedSearch, pages]);

  const filteredSites = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return sites.filter((site) => !term || [site.siteName, site.domain].join(" ").toLowerCase().includes(term));
  }, [debouncedSearch, sites]);

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[32px] p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-violet-300">
            <LineChart size={22} />
            <div>
              <p className="eyebrow">GRAPH VAULT</p>
              <h2 className="section-title mt-2">Every pulse, side by side.</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Page curves use daily ZYA Imprint aggregates. Site curves use public cumulative Neocities totals captured at each refresh.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ChartToolbar dateRange={dateRange} onDateRangeChange={setDateRange} chartType={chartType} onChartTypeChange={setChartType} />
            <div className="flex gap-2" role="group" aria-label="Graph view">
              <button className={`cosmo-tab rounded-2xl px-4 py-2.5 text-sm font-bold ${view === "pages" ? "is-active" : ""}`} onClick={() => setView("pages")} aria-pressed={view === "pages"}>Page curves</button>
              <button className={`cosmo-tab rounded-2xl px-4 py-2.5 text-sm font-bold ${view === "sites" ? "is-active" : ""}`} onClick={() => setView("sites")} aria-pressed={view === "sites"}>Site curves</button>
            </div>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className="cosmo-input rounded-2xl py-2.5 pl-10 pr-4" placeholder={view === "pages" ? "Search pages…" : "Search sites…"} aria-label="Search graphs" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {view === "pages" && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">PAGE NEBULA</p>
              <h3 className="mt-2 text-2xl font-black text-white">{filteredPages.length} imprint curves</h3>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredPages.length ? filteredPages.map((page) => <PageGraphCard key={page.key} page={page} chartType={chartType} dateRange={dateRange} />) : <div className="empty-state col-span-full"><BarChart3 size={32} className="mx-auto mb-3 opacity-30" /><p>{pages.length ? "No page graphs match your search." : "No page signals yet. Install the tracker or import a snapshot to see graphs."}</p></div>}
          </div>
        </section>
      )}

      {view === "sites" && (
        <section>
          <div className="mb-4">
            <p className="eyebrow">ORBIT CONSTELLATION</p>
            <h3 className="mt-2 text-2xl font-black text-white">{filteredSites.length} public-total curves</h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredSites.length ? filteredSites.map((site) => <SiteGraphCard key={site.siteName} site={site} chartType={chartType} dateRange={dateRange} />) : <div className="empty-state col-span-full"><Globe size={32} className="mx-auto mb-3 opacity-30" /><p>{sites.length ? "No site graphs match your search." : "No Neocities sites configured. Add sites in Signal Overview to see graphs."}</p></div>}
          </div>
        </section>
      )}
    </div>
  );
}

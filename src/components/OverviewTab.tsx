import { useEffect, useMemo, useState } from "react";
import { Database, Eraser, GitCompare, Globe2, HardDrive, RadioTower } from "lucide-react";
import { DEFAULT_SITE_LIST } from "../constants";
import { useDebounce } from "../hooks/useDebounce";
import type { LocalSummary, PageRecord, SiteRecord, SiteSummary } from "../types";
import { createSorter, getViewsInLastNDays } from "../utils";
import { CompareModal } from "./CompareModal";
import { LocalDetail } from "./LocalDetail";
import { LocalTable } from "./LocalTable";
import { SiteDetail } from "./SiteDetail";
import { SiteTable } from "./SiteTable";
import { SummaryCards } from "./SummaryCards";

interface OverviewTabProps {
  pages: PageRecord[];
  sites: SiteRecord[];
  siteSettings: { sites: string[] };
  localSummary: LocalSummary;
  siteSummary: SiteSummary;
  onSaveSiteList: (sites: string[]) => void;
  onResetSiteList: () => void;
  onClearSiteHistory: () => void;
  onRemovePage: (key: string) => void;
}

export function OverviewTab({ pages, sites, siteSettings, localSummary, siteSummary, onSaveSiteList, onResetSiteList, onClearSiteHistory, onRemovePage }: OverviewTabProps) {
  const [localSearch, setLocalSearch] = useState("");
  const [localSort, setLocalSort] = useState("views-desc");
  const [siteSearch, setSiteSearch] = useState("");
  const [siteSort, setSiteSort] = useState("views-desc");
  const [selectedPageKey, setSelectedPageKey] = useState<string | null>(pages[0]?.key || null);
  const [selectedSiteName, setSelectedSiteName] = useState<string | null>(sites[0]?.siteName || null);
  const [siteListInput, setSiteListInput] = useState(siteSettings.sites.join("\n"));
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    if (selectedPageKey && !pages.some((p) => p.key === selectedPageKey)) {
      setSelectedPageKey(pages[0]?.key || null);
    } else if (!selectedPageKey && pages.length) {
      setSelectedPageKey(pages[0].key);
    }
  }, [pages, selectedPageKey]);

  useEffect(() => {
    if (selectedSiteName && !sites.some((s) => s.siteName === selectedSiteName)) {
      setSelectedSiteName(sites[0]?.siteName || null);
    } else if (!selectedSiteName && sites.length) {
      setSelectedSiteName(sites[0].siteName);
    }
  }, [sites, selectedSiteName]);

  const debouncedLocalSearch = useDebounce(localSearch);
  const debouncedSiteSearch = useDebounce(siteSearch);

  useEffect(() => setSiteListInput(siteSettings.sites.join("\n")), [siteSettings.sites]);

  const sortPages = useMemo(() => createSorter<PageRecord>((page, key) => {
    if (key === "site") return page.siteId;
    if (key === "path") return page.path;
    if (key === "title") return page.title;
    if (key === "source") return page.source;
    if (key === "sessions") return page.uniqueSessions;
    if (key === "today") return getViewsInLastNDays(page, 1);
    if (key === "week") return getViewsInLastNDays(page, 7);
    if (key === "time") return Number(page.totalTimeOnPage || 0);
    if (key === "scroll") return Number(page.maxScrollPercent || 0);
    if (key === "clicks") return Number(page.clickCount || 0);
    if (key === "lastSeen") return new Date(page.lastSeen || 0).getTime();
    return page.views;
  }), []);

  const filteredPages = useMemo(() => {
    const term = debouncedLocalSearch.trim().toLowerCase();
    const list = pages.filter((page) => !term || [page.siteId, page.origin, page.path, page.title, page.label, page.source, page.lastReferrer].join(" ").toLowerCase().includes(term));
    return sortPages(list, localSort);
  }, [debouncedLocalSearch, localSort, pages, sortPages]);

  const sortSites = useMemo(() => createSorter<SiteRecord>((site, key) => {
    if (key === "name") return site.siteName;
    if (key === "hits") return site.hits;
    if (key === "growth") return site.growthRate;
    if (key === "delta") return site.deltaViews;
    if (key === "updated") return new Date(site.lastUpdated || 0).getTime();
    return site.views;
  }), []);

  const filteredSites = useMemo(() => {
    const term = debouncedSiteSearch.trim().toLowerCase();
    const list = sites.filter((site) => !term || [site.siteName, site.domain, site.tags.join(" "), site.error].join(" ").toLowerCase().includes(term));
    return sortSites(list, siteSort);
  }, [debouncedSiteSearch, siteSort, sites, sortSites]);

  const handleLocalSort = (key: string) => {
    const [currentKey, currentDir] = localSort.split("-");
    if (currentKey === key) {
      setLocalSort(`${key}-${currentDir === "desc" ? "asc" : "desc"}`);
    } else {
      setLocalSort(`${key}-desc`);
    }
  };

  const handleSiteSort = (key: string) => {
    const [currentKey, currentDir] = siteSort.split("-");
    if (currentKey === key) {
      setSiteSort(`${key}-${currentDir === "desc" ? "asc" : "desc"}`);
    } else {
      setSiteSort(`${key}-desc`);
    }
  };

  const selectedPage = filteredPages.find((page) => page.key === selectedPageKey) || filteredPages[0] || null;
  const selectedSite = filteredSites.find((site) => site.siteName === selectedSiteName) || filteredSites[0] || null;
  const sourceCounts = useMemo(() => pages.reduce<Record<string, number>>((acc, page) => { acc[page.source] = (acc[page.source] || 0) + 1; return acc; }, {}), [pages]);

  return (
    <div className="space-y-6">
      {showCompare && <CompareModal pages={pages} onClose={() => setShowCompare(false)} />}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel signal-overview rounded-[28px] p-5"><HardDrive size={22} /><div><p className="eyebrow">LOCAL ORIGIN</p><h2>{sourceCounts.local || 0}</h2><span>pages visible directly on this browser origin</span></div></div>
        <div className="glass-panel signal-overview rounded-[28px] p-5"><Database size={22} /><div><p className="eyebrow">SNAPSHOT ARCHIVE</p><h2>{(sourceCounts.import || 0) + (sourceCounts.legacy || 0) + (sourceCounts.manual || 0)}</h2><span>imported, legacy, or verified page records</span></div></div>
        <div className="glass-panel signal-overview rounded-[28px] p-5"><RadioTower size={22} /><div><p className="eyebrow">COLLECTOR CACHE</p><h2>{sourceCounts.collector || 0}</h2><span>remote aggregate snapshots synced into this vault</span></div></div>
      </section>

      <SummaryCards localSummary={localSummary} siteSummary={siteSummary} />

      <section className="glass-panel overflow-hidden rounded-[32px]">
        <div className="panel-heading">
          <div><p className="eyebrow">PAGE SIGNALS</p><h2 className="mt-2 text-2xl font-black text-white">Multi-origin imprint archive</h2><p className="mt-2 text-sm text-slate-300">Keys are now <code className="inline-code">siteId::path</code>, so identical paths on different sites no longer collide.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row"><input className="cosmo-input rounded-2xl px-4 py-2.5" placeholder="Search site, path, source…" aria-label="Search page signals" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} /><select className="cosmo-select rounded-2xl px-4 py-2.5" aria-label="Sort page signals" value={localSort} onChange={(event) => setLocalSort(event.target.value)}><option value="views-desc">Views ↓</option><option value="today-desc">Today ↓</option><option value="week-desc">7 days ↓</option><option value="sessions-desc">Sessions ↓</option><option value="time-desc">Time on page ↓</option><option value="scroll-desc">Scroll depth ↓</option><option value="clicks-desc">Clicks ↓</option><option value="source-asc">Source A→Z</option><option value="lastSeen-desc">Recent ↓</option><option value="site-asc">Site A→Z</option><option value="path-asc">Path A→Z</option><option value="title-asc">Title A→Z</option></select><button className="cosmo-btn rounded-2xl px-4 py-2.5 text-sm font-bold" onClick={() => setShowCompare(true)} disabled={!pages.length}><GitCompare size={15} /> Compare</button></div>
        </div>
        <div className="grid 2xl:grid-cols-[1.1fr_0.9fr]">
          <LocalTable pages={filteredPages} selectedKey={selectedPage?.key || null} onSelect={setSelectedPageKey} sortKey={localSort} onSort={handleLocalSort} />
          <div className="p-4 md:p-5"><LocalDetail page={selectedPage} onRemove={selectedPage && ["import", "collector", "manual"].includes(selectedPage.source) ? () => onRemovePage(selectedPage.key) : undefined} /></div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-violet-300"><Globe2 size={20} /><p className="eyebrow">NEOCITIES ORBIT</p></div><h2 className="mt-3 text-2xl font-black text-white">Public pull list</h2><p className="mt-2 text-sm leading-6 text-slate-300">One sitename per line. These are public cumulative totals—not visitor-level data. Static deployments can load only sites included in the deployed build cache.</p></div><span className="mode-badge">{siteSettings.sites.length} SITES</span></div>
          <textarea className="cosmo-textarea mono mt-5 min-h-[250px] w-full rounded-3xl p-4" aria-label="Neocities site list, one per line" value={siteListInput} onChange={(event) => setSiteListInput(event.target.value)} />
          <div className="mt-4 flex flex-wrap gap-2"><button className="cosmo-btn cosmo-btn-primary rounded-2xl px-4 py-2.5 text-sm font-bold" onClick={() => onSaveSiteList(siteListInput.split(/\r?\n/))}>Save + pull</button><button className="cosmo-btn rounded-2xl px-4 py-2.5 text-sm font-bold" onClick={() => { setSiteListInput(DEFAULT_SITE_LIST.join("\n")); onResetSiteList(); }}>Reset defaults</button><button className="cosmo-btn cosmo-btn-warn rounded-2xl px-4 py-2.5 text-sm font-bold" onClick={() => window.confirm("Clear local Neocities history curves?") && onClearSiteHistory()}><Eraser size={15} /> Clear history</button></div>
        </div>

        <div className="glass-panel overflow-hidden rounded-[30px]">
          <div className="panel-heading"><div><p className="eyebrow">PUBLIC TOTALS</p><h2 className="mt-2 text-2xl font-black text-white">Neocities orbit ledger</h2><p className="mt-2 text-sm text-slate-300">Public cumulative totals from the live Node API or the same-origin static build cache.</p></div><div className="flex flex-col gap-3 sm:flex-row"><input className="cosmo-input rounded-2xl px-4 py-2.5" placeholder="Search sites…" aria-label="Search Neocities sites" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} /><select className="cosmo-select rounded-2xl px-4 py-2.5" aria-label="Sort Neocities sites" value={siteSort} onChange={(event) => setSiteSort(event.target.value)}><option value="views-desc">Views ↓</option><option value="hits-desc">Hits ↓</option><option value="delta-desc">Δ views ↓</option><option value="growth-desc">Growth ↓</option><option value="updated-desc">Updated ↓</option><option value="name-asc">Name A→Z</option></select></div></div>
          <div className="grid 2xl:grid-cols-[1.08fr_0.92fr]"><SiteTable sites={filteredSites} selectedSiteName={selectedSite?.siteName || null} onSelect={setSelectedSiteName} sortKey={siteSort} onSort={handleSiteSort} /><div className="p-4 md:p-5"><SiteDetail site={selectedSite} /></div></div>
        </div>
      </section>
    </div>
  );
}

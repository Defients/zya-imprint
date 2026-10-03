import { useMemo } from "react";
import { ExternalLink, Globe } from "lucide-react";
import type { SiteRecord } from "../types";
import { formatDateTime, formatNumber, formatRelativeDate, getSiteDisplayDomain } from "../utils";
import { ChartToolbar, useChartToolbarState } from "./ChartToolbar";
import { LazyChart as CosmoChart } from "./LazyChart";

export function SiteDetail({ site }: { site: SiteRecord | null }) {
  const { dateRange, setDateRange, chartType, setChartType } = useChartToolbarState();
  const chartData = useMemo(() => site ? site.history.map((entry) => ({ name: entry.timestamp.slice(0, 10), views: entry.views, hits: entry.hits })) : [], [site]);
  if (!site) return <div className="empty-state"><Globe size={32} className="mx-auto mb-3 opacity-30" /><p>Select a Neocities site to inspect its public history.</p></div>;
  const domain = getSiteDisplayDomain(site.siteName, site.domain);
  const latestPoint = site.history.at(-1);
  const statusLabel = site.error ? site.error : latestPoint?.stale ? "Retained cache" : latestPoint?.source === "static-cache" ? "Cached snapshot" : "Live snapshot";
  const href = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;

  return (
    <div className="detail-panel rounded-3xl p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">SELECTED SITE</p><h3 className="mt-2 text-2xl font-black text-white">{site.siteName}</h3><p className="mono mt-2 break-all text-sm text-slate-400">{domain}</p></div><a className="cosmo-btn rounded-2xl px-3 py-2 text-sm font-bold" href={href} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Visit</a></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><div className="stat-tile"><span>Views</span><strong className="text-violet-300">{formatNumber(site.views)}</strong></div><div className="stat-tile"><span>Hits</span><strong className="text-gold-300">{formatNumber(site.hits)}</strong></div><div className="stat-tile"><span>Δ views</span><strong className={site.deltaViews >= 0 ? "text-emerald-300" : "text-red-300"}>{site.deltaViews > 0 ? "+" : ""}{formatNumber(site.deltaViews)}</strong></div><div className="stat-tile"><span>Points</span><strong className="text-pink-300">{formatNumber(site.history.length)}</strong></div></div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="eyebrow">HISTORY</p>
        <ChartToolbar dateRange={dateRange} onDateRangeChange={setDateRange} chartType={chartType} onChartTypeChange={setChartType} />
      </div>
      <div className="mt-2 h-[260px] rounded-3xl border border-white/8 bg-black/20 p-3"><CosmoChart data={chartData} lines={[{ key: "views", color: "#6a0dad", name: "Views" }, { key: "hits", color: "#ffd700", name: "Hits" }]} chartType={chartType} dateRange={dateRange} /></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="meta-tile"><span>Created</span><strong>{formatRelativeDate(site.createdAt)}</strong></div><div className="meta-tile"><span>Updated</span><strong>{formatRelativeDate(site.lastUpdated)}</strong></div><div className="meta-tile"><span>Status</span><strong className={site.error || latestPoint?.stale ? "text-gold-300" : latestPoint?.source === "static-cache" ? "text-violet-300" : "text-emerald-300"}>{statusLabel}</strong></div></div>
      {site.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{site.tags.map((tag) => <span key={tag} className="cosmo-chip rounded-full px-3 py-1 text-xs">{tag}</span>)}</div>}
    </div>
  );
}

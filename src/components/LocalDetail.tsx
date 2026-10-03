import { useMemo } from "react";
import { ExternalLink, MousePointerClick, Trash2 } from "lucide-react";
import type { PageRecord } from "../types";
import { formatDateTime, formatDuration, formatNumber, formatRelativeTime, getViewsInLastNDays } from "../utils";
import { ChartToolbar, useChartToolbarState } from "./ChartToolbar";
import { LazyChart as CosmoChart } from "./LazyChart";

interface LocalDetailProps {
  page: PageRecord | null;
  onRemove?: () => void;
}

export function LocalDetail({ page, onRemove }: LocalDetailProps) {
  const chartData = useMemo(() => page ? Object.entries(page.daily || {}).sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ name: day, views: Number(count || 0) })) : [], [page]);
  const { dateRange, setDateRange, chartType, setChartType } = useChartToolbarState();

  if (!page) return <div className="empty-state"><MousePointerClick size={32} className="mx-auto mb-3 opacity-30" /><p>Select a page signal to inspect it.</p></div>;
  const pageUrl = page.origin ? `${page.origin}${page.path}` : "";
  const device = page.device;
  const perf = page.performance;
  const nav = page.navigation;
  const session = page.session;
  const neocities = page.neocities;
  const error = page.lastError;

  return (
    <div className="detail-panel rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="eyebrow">SELECTED PAGE</p><h3 className="mt-2 break-words text-2xl font-black text-white">{page.title || page.path}</h3><p className="mt-2 font-bold text-pink-300">{page.siteId}</p><p className="mono mt-1 break-all text-sm text-slate-400">{page.path}</p></div>
        <div className="flex gap-2">{pageUrl && <a className="cosmo-btn rounded-2xl px-3 py-2 text-sm font-bold" href={pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open</a>}{onRemove && <button className="cosmo-btn cosmo-btn-danger rounded-2xl px-3 py-2 text-sm font-bold" onClick={onRemove}><Trash2 size={15} /> Remove</button>}</div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-tile"><span>Views</span><strong className="text-pink-300">{formatNumber(page.views)}</strong></div>
        <div className="stat-tile"><span>Today</span><strong className="text-gold-300">{formatNumber(getViewsInLastNDays(page, 1))}</strong></div>
        <div className="stat-tile"><span>7-day</span><strong className="text-violet-300">{formatNumber(getViewsInLastNDays(page, 7))}</strong></div>
        <div className="stat-tile"><span>Sessions</span><strong className="text-red-300">{formatNumber(page.uniqueSessions)}</strong></div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-tile"><span>Time on page</span><strong className="text-emerald-300">{formatDuration(page.totalTimeOnPage || 0)}</strong></div>
        <div className="stat-tile"><span>Max scroll</span><strong className="text-violet-300">{page.maxScrollPercent || 0}%</strong></div>
        <div className="stat-tile"><span>Clicks</span><strong className="text-cyan-300">{formatNumber(page.clickCount || 0)}</strong></div>
        <div className="stat-tile"><span>Interactions</span><strong className="text-pink-300">{formatNumber(page.interactionCount || 0)}</strong></div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-tile"><span>Bounces</span><strong className="text-red-300">{formatNumber(page.bounces || 0)}</strong></div>
        <div className="stat-tile"><span>Return visits</span><strong className="text-gold-300">{formatNumber(page.returnVisits || 0)}</strong></div>
        <div className="stat-tile"><span>JS errors</span><strong className={page.jsErrors ? "text-red-300" : "text-slate-400"}>{formatNumber(page.jsErrors || 0)}</strong></div>
        <div className="stat-tile"><span>Scroll milestones</span><strong className="text-violet-300">{page.scrollMilestones?.join(", ") || "—"}</strong></div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="eyebrow">DAILY VIEWS</p>
        <ChartToolbar dateRange={dateRange} onDateRangeChange={setDateRange} chartType={chartType} onChartTypeChange={setChartType} />
      </div>
      <div className="mt-2 h-[260px] rounded-3xl border border-white/8 bg-black/20 p-3"><CosmoChart data={chartData} lines={[{ key: "views", color: "#ff69b4", name: "Views" }]} chartType={chartType} dateRange={dateRange} /></div>

      <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="meta-tile"><span>Source</span><strong>{page.source}</strong></div><div className="meta-tile"><span>Origin</span><strong className="break-all">{page.origin || "Unknown/imported"}</strong></div><div className="meta-tile"><span>First seen</span><strong>{formatRelativeTime(page.firstSeen)}</strong></div><div className="meta-tile"><span>Last referrer</span><strong className="break-all">{page.lastReferrer || "—"}</strong></div></div>

      {nav && (
        <div className="mt-4">
          <p className="eyebrow mb-2">NAVIGATION</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="meta-tile"><span>Referrer type</span><strong>{nav.referrerType}</strong></div>
            <div className="meta-tile"><span>Entry type</span><strong>{nav.entryType}</strong></div>
            <div className="meta-tile"><span>Redirects</span><strong>{nav.redirectCount}</strong></div>
          </div>
          {nav.referrer && <div className="meta-tile mt-3"><span>Full referrer</span><strong className="break-all text-xs">{nav.referrer}</strong></div>}
        </div>
      )}

      {device && (
        <div className="mt-4">
          <p className="eyebrow mb-2">DEVICE & ENVIRONMENT</p>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <div className="meta-tile"><span>Platform</span><strong>{device.platform || "—"}</strong></div>
            <div className="meta-tile"><span>Screen</span><strong>{device.screenWidth}×{device.screenHeight}</strong></div>
            <div className="meta-tile"><span>Viewport</span><strong>{device.viewportWidth}×{device.viewportHeight}</strong></div>
            <div className="meta-tile"><span>Color depth</span><strong>{device.colorDepth}-bit</strong></div>
            <div className="meta-tile"><span>Pixel ratio</span><strong>{device.pixelRatio}x</strong></div>
            <div className="meta-tile"><span>CPU cores</span><strong>{device.hardwareConcurrency ?? "—"}</strong></div>
            <div className="meta-tile"><span>Device memory</span><strong>{device.deviceMemory ? `${device.deviceMemory} GB` : "—"}</strong></div>
            <div className="meta-tile"><span>Touch</span><strong>{device.touch ? "Yes" : "No"}</strong></div>
            <div className="meta-tile"><span>Language</span><strong>{device.language || "—"}</strong></div>
            <div className="meta-tile"><span>Timezone</span><strong>{device.timezone || "—"}</strong></div>
            <div className="meta-tile"><span>Connection</span><strong>{device.connectionType}</strong></div>
            <div className="meta-tile"><span>Online</span><strong>{device.online ? "Yes" : "No"}</strong></div>
          </div>
          {device.userAgent && <div className="meta-tile mt-3"><span>User agent</span><strong className="break-all text-xs">{device.userAgent}</strong></div>}
        </div>
      )}

      {perf && (
        <div className="mt-4">
          <p className="eyebrow mb-2">PERFORMANCE</p>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="meta-tile"><span>Load time</span><strong>{perf.loadTime ? `${perf.loadTime}ms` : "—"}</strong></div>
            <div className="meta-tile"><span>DOM content loaded</span><strong>{perf.domContentLoaded ? `${perf.domContentLoaded}ms` : "—"}</strong></div>
            <div className="meta-tile"><span>TTFB</span><strong>{perf.ttfb ? `${perf.ttfb}ms` : "—"}</strong></div>
            <div className="meta-tile"><span>DNS lookup</span><strong>{perf.dnsTime ? `${perf.dnsTime}ms` : "—"}</strong></div>
            <div className="meta-tile"><span>DOM interactive</span><strong>{perf.domInteractive ? `${perf.domInteractive}ms` : "—"}</strong></div>
            <div className="meta-tile"><span>Transfer size</span><strong>{perf.transferSize ? `${formatNumber(perf.transferSize)} B` : "—"}</strong></div>
            <div className="meta-tile"><span>First paint</span><strong>{perf.firstPaint ? `${perf.firstPaint}ms` : "—"}</strong></div>
            <div className="meta-tile"><span>FCP</span><strong>{perf.fcp ? `${perf.fcp}ms` : "—"}</strong></div>
          </div>
        </div>
      )}

      {session && (
        <div className="mt-4">
          <p className="eyebrow mb-2">SESSION</p>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="meta-tile"><span>Session ID</span><strong className="break-all text-xs">{session.id}</strong></div>
            <div className="meta-tile"><span>Start time</span><strong>{formatDateTime(session.startTime)}</strong></div>
            <div className="meta-tile"><span>Duration</span><strong>{formatDuration(session.duration)}</strong></div>
            <div className="meta-tile"><span>Pages in session</span><strong>{session.pageCount}</strong></div>
          </div>
        </div>
      )}

      {neocities && (
        <div className="mt-4">
          <p className="eyebrow mb-2">NEOCITIES API</p>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="meta-tile"><span>Official views</span><strong className="text-violet-300">{formatNumber(neocities.views)}</strong></div>
            <div className="meta-tile"><span>Official hits</span><strong className="text-gold-300">{formatNumber(neocities.hits)}</strong></div>
            <div className="meta-tile"><span>Domain</span><strong>{neocities.domain || "—"}</strong></div>
            <div className="meta-tile"><span>Last fetched</span><strong>{formatDateTime(neocities.lastFetchedAt)}</strong></div>
          </div>
          {neocities.tags?.length > 0 && <div className="meta-tile mt-3"><span>Tags</span><strong>{neocities.tags.join(", ")}</strong></div>}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-300/5 p-4">
          <p className="eyebrow mb-2 text-red-300">LAST ERROR</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="meta-tile"><span>Message</span><strong className="break-all text-xs">{error.message}</strong></div>
            <div className="meta-tile"><span>Source</span><strong className="break-all text-xs">{error.source}:{error.line}</strong></div>
          </div>
          <div className="meta-tile mt-3"><span>Timestamp</span><strong>{formatDateTime(error.timestamp)}</strong></div>
        </div>
      )}
    </div>
  );
}

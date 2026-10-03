import { useEffect, useMemo, useState } from "react";
import { GitCompare, X } from "lucide-react";
import type { PageRecord } from "../types";
import { formatDuration, formatNumber, getViewsInLastNDays } from "../utils";
import { LazyChart as CosmoChart } from "./LazyChart";

const COMPARE_COLORS = ["#ff69b4", "#00ced1", "#ffd700", "#6a0dad"];

interface CompareModalProps {
  pages: PageRecord[];
  onClose: () => void;
}

export function CompareModal({ pages, onClose }: CompareModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filteredPageList = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pages.filter((page) => !term || [page.siteId, page.path, page.title].join(" ").toLowerCase().includes(term)).slice(0, 100);
  }, [search, pages]);

  const selectedPages = useMemo(() => selected.map((key) => pages.find((p) => p.key === key)).filter(Boolean) as PageRecord[], [selected, pages]);

  const chartData = useMemo(() => {
    if (!selectedPages.length) return [];
    const allDays = new Set<string>();
    selectedPages.forEach((page) => Object.keys(page.daily || {}).forEach((day) => allDays.add(day)));
    const sortedDays = [...allDays].sort();
    return sortedDays.map((day) => {
      const point: { name: string } & Record<string, string | number> = { name: day };
      selectedPages.forEach((page, i) => { point[`p${i}`] = Number(page.daily?.[day] || 0); });
      return point;
    });
  }, [selectedPages]);

  const chartLines = selectedPages.map((page, i) => ({ key: `p${i}`, color: COMPARE_COLORS[i % COMPARE_COLORS.length], name: page.title || page.path }));

  const metrics = useMemo(() => {
    if (!selectedPages.length) return [];
    return selectedPages.map((page) => ({
      key: page.key,
      label: page.title || page.path,
      views: page.views,
      today: getViewsInLastNDays(page, 1),
      week: getViewsInLastNDays(page, 7),
      sessions: page.uniqueSessions,
      time: page.totalTimeOnPage || 0,
      scroll: page.maxScrollPercent || 0,
      clicks: page.clickCount || 0,
      bounces: page.bounces || 0,
      bounceRate: page.uniqueSessions ? ((page.bounces || 0) / page.uniqueSessions * 100) : 0,
    }));
  }, [selectedPages]);

  const leaders = useMemo(() => {
    if (metrics.length < 2) return {} as Record<string, number>;
    const keys = ["views", "today", "week", "sessions", "time", "scroll", "clicks"] as const;
    const result: Record<string, number> = {};
    keys.forEach((key) => {
      let max = -Infinity; let idx = -1;
      metrics.forEach((m, i) => { if (m[key] > max) { max = m[key]; idx = i; } });
      if (idx >= 0) result[key] = idx;
    });
    let minBounce = Infinity; let bounceIdx = -1;
    metrics.forEach((m, i) => { if (m.bounceRate < minBounce) { minBounce = m.bounceRate; bounceIdx = i; } });
    if (bounceIdx >= 0) result.bounceRate = bounceIdx;
    return result;
  }, [metrics]);

  const togglePage = (key: string) => {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : prev.length < 4 ? [...prev, key] : prev);
  };

  return (
    <div className="compare-modal-backdrop" onClick={onClose}>
      <div className="compare-modal glass-panel rounded-[32px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-violet-300">
            <GitCompare size={22} />
            <div>
              <p className="eyebrow">COMPARISON</p>
              <h2 className="mt-1 text-2xl font-black text-white">Page-vs-page overlay</h2>
            </div>
          </div>
          <button className="cosmo-btn rounded-2xl p-2" onClick={onClose} aria-label="Close comparison"><X size={18} /></button>
        </div>

        <div className="mt-4 relative">
          <input className="cosmo-input w-full rounded-2xl px-4 py-2.5" placeholder="Search pages to compare…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="mt-3 max-h-[200px] overflow-auto rounded-2xl border border-white/8">
          {filteredPageList.map((page) => (
            <button key={page.key} className={`flex w-full items-center gap-3 border-b border-white/5 p-2.5 text-left text-sm transition-colors hover:bg-white/[0.04] ${selected.includes(page.key) ? "bg-white/[0.06]" : ""}`} onClick={() => togglePage(page.key)}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected.includes(page.key) ? "border-pink-300 bg-pink-300/20" : "border-white/20"}`}>{selected.includes(page.key) && <span className="text-pink-300">✓</span>}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-bold text-white">{page.title || page.path}</span><span className="mono block truncate text-xs text-slate-400">{page.siteId}{page.path}</span></span>
              <span className="shrink-0 text-xs text-pink-300">{formatNumber(page.views)}</span>
            </button>
          ))}
        </div>

        {selectedPages.length >= 2 && (
          <>
            <div className="mt-5 h-[280px] rounded-3xl border border-white/8 bg-black/20 p-3">
              <CosmoChart data={chartData} lines={chartLines} />
            </div>

            <div className="mt-4 overflow-auto">
              <table className="compare-table min-w-full text-sm">
                <thead><tr><th scope="col">Metric</th>{selectedPages.map((page, i) => <th key={page.key} scope="col" className="text-right" style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>{page.title || page.path}</th>)}</tr></thead>
                <tbody>
                  {[
                    { label: "Views", key: "views" },
                    { label: "Today", key: "today" },
                    { label: "7-day", key: "week" },
                    { label: "Sessions", key: "sessions" },
                    { label: "Time on page", key: "time", format: (v: number) => formatDuration(v) },
                    { label: "Max scroll", key: "scroll", format: (v: number) => `${v}%` },
                    { label: "Clicks", key: "clicks" },
                    { label: "Bounce rate", key: "bounceRate", format: (v: number) => `${v.toFixed(1)}%`, lowerIsBetter: true },
                  ].map((metric) => (
                    <tr key={metric.key}>
                      <td className="p-2.5 text-slate-300">{metric.label}</td>
                      {metrics.map((m, i) => {
                        const isLeader = leaders[metric.key] === i;
                        const value = (m as any)[metric.key];
                        return <td key={i} className={`p-2.5 text-right font-bold ${isLeader ? "text-gold-300" : "text-slate-200"}`}>{metric.format ? metric.format(value) : formatNumber(value)}{isLeader && <span className="ml-1 text-xs">★</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {selectedPages.length < 2 && (
          <div className="mt-5 rounded-2xl border border-white/8 p-8 text-center text-slate-400">
            <GitCompare size={28} className="mx-auto mb-3 opacity-40" />
            <p>Select 2–4 pages to see them overlaid.</p>
            <p className="mt-1 text-xs">{selected.length} selected</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Globe } from "lucide-react";
import type { SiteRecord } from "../types";
import { formatNumber, formatRelativeDate, getSiteDisplayDomain } from "../utils";
import { Sparkline } from "./Sparkline";

interface SiteTableProps {
  sites: SiteRecord[];
  selectedSiteName: string | null;
  onSelect: (siteName: string) => void;
  sortKey?: string;
  onSort?: (key: string) => void;
}

const ROW_HEIGHT = 72;

function SortArrow({ active, direction }: { active: boolean; direction: string }) {
  if (!active) return null;
  return <span className="ml-1 text-gold-300">{direction === "asc" ? "↑" : "↓"}</span>;
}

export function SiteTable({ sites, selectedSiteName, onSelect, sortKey, onSort }: SiteTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: sites.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (!sites.length) {
    return (
      <div ref={parentRef} className="table-shell overflow-auto 2xl:border-r" style={{ maxHeight: "560px" }}>
        <table className="min-w-full text-sm">
          <thead><tr><th scope="col">Site</th><th scope="col" className="text-right">Views</th><th scope="col" className="text-right">Hits</th><th scope="col" className="text-right">Δ</th><th scope="col" className="text-right">Growth</th><th scope="col">Trend</th><th scope="col">Updated</th></tr></thead>
          <tbody><tr><td colSpan={7} className="p-10 text-center text-slate-400"><Globe size={28} className="mx-auto mb-3 opacity-40" /><p>No Neocities orbit entries configured.</p></td></tr></tbody>
        </table>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div ref={parentRef} className="table-shell overflow-auto 2xl:border-r" style={{ maxHeight: "560px" }}>
      <table className="min-w-full text-sm">
        <thead><tr>{[
          { label: "Site", key: "name", align: "" },
          { label: "Views", key: "views", align: "text-right" },
          { label: "Hits", key: "hits", align: "text-right" },
          { label: "Δ", key: "delta", align: "text-right" },
          { label: "Growth", key: "growth", align: "text-right" },
          { label: "Trend", key: "trend", align: "" },
          { label: "Updated", key: "updated", align: "" }
        ].map((col) => <th key={col.key} scope="col" className={`${col.align} ${onSort ? "cursor-pointer select-none hover:text-gold-300" : ""}`} onClick={() => onSort?.(col.key)}>{col.label}{sortKey && sortKey.startsWith(col.key) && <SortArrow active direction={sortKey.split("-")[1]} />}</th>)}</tr></thead>
        <tbody>
          {paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={7} style={{ padding: 0 }} /></tr>}
          {virtualItems.map((virtualItem) => {
            const site = sites[virtualItem.index];
            return (
              <tr key={site.siteName} tabIndex={0} onClick={() => onSelect(site.siteName)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(site.siteName); } }} aria-label={`${site.siteName}, ${formatNumber(site.views)} views`} className={`${site.siteName === selectedSiteName ? "row-active" : ""} cursor-pointer border-b border-white/5 hover:bg-white/[0.035] focus:outline-none focus-visible:bg-white/[0.07]`}>
                <td className="p-3"><div className="font-bold text-white">{site.siteName}</div><div className="mono mt-1 break-all text-xs text-slate-400">{getSiteDisplayDomain(site.siteName, site.domain)}</div>{site.error && <div className="mt-1 text-[11px] text-gold-300">⚠ {site.error}</div>}</td>
                <td className="p-3 text-right font-black text-violet-300">{formatNumber(site.views)}</td>
                <td className="p-3 text-right text-gold-300">{formatNumber(site.hits)}</td>
                <td className={`p-3 text-right font-bold ${site.deltaViews > 0 ? "text-emerald-300" : site.deltaViews < 0 ? "text-red-300" : "text-slate-400"}`}>{site.deltaViews > 0 ? "+" : ""}{formatNumber(site.deltaViews)}</td>
                <td className={`p-3 text-right ${site.growthRate > 0 ? "text-emerald-300" : site.growthRate < 0 ? "text-red-300" : "text-slate-400"}`}>{site.growthRate > 0 ? "+" : ""}{site.growthRate.toFixed(2)}%</td>
                <td className="p-3"><Sparkline values={site.history.slice(-30).map((h) => h.views)} color="#6a0dad" /></td>
                <td className="whitespace-nowrap p-3 text-xs text-slate-400">{formatRelativeDate(site.lastUpdated)}</td>
              </tr>
            );
          })}
          {paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td colSpan={7} style={{ padding: 0 }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}

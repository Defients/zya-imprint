import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchX } from "lucide-react";
import type { PageRecord } from "../types";
import { dayKeyFromOffset, formatNumber, formatRelativeTime, getViewsInLastNDays } from "../utils";
import { Sparkline } from "./Sparkline";

interface LocalTableProps {
  pages: PageRecord[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  sortKey?: string;
  onSort?: (key: string) => void;
}

const ROW_HEIGHT = 88;

function SortArrow({ active, direction }: { active: boolean; direction: string }) {
  if (!active) return null;
  return <span className="ml-1 text-gold-300">{direction === "asc" ? "↑" : "↓"}</span>;
}

export function LocalTable({ pages, selectedKey, onSelect, sortKey, onSort }: LocalTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: pages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (!pages.length) {
    return (
      <div ref={parentRef} className="table-shell overflow-auto 2xl:border-r" style={{ maxHeight: "560px" }}>
        <table className="min-w-full text-sm">
          <thead><tr><th scope="col">Site / page</th><th scope="col">Source</th><th scope="col" className="text-right">Views</th><th scope="col" className="text-right">Today</th><th scope="col" className="text-right">7d</th><th scope="col" className="text-right">Sessions</th><th scope="col" className="text-right">Time</th><th scope="col" className="text-right">Scroll</th><th scope="col" className="text-right">Clicks</th><th scope="col">Trend</th><th scope="col">Last seen</th></tr></thead>
          <tbody><tr><td colSpan={11} className="p-10 text-center text-slate-400"><SearchX size={28} className="mx-auto mb-3 opacity-40" /><p>No page signals yet. Install <code className="inline-code">zya-imprint.js</code>, import a snapshot, or sync a collector.</p></td></tr></tbody>
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
          { label: "Site / page", key: "site", align: "" },
          { label: "Source", key: "source", align: "" },
          { label: "Views", key: "views", align: "text-right" },
          { label: "Today", key: "today", align: "text-right" },
          { label: "7d", key: "week", align: "text-right" },
          { label: "Sessions", key: "sessions", align: "text-right" },
          { label: "Time", key: "time", align: "text-right" },
          { label: "Scroll", key: "scroll", align: "text-right" },
          { label: "Clicks", key: "clicks", align: "text-right" },
          { label: "Trend", key: "trend", align: "" },
          { label: "Last seen", key: "lastSeen", align: "" }
        ].map((col) => <th key={col.key} scope="col" className={`${col.align} ${onSort ? "cursor-pointer select-none hover:text-gold-300" : ""}`} onClick={() => onSort?.(col.key)}>{col.label}{sortKey && sortKey.startsWith(col.key) && <SortArrow active direction={sortKey.split("-")[1]} />}</th>)}</tr></thead>
        <tbody>
          {paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={11} style={{ padding: 0 }} /></tr>}
          {virtualItems.map((virtualItem) => {
            const page = pages[virtualItem.index];
            const timeOnPage = page.totalTimeOnPage || 0;
            const timeLabel = timeOnPage < 60 ? `${timeOnPage}s` : `${Math.floor(timeOnPage / 60)}m`;
            return (
              <tr key={page.key} tabIndex={0} onClick={() => onSelect(page.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(page.key); } }} aria-label={`${page.title || page.path} on ${page.siteId}, ${formatNumber(page.views)} views`} className={`${page.key === selectedKey ? "row-active" : ""} cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.035] focus:outline-none focus-visible:bg-white/[0.07]`}>
                <td className="p-3 align-top"><div className="font-bold text-white">{page.title || page.path}</div><div className="mt-1 text-xs font-semibold text-pink-300">{page.siteId}</div><div className="mono mt-1 break-all text-xs text-slate-400">{page.path}</div>{page.label && <span className="cosmo-chip mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px]">{page.label}</span>}</td>
                <td className="p-3"><span className={`source-pill source-${page.source}`}>{page.source}</span></td>
                <td className="p-3 text-right font-black text-pink-300">{formatNumber(page.views)}</td>
                <td className="p-3 text-right text-slate-200">{formatNumber(getViewsInLastNDays(page, 1))}</td>
                <td className="p-3 text-right text-slate-200">{formatNumber(getViewsInLastNDays(page, 7))}</td>
                <td className="p-3 text-right text-gold-300">{formatNumber(page.uniqueSessions)}</td>
                <td className="p-3 text-right text-emerald-300">{timeLabel}</td>
                <td className="p-3 text-right text-violet-300">{page.maxScrollPercent || 0}%</td>
                <td className="p-3 text-right text-cyan-300">{formatNumber(page.clickCount || 0)}</td>
                <td className="p-3"><Sparkline values={Array.from({ length: 30 }, (_, i) => Number(page.daily?.[dayKeyFromOffset(29 - i)] || 0))} color="#ff69b4" /></td>
                <td className="whitespace-nowrap p-3 text-xs text-slate-400">{formatRelativeTime(page.lastSeen)}</td>
              </tr>
            );
          })}
          {paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td colSpan={11} style={{ padding: 0 }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}

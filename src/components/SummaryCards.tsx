import { AnimatedCounter } from "./AnimatedCounter";
import { formatDuration, formatNumber } from "../utils";
import type { LocalSummary, SiteSummary } from "../types";

export function SummaryCards({ localSummary, siteSummary }: { localSummary: LocalSummary; siteSummary: SiteSummary }) {
  const cards: [string, number | string, string][] = [
    ["Tracked pages", localSummary.trackedPages, "text-pink-300"],
    ["Site identities", localSummary.trackedOrigins, "text-red-300"],
    ["Page views", localSummary.totalViews, "text-pink-300"],
    ["Today", localSummary.todayViews, "text-gold-300"],
    ["7-day pulse", localSummary.weekViews, "text-violet-300"],
    ["Sessions", localSummary.uniqueSessions, "text-gold-300"],
    ["Avg time/page", formatDuration(localSummary.avgTimeOnPage || 0), "text-emerald-300"],
    ["Bounce rate", `${localSummary.bounceRate || 0}%`, "text-red-300"],
    ["Total clicks", localSummary.totalClicks, "text-cyan-300"],
    ["Avg scroll", `${localSummary.avgScrollDepth || 0}%`, "text-violet-300"],
    ["Interactions", localSummary.totalInteractions, "text-pink-300"],
    ["JS errors", localSummary.totalJsErrors, "text-red-300"],
    ["Orbit views", siteSummary.totalViews, "text-violet-300"],
    ["Orbit Δ", `${siteSummary.deltaViews > 0 ? "+" : ""}${formatNumber(siteSummary.deltaViews)}`, siteSummary.deltaViews >= 0 ? "text-emerald-300" : "text-red-300"]
  ];
  return <section className="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">{cards.map(([label, value, accent]) => <div key={String(label)} className="metric-card glass-panel rounded-[26px] p-4" aria-label={`${label}: ${typeof value === "number" ? formatNumber(value) : value}`}><p>{label}</p><AnimatedCounter value={value} className={String(accent)} formatFn={(n) => formatNumber(n)} /></div>)}</section>;
}

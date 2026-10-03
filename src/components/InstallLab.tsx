import { useMemo, useRef, useState } from "react";
import { Clipboard, Cloud, FileDown, HardDrive, Link2, Radar, ShieldCheck, TerminalSquare, ScanLine, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { COLLECTOR_SETTINGS_KEY } from "../constants";
import { apiUrl, hasRuntimeApi, RUNTIME_API_MODE } from "../runtime";
import { useToast } from "./Toast";
import type { PageRecord } from "../types";
import { normalizePath, normalizeSiteId, safeParse } from "../utils";

interface InspectResult {
  url: string;
  found: boolean;
  siteId?: string;
  path?: string;
  label?: string;
  title?: string;
  error?: string;
}

interface InstallLabProps {
  onAddManualPage: (page: Partial<PageRecord>) => void;
  onCollectorSummary: (summary: any) => number;
}

function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}

export function InstallLab({ onAddManualPage, onCollectorSummary }: InstallLabProps) {
  const { toast } = useToast();
  const savedCollector = safeParse<{ endpoint?: string; readToken?: string }>(localStorage.getItem(COLLECTOR_SETTINGS_KEY), {});
  const [siteId, setSiteId] = useState("deffy");
  const [pagePath, setPagePath] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [pageLabel, setPageLabel] = useState("");
  const [scriptUrl, setScriptUrl] = useState("zya-imprint.js");
  const [retentionDays, setRetentionDays] = useState(90);
  const [spa, setSpa] = useState(true);
  const [trackEngagement, setTrackEngagement] = useState(true);
  const [trackDevice, setTrackDevice] = useState(true);
  const [trackPerformance, setTrackPerformance] = useState(true);
  const [trackErrors, setTrackErrors] = useState(true);
  const [trackNeocities, setTrackNeocities] = useState(false);
  const [neocitiesSite, setNeocitiesSite] = useState("");
  const [neocitiesEndpoint, setNeocitiesEndpoint] = useState("");
  const [collectorEnabled, setCollectorEnabled] = useState(false);
  const [collectorEndpoint, setCollectorEndpoint] = useState(savedCollector.endpoint || "");
  const [collectorReadToken, setCollectorReadToken] = useState(savedCollector.readToken || "");
  const [scanUrl, setScanUrl] = useState("");
  const [massUrls, setMassUrls] = useState("");
  const [massResults, setMassResults] = useState<InspectResult[]>([]);
  const [massBusy, setMassBusy] = useState(false);
  const massCancelRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const normalizedSiteId = normalizeSiteId(siteId);
  const consentMode = collectorEnabled ? "required" : "implicit";

  const fullSnippet = useMemo(() => {
    const config: Record<string, any> = {
      siteId: normalizedSiteId,
      retentionDays,
      spa,
      respectPrivacy: true,
      consent: consentMode,
      trackEngagement,
      trackDevice,
      trackPerformance,
      trackErrors,
      trackNeocities
    };
    if (trackNeocities && neocitiesSite.trim()) config.neocitiesSite = neocitiesSite.trim();
    if (trackNeocities && neocitiesEndpoint.trim()) config.neocitiesEndpoint = neocitiesEndpoint.trim();
    if (pagePath.trim()) config.page = { path: normalizePath(pagePath), title: pageTitle || undefined, label: pageLabel || undefined };
    if (collectorEnabled && collectorEndpoint.trim()) config.collector = collectorEndpoint.trim();
    return `<script>\nwindow.ZYA_IMPRINT = ${JSON.stringify(config, null, 2)};\n</script>\n<script src="${scriptUrl}" defer></script>`;
  }, [collectorEnabled, collectorEndpoint, consentMode, neocitiesEndpoint, neocitiesSite, normalizedSiteId, pageLabel, pagePath, pageTitle, retentionDays, scriptUrl, spa, trackDevice, trackEngagement, trackErrors, trackNeocities, trackPerformance]);

  const compactSnippet = useMemo(() => {
    const attributes = [
      `data-site-id="${normalizedSiteId}"`,
      `data-retention-days="${retentionDays}"`,
      `data-spa="${spa}"`,
      `data-consent="${consentMode}"`,
      `data-track-engagement="${trackEngagement}"`,
      `data-track-device="${trackDevice}"`,
      `data-track-performance="${trackPerformance}"`,
      `data-track-errors="${trackErrors}"`,
      `data-track-neocities="${trackNeocities}"`
    ];
    if (trackNeocities && neocitiesSite.trim()) attributes.push(`data-neocities-site="${neocitiesSite.trim()}"`);
    if (trackNeocities && neocitiesEndpoint.trim()) attributes.push(`data-neocities-endpoint="${neocitiesEndpoint.trim()}"`);
    if (collectorEnabled && collectorEndpoint.trim()) attributes.push(`data-collector="${collectorEndpoint.trim()}"`);
    return `<script src="${scriptUrl}" ${attributes.join(" ")} defer></script>`;
  }, [collectorEnabled, collectorEndpoint, consentMode, normalizedSiteId, neocitiesEndpoint, neocitiesSite, retentionDays, scriptUrl, spa, trackDevice, trackEngagement, trackErrors, trackNeocities, trackPerformance]);

  const handleCopy = async (text: string, label: string) => {
    try {
      await copyText(text);
      toast(`${label} copied.`, "success");
    } catch {
      toast("Clipboard failed; select the code manually.", "error");
    }
  };

  const inspectSingleUrl = async (rawUrl: string): Promise<InspectResult> => {
    const target = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;

    if (RUNTIME_API_MODE === "disabled") {
      return { url: target, found: false, error: "Install verification requires a Node deployment. Static builds do not inspect pages through public proxies." };
    }

    if (await hasRuntimeApi()) {
      try {
        const response = await fetch(apiUrl(`/api/inspect?url=${encodeURIComponent(target)}`), { cache: "no-store" });
        const result = await response.json().catch(() => null);
        if (response.ok && !result?.error) {
          return {
            url: result.finalUrl || target,
            found: result.tracker?.found || false,
            siteId: result.tracker?.siteId || "",
            path: result.tracker?.path || "",
            label: result.tracker?.label || "",
            title: result.title || ""
          };
        }
      } catch {
        // Server failed — fall through to error
      }
    }

    return { url: target, found: false, error: "Install verification requires the Node API. Start the development server or use a Node deployment." };
  };

  const inspectPage = async () => {
    if (!scanUrl.trim()) return;
    setBusy(true);
    toast("Inspecting page…", "info");
    try {
      const result = await inspectSingleUrl(scanUrl);
      if (result.error) {
        toast(`Inspection failed: ${result.error}.`, "error");
        return;
      }
      if (!result.found) {
        toast(`Reached ${result.url}, but ZYA Imprint was not found.`, "warning");
        return;
      }
      const url = new URL(result.url);
      const detectedSiteId = normalizeSiteId(result.siteId || url.hostname);
      onAddManualPage({
        siteId: detectedSiteId,
        origin: url.origin,
        path: normalizePath(result.path || url.pathname),
        title: result.title || url.pathname,
        label: result.label || "Verified install",
        source: "manual"
      });
      toast(`Verified ${detectedSiteId}${normalizePath(result.path || url.pathname)}. Live counts still require export/import or a collector.`, "success");
    } catch (error) {
      toast(`Inspection failed: ${error instanceof Error ? error.message : "unreachable page"}.`, "error");
    } finally {
      setBusy(false);
    }
  };

  const massInspect = async () => {
    const urls = massUrls.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
    if (!urls.length) return;
    setMassBusy(true);
    massCancelRef.current = false;
    setMassResults(urls.map((u) => ({ url: u, found: false, error: "Pending…" })));
    toast(`Inspecting ${urls.length} page${urls.length === 1 ? "" : "s"}…`, "info");

    const results: InspectResult[] = new Array(urls.length);
    let verified = 0;

    const BATCH = 4;
    for (let i = 0; i < urls.length; i += BATCH) {
      if (massCancelRef.current) break;
      const batch = urls.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map((u) => inspectSingleUrl(u)));
      batchResults.forEach((result, j) => {
        results[i + j] = result;
        if (result.found && !result.error) {
          verified++;
          const url = new URL(result.url);
          const detectedSiteId = normalizeSiteId(result.siteId || url.hostname);
          onAddManualPage({
            siteId: detectedSiteId,
            origin: url.origin,
            path: normalizePath(result.path || url.pathname),
            title: result.title || url.pathname,
            label: result.label || "Mass verified",
            source: "manual"
          });
        }
      });
      setMassResults(results.map((r, idx) => r || { url: urls[idx], found: false, error: "Pending…" }));
    }

    if (massCancelRef.current) {
      toast(`Mass inspect cancelled: ${verified}/${urls.length} verified.`, "warning");
    } else {
      toast(`Mass inspect complete: ${verified}/${urls.length} verified.`, verified > 0 ? "success" : "warning");
    }
    setMassBusy(false);
  };

  const syncCollector = async () => {
    if (!collectorEndpoint.trim()) {
      toast("Enter a collector endpoint first.", "warning");
      return;
    }
    setBusy(true);
    toast("Pulling aggregated collector snapshots…", "info");
    try {
      const input = collectorEndpoint.trim().replace(/\/$/, "");
      const summaryUrl = input.endsWith("/api/imprint") ? `${input}/summary` : `${input}/api/imprint/summary`;
      const response = await fetch(summaryUrl, {
        headers: collectorReadToken ? { Authorization: `Bearer ${collectorReadToken}` } : {},
        cache: "no-store"
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `HTTP ${response.status}`);
      const summary = await response.json();
      const count = onCollectorSummary(summary);
      localStorage.setItem(COLLECTOR_SETTINGS_KEY, JSON.stringify({ endpoint: collectorEndpoint.trim(), readToken: collectorReadToken }));
      toast(`Synced ${count} page snapshot${count === 1 ? "" : "s"}. No visitor fingerprints were requested or stored.`, "success");
    } catch (error) {
      toast(`Collector sync failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="hero-grid glass-panel rounded-[32px] p-6 md:p-8">
        <div>
          <p className="eyebrow">IMPRINT LAB // v3.2</p>
          <h2 className="section-title mt-3">A tracker that knows its boundaries.</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            ZYA Imprint now separates <strong className="text-white">local evidence</strong> from <strong className="text-white">remote aggregation</strong>. Local mode stays inside each site’s browser origin. Collector mode is explicit, consent-gated, and sends only page-level fields.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="signal-card"><ShieldCheck size={20} /><div><strong>No fingerprinting</strong><span>No canvas, font, UA, or hardware signature.</span></div></div>
          <div className="signal-card"><HardDrive size={20} /><div><strong>Local by default</strong><span>Origin-scoped localStorage with bounded retention.</span></div></div>
          <div className="signal-card"><Cloud size={20} /><div><strong>Remote by choice</strong><span>Optional collector with required consent by default.</span></div></div>
        </div>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
        <div className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">INSTALL COMPOSER</p>
              <h3 className="mt-2 text-2xl font-black text-white">Forge the embed</h3>
            </div>
            <span className={`mode-badge ${collectorEnabled ? "is-remote" : ""}`}>{collectorEnabled ? "COLLECTOR" : "LOCAL"}</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="field-label">Site ID<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" aria-label="Site ID" value={siteId} onChange={(event) => setSiteId(event.target.value)} /></label>
            <label className="field-label">Script URL<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" aria-label="Script URL" value={scriptUrl} onChange={(event) => setScriptUrl(event.target.value)} /></label>
            <label className="field-label">Optional fixed path<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" aria-label="Optional fixed path" placeholder="Auto-detect from location" value={pagePath} onChange={(event) => setPagePath(event.target.value)} /></label>
            <label className="field-label">Optional title<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" aria-label="Optional page title" placeholder="Auto-detect document.title" value={pageTitle} onChange={(event) => setPageTitle(event.target.value)} /></label>
            <label className="field-label">Optional label<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" aria-label="Optional page label" placeholder="Landing, Codex, Game…" value={pageLabel} onChange={(event) => setPageLabel(event.target.value)} /></label>
            <label className="field-label">Retention days<input type="number" min={7} max={730} className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" aria-label="Retention days" value={retentionDays} onChange={(event) => setRetentionDays(Math.max(7, Math.min(730, Number(event.target.value) || 90)))} /></label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="toggle-row"><input type="checkbox" checked={spa} onChange={(event) => setSpa(event.target.checked)} /><span><strong>SPA route tracking</strong><small>Tracks pushState, replaceState, and back/forward.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={trackEngagement} onChange={(event) => setTrackEngagement(event.target.checked)} /><span><strong>Engagement tracking</strong><small>Time on page, scroll depth, clicks, interactions, bounces.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={trackDevice} onChange={(event) => setTrackDevice(event.target.checked)} /><span><strong>Device tracking</strong><small>UA, screen, viewport, CPU, memory, timezone, touch, connection.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={trackPerformance} onChange={(event) => setTrackPerformance(event.target.checked)} /><span><strong>Performance tracking</strong><small>Load time, TTFB, DNS, DOM interactive, first paint, FCP.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={trackErrors} onChange={(event) => setTrackErrors(event.target.checked)} /><span><strong>Error tracking</strong><small>Uncaught JS exceptions and unhandled promise rejections.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={trackNeocities} onChange={(event) => setTrackNeocities(event.target.checked)} /><span><strong>Neocities totals</strong><small>Optional. Requires a same-origin or CORS-enabled endpoint/cache URL.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={collectorEnabled} onChange={(event) => setCollectorEnabled(event.target.checked)} /><span><strong>Remote collector</strong><small>Switches consent from implicit to required.</small></span></label>
          </div>

          {trackNeocities && (
            <div className="mt-5 grid gap-3">
              <label className="field-label block">Neocities sitename<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" placeholder="Defaults to site ID" value={neocitiesSite} onChange={(event) => setNeocitiesSite(event.target.value)} /></label>
              <label className="field-label block">Neocities endpoint or cache URL<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" placeholder="/api/neocities/info or /zya-imprint/neocities-cache.json" value={neocitiesEndpoint} onChange={(event) => setNeocitiesEndpoint(event.target.value)} /></label>
              <p className="text-xs leading-5 text-slate-400">The tracker no longer calls neocities.org directly because browsers block that cross-origin response. Leave this blank to skip the optional public-total attachment.</p>
            </div>
          )}

          {collectorEnabled && (
            <label className="field-label mt-5 block">Collector POST endpoint<input className="cosmo-input mt-2 w-full rounded-2xl px-4 py-3" placeholder="https://analytics.example.com/api/imprint" value={collectorEndpoint} onChange={(event) => setCollectorEndpoint(event.target.value)} /></label>
          )}
        </div>

        <div className="space-y-4">
          <div className="code-box rounded-[30px] p-5 md:p-6">
            <div className="flex items-center justify-between gap-4"><div><p className="eyebrow">FULL CONFIG</p><h3 className="mt-2 text-xl font-black text-white">Readable install</h3></div><button className="cosmo-btn rounded-2xl px-3 py-2 text-sm font-bold" onClick={() => handleCopy(fullSnippet, "Full install")}><Clipboard size={15} /> Copy</button></div>
            <pre className="code-scroll mt-4">{fullSnippet}</pre>
          </div>
          <div className="code-box rounded-[30px] p-5 md:p-6">
            <div className="flex items-center justify-between gap-4"><div><p className="eyebrow">COMPACT MODE</p><h3 className="mt-2 text-xl font-black text-white">Single-tag install</h3></div><button className="cosmo-btn rounded-2xl px-3 py-2 text-sm font-bold" onClick={() => handleCopy(compactSnippet, "Compact install")}><Clipboard size={15} /> Copy</button></div>
            <pre className="code-scroll mt-4">{compactSnippet}</pre>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="flex items-start gap-3"><Radar className="mt-1 text-pink-300" size={22} /><div><p className="eyebrow">INSTALL VERIFIER</p><h3 className="mt-2 text-2xl font-black text-white">Inspect a deployed page</h3><p className="mt-2 text-sm leading-6 text-slate-300">Fetches deployed HTML and checks for the ZYA Imprint script tag and config. Requires a Node deployment — static builds disable inspection to avoid sending URLs through public proxies.</p></div></div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input className="cosmo-input min-w-0 flex-1 rounded-2xl px-4 py-3" aria-label="URL to inspect" placeholder="https://site.neocities.org/page" value={scanUrl} onChange={(event) => setScanUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && inspectPage()} /><button className="cosmo-btn cosmo-btn-primary rounded-2xl px-4 py-3 text-sm font-bold" disabled={busy || !scanUrl.trim()} onClick={inspectPage}><Link2 size={16} /> Verify</button></div>
        </div>

        <div className="glass-panel rounded-[30px] p-5 md:p-6">
          <div className="flex items-start gap-3"><Cloud className="mt-1 text-violet-300" size={22} /><div><p className="eyebrow">COLLECTOR SYNC</p><h3 className="mt-2 text-2xl font-black text-white">Pull aggregate snapshots</h3><p className="mt-2 text-sm leading-6 text-slate-300">The read token stays in this browser and is deliberately excluded from dashboard exports.</p></div></div>
          <form onSubmit={(e) => e.preventDefault()} className="mt-5 grid gap-3" autoComplete="off"><input className="cosmo-input rounded-2xl px-4 py-3" aria-label="Collector endpoint" placeholder="Collector base or /api/imprint endpoint" value={collectorEndpoint} onChange={(event) => setCollectorEndpoint(event.target.value)} /><input type="password" autoComplete="off" className="cosmo-input rounded-2xl px-4 py-3" aria-label="Read token" placeholder="Read token" value={collectorReadToken} onChange={(event) => setCollectorReadToken(event.target.value)} /><button type="button" className="cosmo-btn cosmo-btn-primary rounded-2xl px-4 py-3 text-sm font-bold" disabled={busy} onClick={syncCollector}><FileDown size={16} /> Sync collector</button></form>
        </div>
      </section>

      <section className="glass-panel rounded-[30px] p-5 md:p-6">
        <div className="flex items-start gap-3"><ScanLine className="mt-1 text-cyan-300" size={22} /><div><p className="eyebrow">MASS INSPECT</p><h3 className="mt-2 text-2xl font-black text-white">Batch-verify multiple pages</h3><p className="mt-2 text-sm leading-6 text-slate-300">Enter one URL per line or comma-separated. Each page with a confirmed ZYA Imprint install will be linked as a manual snapshot.</p></div></div>
        <div className="mt-5 grid gap-3">
          <textarea className="cosmo-textarea mono min-h-[140px] w-full rounded-2xl p-4" aria-label="URLs to inspect" placeholder={"https://deffy.me/\nhttps://deffy.me/8ball\nhttps://deffy.me/codex"} value={massUrls} onChange={(event) => setMassUrls(event.target.value)} />
          <div className="flex gap-2">
            <button className="cosmo-btn cosmo-btn-primary rounded-2xl px-4 py-3 text-sm font-bold" disabled={massBusy || !massUrls.trim()} onClick={massInspect}><ScanLine size={16} /> Inspect all</button>
            {massBusy && <button className="cosmo-btn cosmo-btn-danger rounded-2xl px-4 py-3 text-sm font-bold" onClick={() => { massCancelRef.current = true; }}>Cancel</button>}
          </div>
        </div>
        {massResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {massResults.map((result, idx) => (
              <div key={idx} className={`flex items-center gap-3 rounded-2xl border p-3 text-sm ${result.error === "Pending…" ? "border-white/10 bg-white/[0.02]" : result.found ? "border-emerald-300/30 bg-emerald-300/5" : result.error ? "border-red-300/30 bg-red-300/5" : "border-gold-300/30 bg-gold-300/5"}`}>
                {result.error === "Pending…" ? <Loader2 size={16} className="animate-spin text-slate-400" /> : result.found ? <CheckCircle2 size={16} className="text-emerald-300" /> : <XCircle size={16} className={result.error ? "text-red-300" : "text-gold-300"} />}
                <span className="mono min-w-0 flex-1 break-all text-xs text-slate-300">{result.url}</span>
                {result.found && result.siteId && <span className="cosmo-chip rounded-full px-2 py-0.5 text-[11px]">{result.siteId}</span>}
                {!result.found && !result.error && <span className="text-xs text-gold-300">Not found</span>}
                {!result.found && result.error && result.error !== "Pending…" && <span className="text-xs text-red-300">{result.error}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-panel rounded-[30px] p-5 md:p-6">
        <div className="flex items-start gap-3"><TerminalSquare className="mt-1 text-gold-300" size={22} /><div><p className="eyebrow">SITE-SIDE CONTROLS</p><h3 className="mt-2 text-2xl font-black text-white">Built-in browser API</h3></div></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="mini-code"><strong>Export this origin</strong><code>zyaImprint.export()</code><span>Download a snapshot, then import it into the vault.</span></div>
          <div className="mini-code"><strong>Consent grant</strong><code>zyaImprint.grantConsent()</code><span>Required before remote collection when collector mode is active.</span></div>
          <div className="mini-code"><strong>Inspect state</strong><code>zyaImprint.getSnapshot()</code><span>Returns the current local aggregate without sending it anywhere.</span></div>
        </div>
      </section>
    </div>
  );
}

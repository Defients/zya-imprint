export type PageSource = "local" | "legacy" | "import" | "collector" | "manual";

export interface DeviceInfo {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  colorDepth: number;
  pixelRatio: number;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  platform: string;
  language: string;
  languages: string[];
  timezone: string;
  touch: boolean;
  connectionType: string;
  online: boolean;
}

export interface PerformanceInfo {
  loadTime: number;
  domContentLoaded: number;
  ttfb: number;
  dnsTime: number;
  domInteractive: number;
  transferSize: number;
  firstPaint: number;
  fcp: number;
}

export interface NavigationInfo {
  type: string;
  redirectCount: number;
  referrer: string;
  referrerType: string;
  entryType: string;
}

export interface SessionInfo {
  id: string;
  startTime: string;
  duration: number;
  pageCount: number;
}

export interface NeocitiesInfo {
  views: number;
  hits: number;
  createdAt: string | null;
  lastUpdated: string | null;
  domain: string | null;
  tags: string[];
  lastFetchedAt: string | null;
}

export interface ErrorInfo {
  message: string;
  source: string;
  line: number;
  timestamp: string;
}

export interface PageRecord {
  key: string;
  siteId: string;
  origin: string;
  path: string;
  title: string;
  label: string;
  views: number;
  uniqueSessions: number;
  firstSeen: string | null;
  lastSeen: string | null;
  lastReferrer: string;
  daily: Record<string, number>;
  source: PageSource;
  totalTimeOnPage?: number;
  maxScrollPercent?: number;
  scrollMilestones?: string[];
  bounces?: number;
  returnVisits?: number;
  clickCount?: number;
  interactionCount?: number;
  jsErrors?: number;
  lastError?: ErrorInfo | null;
  device?: DeviceInfo | null;
  performance?: PerformanceInfo | null;
  navigation?: NavigationInfo | null;
  session?: SessionInfo | null;
  neocities?: NeocitiesInfo | null;
}

export interface SiteHistoryEntry {
  timestamp: string;
  source?: "live-api" | "static-cache";
  stale?: boolean;
  views: number;
  hits: number;
  lastUpdated: string | null;
  createdAt: string | null;
  domain: string | null;
  tags: string[];
  error: string | null;
}

export interface SiteRecord {
  siteName: string;
  views: number;
  hits: number;
  deltaViews: number;
  deltaHits: number;
  growthRate: number;
  lastUpdated: string | null;
  createdAt: string | null;
  domain: string | null;
  tags: string[];
  lastRefreshAt: string | null;
  error: string | null;
  history: SiteHistoryEntry[];
}

export interface CollectorSettings {
  endpoint: string;
  readToken: string;
}

export interface LocalSummary {
  trackedPages: number;
  trackedOrigins: number;
  totalViews: number;
  todayViews: number;
  weekViews: number;
  uniqueSessions: number;
  avgTimeOnPage: number;
  bounceRate: number;
  totalClicks: number;
  avgScrollDepth: number;
  totalInteractions: number;
  totalJsErrors: number;
}

export interface SiteSummary {
  totalViews: number;
  totalHits: number;
  deltaViews: number;
  deltaHits: number;
  trackedSites: number;
}

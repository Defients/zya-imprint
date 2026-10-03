export const TRACKER_STORAGE_V2 = "zyaImprintV2";
export const LEGACY_PAGE_STORAGE_KEYS = ["zyaImprintV1", "deffyPageAnalyticsV1", "deffy_page_analytics_v1"];
export const DASHBOARD_ARCHIVE_KEY = "zyaImprintDashboardArchiveV2";
export const COLLECTOR_CACHE_KEY = "zyaImprintCollectorCacheV1";
export const COLLECTOR_SETTINGS_KEY = "zyaImprintCollectorSettingsV1";

export const SITE_HISTORY_KEY = "deffy_neocities_sitewide_history_v2";
export const LEGACY_SITE_HISTORY_KEY = "deffy_neocities_sitewide_history_v1";
export const SITE_SETTINGS_KEY = "deffy_neocities_sitewide_settings_v3";
export const MAX_SITE_HISTORY_POINTS = 365;

export const DEFAULT_SITE_LIST = [
  "astrimancy", "astrizda", "auralyx", "bridgebuilder", "confluxcircuit",
  "defears", "deffy", "defscribe", "du3l", "hybrix", "kovrycha",
  "madchatter", "peerly", "phexotial", "pikon", "pyah",
  "skriv", "skywardascent", "wikirace"
];

export const AUTO_REFRESH_KEY = "zyaImprintNeocitiesAutoRefreshV2";
export const AUTO_REFRESH_INTERVALS: Record<string, number> = {
  off: 0,
  "30min": 1_800_000,
  "1hour": 3_600_000,
  "4hours": 14_400_000,
  "8hours": 28_800_000
};

export const AUTO_REFRESH_LABELS: Record<string, string> = {
  off: "Off",
  "30min": "Every 30 minutes",
  "1hour": "Every hour",
  "4hours": "Every 4 hours",
  "8hours": "Every 8 hours"
};

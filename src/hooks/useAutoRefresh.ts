import { useCallback, useEffect, useRef, useState } from "react";
import { AUTO_REFRESH_INTERVALS, AUTO_REFRESH_KEY } from "../constants";
import { safeParse } from "../utils";

export function useAutoRefresh(refresh: () => Promise<void>) {
  const [autoRefreshInterval, setAutoRefreshInterval] = useState("off");
  const [nextRefreshAt, setNextRefreshAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setNextRefreshAt(null);
  }, []);

  const schedule = useCallback((key: string, savedNextRefreshAt?: string | null) => {
    clearTimer();
    const intervalMs = AUTO_REFRESH_INTERVALS[key] || 0;
    setAutoRefreshInterval(key);
    if (!intervalMs) {
      localStorage.setItem(AUTO_REFRESH_KEY, JSON.stringify({ interval: "off", nextRefreshAt: null }));
      return;
    }

    const run = async () => {
      try {
        await refreshRef.current();
      } finally {
        const next = new Date(Date.now() + intervalMs).toISOString();
        setNextRefreshAt(next);
        localStorage.setItem(AUTO_REFRESH_KEY, JSON.stringify({ interval: key, nextRefreshAt: next }));
        timerRef.current = setTimeout(run, intervalMs);
      }
    };

    const savedTime = savedNextRefreshAt ? new Date(savedNextRefreshAt).getTime() : NaN;
    const remaining = Number.isFinite(savedTime) ? savedTime - Date.now() : NaN;
    const delay = Number.isFinite(remaining) && remaining > 0 ? remaining : intervalMs;

    const next = new Date(Date.now() + delay).toISOString();
    setNextRefreshAt(next);
    localStorage.setItem(AUTO_REFRESH_KEY, JSON.stringify({ interval: key, nextRefreshAt: next }));
    timerRef.current = setTimeout(run, delay);
  }, [clearTimer]);

  useEffect(() => {
    const saved = safeParse<{ interval?: string; nextRefreshAt?: string | null }>(localStorage.getItem(AUTO_REFRESH_KEY), {});
    schedule(
      saved.interval && AUTO_REFRESH_INTERVALS[saved.interval] !== undefined ? saved.interval : "off",
      saved.nextRefreshAt
    );
    return clearTimer;
  }, [clearTimer, schedule]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else if (autoRefreshInterval !== "off") {
        const nextTime = nextRefreshAt ? new Date(nextRefreshAt).getTime() : 0;
        const remaining = nextTime - Date.now();
        if (remaining <= 0) {
          schedule(autoRefreshInterval);
        } else {
          schedule(autoRefreshInterval, nextRefreshAt);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [autoRefreshInterval, nextRefreshAt, schedule]);

  return { autoRefreshInterval, nextRefreshAt, setAutoRefresh: schedule };
}

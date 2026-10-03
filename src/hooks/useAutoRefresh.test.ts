import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRefresh } from "./useAutoRefresh";
import { AUTO_REFRESH_KEY } from "../constants";

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("useAutoRefresh", () => {
  it("returns off by default on mount", async () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useAutoRefresh(refresh));
    expect(result.current.autoRefreshInterval).toBe("off");
    expect(result.current.nextRefreshAt).toBeNull();
  });

  it("schedules refresh at remaining time when savedNextRefreshAt is in the future", async () => {
    vi.useFakeTimers({ now: new Date("2025-06-15T12:00:00Z") });

    const future = new Date("2025-06-15T12:01:00Z").toISOString();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoRefresh(refresh));

    act(() => {
      result.current.setAutoRefresh("1hour", future);
    });

    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("schedules full interval when savedNextRefreshAt is in the past", async () => {
    vi.useFakeTimers({ now: new Date("2025-06-15T12:00:00Z") });

    const past = new Date("2025-06-15T11:00:00Z").toISOString();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoRefresh(refresh));

    const intervalMs = 30 * 60_000;

    act(() => {
      result.current.setAutoRefresh("30min", past);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(intervalMs - 1);
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("schedules full interval when savedNextRefreshAt is null", async () => {
    vi.useFakeTimers({ now: new Date("2025-06-15T12:00:00Z") });

    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoRefresh(refresh));

    const intervalMs = 60 * 60_000;

    act(() => {
      result.current.setAutoRefresh("1hour", null);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(intervalMs - 1);
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("persists interval and nextRefreshAt to localStorage on schedule", () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useAutoRefresh(refresh));

    act(() => {
      result.current.setAutoRefresh("1hour");
    });

    const saved = JSON.parse(localStorage.getItem(AUTO_REFRESH_KEY) || "{}");
    expect(saved.interval).toBe("1hour");
    expect(saved.nextRefreshAt).not.toBeNull();
  });
});

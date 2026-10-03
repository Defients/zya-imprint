import { fetchWithTimeout } from "./utils";

export type RuntimeApiMode = "auto" | "enabled" | "disabled";

const rawMode = String(import.meta.env.VITE_RUNTIME_API || "auto").toLowerCase();
export const RUNTIME_API_MODE: RuntimeApiMode = rawMode === "enabled" || rawMode === "disabled" ? rawMode : "auto";

const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${configuredApiBase}${normalizedPath}`;
}

let availabilityPromise: Promise<boolean> | null = null;
let availabilityCheckedAt = 0;
const AVAILABILITY_TTL_MS = 60_000;

export async function hasRuntimeApi(force = false): Promise<boolean> {
  if (RUNTIME_API_MODE === "disabled") return false;
  if (RUNTIME_API_MODE === "enabled") return true;

  const now = Date.now();
  if (!force && availabilityPromise && now - availabilityCheckedAt < AVAILABILITY_TTL_MS) {
    return availabilityPromise;
  }

  availabilityCheckedAt = now;
  availabilityPromise = fetchWithTimeout(apiUrl("/api/health"), 2500)
    .then(async (response) => {
      if (!response.ok) return false;
      const payload = await response.json().catch(() => null);
      return payload?.ok === true;
    })
    .catch(() => false);

  return availabilityPromise;
}

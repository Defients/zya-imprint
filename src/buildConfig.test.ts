import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "vite";

afterEach(() => vi.unstubAllEnvs());
describe("deployment build contract", () => {
  it("forces Neocities builds into cache-only mode despite an API-enabled environment", async () => {
    vi.stubEnv("VITE_RUNTIME_API", "enabled");
    const config = await resolveConfig({ mode: "neocities" }, "build");
    expect(config.define["import.meta.env.VITE_RUNTIME_API"]).toBe('"disabled"');
  });
  it("preserves API configuration for standard Node builds", async () => {
    vi.stubEnv("VITE_RUNTIME_API", "enabled");
    const config = await resolveConfig({ mode: "production" }, "build");
    expect(config.define["import.meta.env.VITE_RUNTIME_API"]).toBeUndefined();
    expect(config.env.VITE_RUNTIME_API).toBe("enabled");
  });
});

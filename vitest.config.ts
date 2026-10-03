import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "browser",
          environment: "jsdom",
          setupFiles: ["./src/test-setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/server.test.ts", "src/tracker.test.ts", "src/collector.test.ts", "src/buildConfig.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["src/server.test.ts", "src/tracker.test.ts", "src/collector.test.ts", "src/buildConfig.test.ts"]
        }
      }
    ]
  }
});

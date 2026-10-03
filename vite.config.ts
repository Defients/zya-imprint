import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: env.VITE_BASE_PATH || "/zya-imprint/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, ".") } },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-vendor")) return "charts";
            if (id.includes("node_modules/lucide-react")) return "icons";
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
          }
        }
      }
    },
    server: { hmr: process.env.DISABLE_HMR !== "true" }
  };
});

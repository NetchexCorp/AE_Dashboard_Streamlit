import path from "node:path";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === "analyze"
      ? visualizer({
          filename: "dist/bundle-stats.html",
          open: false,
          gzipSize: true,
          brotliSize: true,
        })
      : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core — used everywhere, ships in initial bundle.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/")
          ) {
            return "react-vendor";
          }
          // TanStack libs are big enough to warrant their own chunk.
          if (
            id.includes("node_modules/@tanstack/react-query/") ||
            id.includes("node_modules/@tanstack/react-router/")
          ) {
            return "tanstack";
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: {
      // VITE_API_PROXY_TARGET lets docker-compose override to the API
      // container hostname; default forces IPv4 to avoid Docker Desktop
      // grabbing port 8000 over IPv6 on the host.
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/healthz": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
}));

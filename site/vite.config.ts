import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The public website. Built files go to platform/static/site/ and are committed, like platform/static/new/, so the
// live server shows them at /static/site/ after a git pull, with no Node there.
// In dev, /api is proxied to a local platform (GZ_API, default :8190) and /live-api to the live server, GET only,
// for the real plant tile; GZ_LIVE_API points it elsewhere (a dead port in the G9 gate).
export default defineConfig({
  base: "/static/site/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../platform/static/site",
    emptyOutDir: true,
    rollupOptions: {
      output: { manualChunks: { react: ["react", "react-dom"], motion: ["motion", "motion/react"], charts: ["recharts"] } },
    },
  },
  server: {
    port: Number(process.env.PORT || 5180),
    strictPort: true,
    proxy: {
      "/api": process.env.GZ_API || "http://localhost:8190",
      "/live-api": {
        target: process.env.GZ_LIVE_API || "https://gridzilla.victronlab.sk",
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/live-api/, "/api"),
      },
    },
  },
  preview: {
    proxy: {
      "/live-api": {
        target: process.env.GZ_LIVE_API || "https://gridzilla.victronlab.sk",
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/live-api/, "/api"),
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Built files go to platform/static/new/ and are committed, so the platform serves them from disk with no Node.
// In dev, /api is proxied to a local platform (dashboard/dev/stack.sh starts one on :8081).
export default defineConfig({
  base: "/static/new/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../platform/static/new",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // The pitch deck (pitch.html) is built next to the console (index.html).
      input: { index: "index.html", pitch: "pitch.html" },
      // React has its own chunk, and only three.js itself goes in "three": a page that never draws 3D (phones) never
      // loads a three-*.js file (before, React and Vite's preload helper sat in it, so every page preloaded it)
      output: {
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (/node_modules\/(three|three-stdlib|@react-three\/[^/]+)\//.test(id)) return "three";
          if (/node_modules\/recharts\//.test(id)) return "charts";
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": process.env.GZ_API || "http://localhost:8081",
      "/openapi.json": process.env.GZ_API || "http://localhost:8081",
      // the demo's Blatnica card always reads the real plant from the live server (GET only, like the deck's proxy);
      // GZ_LIVE_API points it elsewhere, e.g. http://localhost:8081 for local tests that must not touch the live server
      "/live-api": {
        target: process.env.GZ_LIVE_API || "https://gridzilla.victronlab.sk",
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/live-api/, "/api"),
      },
    },
  },
});

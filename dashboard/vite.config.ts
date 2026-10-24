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
      // A "Keynote stage" at index.html, B "Apple Home energy" at b.html: two directions, one data layer.
      input: { index: "index.html", b: "b.html" },
      output: { manualChunks: { three: ["three", "@react-three/fiber", "@react-three/drei"], charts: ["recharts"] } },
    },
  },
  server: { port: 5174, proxy: { "/api": process.env.GZ_API || "http://localhost:8081", "/openapi.json": process.env.GZ_API || "http://localhost:8081" } },
});

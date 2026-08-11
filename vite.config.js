import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    target: "es2020",
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        // three is ~165 KB gz and changes rarely — give it its own long-lived chunk
        // so shipping a gameplay tweak doesn't invalidate the engine for returning players.
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },
  server: { port: 5173, host: true },
});

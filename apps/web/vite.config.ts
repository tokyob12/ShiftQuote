import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/route-api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/hl": {
        target: "https://api.hyperliquid.xyz",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hl/, ""),
      },
    },
  },
});

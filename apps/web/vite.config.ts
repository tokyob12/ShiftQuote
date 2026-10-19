import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/hl": {
        target: "https://api.hyperliquid.xyz",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hl/, ""),
      },
    },
  },
});

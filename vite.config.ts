import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        id: process.env.VITE_BASE || "/",
        name: "締め台帳",
        short_name: "締め台帳",
        description: "キャバクラの締め。売上・給料・現金を毎日3分で記録します。",
        lang: "ja",
        dir: "ltr",
        start_url: process.env.VITE_BASE || "/",
        scope: process.env.VITE_BASE || "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        background_color: "#0B0D11",
        theme_color: "#0B0D11",
        categories: ["business", "finance", "productivity"],
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "今日の日報", short_name: "日報", url: (process.env.VITE_BASE || "/") + "?tab=day" },
          { name: "キャストの給料", short_name: "キャスト", url: (process.env.VITE_BASE || "/") + "?tab=cast" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] }
    })
  ],
  test: { environment: "jsdom", globals: false }
} as any);

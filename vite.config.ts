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
        name: "締め台帳 レジ",
        short_name: "締め台帳",
        description: "ガールズバーのレジと締め。会計を打つと、その日の売上・給料がそのまま日報になります。",
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
          { name: "レジを開く", short_name: "レジ", url: (process.env.VITE_BASE || "/") + "?tab=reg" },
          { name: "今日の日報", short_name: "日報", url: (process.env.VITE_BASE || "/") + "?tab=day" },
          { name: "キャストの給料", short_name: "キャスト", url: (process.env.VITE_BASE || "/") + "?tab=cast" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // フォントは Google の CDN にある。店内の電波が悪いと字が出ないので、
        // 一度読めたぶんを端末に持っておく。
        // （フォント本体を同梱しない理由: IBM Plex Sans JP は日本語ぶんだけで
        //   数MBあり、precache に入れると初回と更新が重くなる）
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-files",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      }
    })
  ],
  test: { environment: "jsdom", globals: false }
} as any);

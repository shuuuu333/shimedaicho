import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** 1 つのコードから 2 つのアプリを出す。
 *  VITE_APP=cast のときだけ、名前・アイコン・入口が変わる。
 *  中身（計算・保存・同期）は同じものを使う。 */
const CAST = process.env.VITE_APP === "cast";
const BASE = process.env.VITE_BASE || "/";
const APP_NAME = CAST ? "キャスト手帳" : "締め台帳";

export default defineConfig({
  base: BASE,
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    // index.html は 1 つしかないので、キャスト手帳のときだけ名前とアイコンを差し替える。
    // 2 つ置くと、直したときに片方だけ古くなる
    {
      name: "app-name",
      transformIndexHtml(html: string) {
        if (!CAST) return html;
        return html
          .replace(/<title>[^<]*<\/title>/, "<title>キャスト手帳</title>")
          .replace(/content="締め台帳"/g, 'content="キャスト手帳"')
          .replace(/(href|content)="([^"]*)(apple-touch-icon\.png|icon\.svg|icon-192\.png|icon-512\.png)"/g,
                   (_m, a: string, pre: string, f: string) => `${a}="${pre}cast-${f}"`);
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: CAST ? ["cast-icon.svg", "cast-apple-touch-icon.png"] : ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        id: BASE,
        name: CAST ? "キャスト手帳 — シフトと給料" : "締め台帳 レジ",
        short_name: APP_NAME,
        description: CAST
          ? "自分のシフトと給料。来月の希望もここから出せます。"
          : "ガールズバーのレジと締め。会計を打つと、その日の売上・給料がそのまま日報になります。",
        lang: "ja",
        dir: "ltr",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        background_color: "#0B0D11",
        theme_color: "#0B0D11",
        categories: CAST ? ["productivity", "lifestyle"] : ["business", "finance", "productivity"],
        icons: CAST ? [
          { src: "cast-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "cast-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "cast-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "cast-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ] : [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // キャスト手帳には近道を置かない。入口が 1 つしかない
        shortcuts: CAST ? [] : [
          { name: "レジを開く", short_name: "レジ", url: BASE + "?tab=reg" },
          { name: "今日の日報", short_name: "日報", url: BASE + "?tab=day" },
          { name: "キャストの給料", short_name: "キャスト", url: BASE + "?tab=cast" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // 紹介ページ（/lp/）はアプリではない。除けておかないと、
        // 一度アプリを入れた端末では Service Worker が
        // どの行き先にもアプリの index.html を返してしまう
        // 紹介ページと、もう一方のアプリ（/cast/）は別物。
        // 除けておかないと、店用の Service Worker がキャスト手帳の行き先にも
        // 自分の index.html を返してしまう
        navigateFallbackDenylist: CAST ? [/\/lp\//] : [/\/lp\//, /\/cast\//],
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

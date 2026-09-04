import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0") },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "締め台帳",
        short_name: "締め台帳",
        description: "売上・給料・現金の締め",
        lang: "ja",
        start_url: process.env.VITE_BASE || "/",
        scope: process.env.VITE_BASE || "/",
        display: "standalone",
        background_color: "#0B0D11",
        theme_color: "#0B0D11",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] }
    })
  ],
  test: { environment: "jsdom", globals: false }
} as any);

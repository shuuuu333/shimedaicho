import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import { registerSW } from "virtual:pwa-register";

/** 新しい版が出たら自動で入れ替える。
 *  ホーム画面のアプリは古い版を抱えたままになりやすいので、
 *  ①入れ替わったら読み込み直す ②開くたび・1時間ごとに確認する。 */
let reloading = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
export const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { void reg.update().catch(() => {}); };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    window.addEventListener("online", check);
  },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

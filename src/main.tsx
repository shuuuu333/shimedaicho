import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import { registerSW } from "virtual:pwa-register";
import { flushNotify } from "./state/notify";

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

/** 端末の容量が足りなくなったとき、勝手に消される対象から外してもらう。
 *  伝票と台帳は端末内のデータベースにしかないので、消えると戻せない。
 *  ホーム画面に追加されていれば、たいていの端末は黙って許可する。
 *  断られても動きは変わらない（だからバックアップの督促も残してある）。 */
void (async () => {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch { /* 使えない端末では何もしない */ }
})();

/** ためている営業中の通知を、閉じる前に送り切る。
 *  1 時間まとめにしていると、閉店して画面を閉じた時点で最後のぶんが残るため */
window.addEventListener("pagehide", () => { flushNotify(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNotify(); });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

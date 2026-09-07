/** レジを開いているあいだ、画面を消させない。
 *  接客中に暗くなって、打った内容を見失う・打ち直すのを防ぐ。
 *
 *  画面を離れたら必ず解放する（つけっぱなしは電池を食う）。
 *  タブが隠れると端末側で自動的に外れるので、戻ってきたら取り直す。
 *  対応していない端末（iOS 16.4 未満など）では何も起きない。 */
import { useEffect } from "react";

type Sentinel = { release: () => Promise<void>; released: boolean };
type WakeLockNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };

export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try { sentinel = await nav.wakeLock!.request("screen"); }
      catch { /* 電池が少ない等で断られることがある。そのときは諦める */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [on]);
}

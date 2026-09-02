import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "");

/** 右上の保存状態。クラウド同期中はその状態を優先して出す。タップで設定へ */
export function SaveStatus() {
  const save = useApp((s) => s.save);
  const at = useApp((s) => s.lastSavedAt);
  const go = useApp((s) => s.goSettings);
  const cloud = useCloud((s) => s.status);
  const syncAt = useCloud((s) => s.lastSyncAt);
  const hasShop = useCloud((s) => !!s.shopId && !!s.session);

  let st: string, txt: string, sec = "data";
  if (hasShop && save !== "error") {
    sec = "cloud";
    const m: Record<string, [string, string]> = {
      syncing: ["saving", "同期中"],
      synced: ["saved", syncAt ? `同期済み ${hhmm(syncAt)}` : "同期済み"],
      offline: ["local", "オフライン・端末に保存"],
      error: ["error", "同期エラー"],
      noshop: ["local", "端末に保存"],
      signedout: ["local", "端末に保存"],
      off: ["local", "端末に保存"],
    };
    [st, txt] = m[cloud] ?? m.off;
    if (save === "saving" && cloud === "synced") [st, txt] = ["saving", "保存中"];
  } else {
    const m = {
      loading: ["idle", "読み込み中"],
      saving: ["saving", "保存中"],
      saved: ["saved", at ? `保存済み ${hhmm(at)}` : "保存済み"],
      error: ["error", "保存できません"],
    } as const;
    [st, txt] = m[save];
  }
  return (
    <button type="button" className="savechip" data-s={st} onClick={() => go(sec)} aria-label={`保存状態: ${txt}`}>
      <i className="savedot" /><span>{txt}</span>
    </button>
  );
}

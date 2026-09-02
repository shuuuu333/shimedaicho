import { useApp } from "../../state/store";

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "");

/** 右上の保存状態。タップで設定のデータ欄へ */
export function SaveStatus() {
  const save = useApp((s) => s.save);
  const at = useApp((s) => s.lastSavedAt);
  const go = useApp((s) => s.goSettings);
  const map = {
    loading: ["idle", "読み込み中"],
    saving: ["saving", "保存中"],
    saved: ["saved", at ? `保存済み ${hhmm(at)}` : "保存済み"],
    error: ["error", "保存できません"],
  } as const;
  const [st, txt] = map[save];
  return (
    <button type="button" className="savechip" data-s={st} onClick={() => go("data")} aria-label={`保存状態: ${txt}`}>
      <i className="savedot" /><span>{txt}</span>
    </button>
  );
}

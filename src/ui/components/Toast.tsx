import { useApp } from "../../state/store";

export function Toast() {
  const toast = useApp((s) => s.toast);
  const undo = useApp((s) => s.undo);
  return (
    <div className={`toast ${toast ? "on" : ""} ${toast?.undo ? "act" : ""}`} role="status" aria-live="polite">
      {toast && <span>{toast.msg}</span>}
      {toast?.undo && <button type="button" className="undo" onClick={undo}>元に戻す</button>}
    </div>
  );
}

import { useState } from "react";
import { useCloud } from "../../state/cloud";
import { LoginForm } from "./LoginForm";

const LS_KEY = "shimedaicho.welcomed";
const seen = () => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(LS_KEY, "1"); } catch { /* ignore */ } };

/** 初回に出す入口。ログインして始めるか、ログインせずに始めるかを選ぶ。
 *  あとから設定 →「クラウド同期」でいつでもログインできる。 */
export function Welcome() {
  const configured = useCloud((s) => s.configured);
  const session = useCloud((s) => s.session);
  const [open, setOpen] = useState(() => !seen());
  const [mode, setMode] = useState<"choose" | "login">("choose");

  const close = () => { markSeen(); setOpen(false); };
  if (!open || !configured || session) return null;

  return (
    <div className="sheetwrap" role="dialog" aria-modal="true" aria-label="ようこそ">
      <div className="sheet welcome">
        <div className="sheetbody">
          {mode === "choose" ? (
            <>
              <div className="wmark">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" />
                </svg>
              </div>
              <h1 className="wtitle">締め台帳</h1>
              <p className="wsub">売上・給料・現金の締めを、毎日3分で。</p>

              <button type="button" className="btn primary wide" style={{ minHeight: 54, marginTop: 22 }} onClick={() => setMode("login")}>
                ログインして始める
              </button>
              <p className="whint">スマホとパソコン、スタッフの端末で同じデータになります。バックアップも自動です。</p>

              <button type="button" className="btn wide" style={{ minHeight: 50, marginTop: 14 }} onClick={close}>
                ログインせずに始める
              </button>
              <p className="whint">この端末の中だけに保存します。あとから設定の「クラウド同期」でログインできます。</p>
            </>
          ) : (
            <>
              <div className="sheethead" style={{ padding: "2px 0 10px" }}>
                <b>ログイン</b>
                <button type="button" className="btn sm ghost" onClick={() => setMode("choose")}>戻る</button>
              </div>
              <LoginForm onDone={close} />
              <div className="btnrow" style={{ marginTop: 14, justifyContent: "center" }}>
                <button type="button" className="btn sm ghost" onClick={close}>あとにする</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

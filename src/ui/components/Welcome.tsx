import { useState } from "react";
import { useCloud } from "../../state/cloud";
import { useApp } from "../../state/store";
import { demoLedger, DEMO_FLAG } from "../../domain/demo";
import { todayISO } from "../../domain/format";
import { APP_NAME, IS_CAST_APP } from "../../appMode";
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

  const update = useApp((s) => s.update);
  const showToast = useApp((s) => s.showToast);
  const close = () => { markSeen(); setOpen(false); };

  /** お試しデータで中を見る。
   *  はじめて来た人には「今月」が全部 ¥0 の白い画面に見えるので、
   *  触ってから決めてもらえるように 1 か月ぶんを入れる。
   *  すでに何か入っている端末では出さない（上書きしない） */
  const tryDemo = () => {
    const d = demoLedger(todayISO());
    update((L) => { Object.assign(L, d); });
    try { localStorage.setItem(DEMO_FLAG, "1"); } catch { /* ignore */ }
    markSeen();
    setOpen(false);
    showToast("お試しデータを入れました。設定 → データ から消せます");
  };
  if (!open || !configured || session) return null;

  return (
    <div className="sheetwrap" role="dialog" aria-modal="true" aria-label="ようこそ">
      <div className="sheet welcome">
        <div className="sheetbody">
          {mode === "choose" ? (
            <>
              <div className="wmark">
                {IS_CAST_APP ? (
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 17l5-4 4 2 7-9" /><circle cx="20" cy="6" r="1.6" />
                  </svg>
                ) : (
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" />
                  </svg>
                )}
              </div>
              <h1 className="wtitle">{APP_NAME}</h1>
              <p className="wsub">{IS_CAST_APP ? "自分のシフトと給料を、自分で。" : "売上・給料・現金の締めを、毎日3分で。"}</p>

              {/* キャスト手帳は、お店からもらう QR で入る作りにしてある。
                  自分で店を作る画面を出すと、入る前に迷う所が増える */}
              {IS_CAST_APP ? (
                <>
                  <p className="whint" style={{ marginTop: 20 }}>
                    <b style={{ color: "var(--ink)" }}>お店からもらった QR を読むと、そのまま始められます。</b><br />
                    メールもパスワードもいりません。スマホのカメラで読んでください。
                  </p>
                  <button type="button" className="btn primary wide" style={{ minHeight: 54, marginTop: 18 }} onClick={() => setMode("login")}>
                    メールでログインする
                  </button>
                  <p className="whint">QR ではなく、お店にメールアドレスを伝えている場合はこちら。</p>
                  <button type="button" className="btn wide" style={{ minHeight: 46, marginTop: 14 }} onClick={tryDemo}>
                    お試しデータで中を見る
                  </button>
                  <p className="whint">1 か月ぶんの記録が入った状態で開きます。設定 → データ からいつでも消せます。</p>
                </>
              ) : (
                <>
                  <button type="button" className="btn primary wide" style={{ minHeight: 54, marginTop: 22 }} onClick={() => setMode("login")}>
                    ログインして始める
                  </button>
                  <p className="whint">スマホとパソコン、スタッフの端末で同じデータになります。バックアップも自動です。</p>

                  <button type="button" className="btn wide" style={{ minHeight: 50, marginTop: 14 }} onClick={close}>
                    ログインせずに始める
                  </button>
                  <p className="whint">この端末の中だけに保存します。あとから設定の「クラウド同期」でログインできます。</p>

                  <button type="button" className="btn wide" style={{ minHeight: 46, marginTop: 14 }} onClick={tryDemo}>
                    お試しデータで中を見る
                  </button>
                  <p className="whint">1 か月ぶんの記録が入った状態で開きます。設定 → データ からいつでも消せます。</p>
                </>
              )}
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

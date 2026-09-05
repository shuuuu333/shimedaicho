import { useEffect, useState } from "react";
import { useCloud } from "../../state/cloud";
import { Notice } from "./Notice";

/** メールが届かないときの案内 */
export function LoginHelp() {
  return (
    <details className="help">
      <summary>メールが届かないときは</summary>
      <ul>
        <li>迷惑メールのフォルダを見てください。Gmail なら「プロモーション」タブにも入ることがあります。</li>
        <li>件名は「締め台帳 ログインコード」です。同じ件名は 1 つの会話にまとまるので、開いて一番下の新しいものを見てください。</li>
        <li>数分たっても来なければ「もう一度送る」を押してください。</li>
        <li>コードは 1 時間で切れます。切れたら送り直してください。</li>
        <li>それでも来ないときは、別のメールアドレスで試すか、オーナーに伝えてください。</li>
      </ul>
    </details>
  );
}

/** ①メールを入れる ②届いた6桁を入れる の2段。ようこそ画面と設定の両方で使う */
export function LoginForm({ onDone }: { onDone?: () => void }) {
  const c = useCloud();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => { if (c.session) onDone?.(); }, [c.session, onDone]);

  const send = (to: string) => { void c.signIn(to); setWait(60); };

  if (c.linkSent && c.pendingEmail) {
    return (
      <>
        <div className="steprow">
          <span className="stepno done">1</span>
          <div className="g"><div className="t">{c.pendingEmail}</div><div className="s">にメールを送りました</div></div>
          <button type="button" className="btn sm ghost" disabled={c.busy}
            onClick={() => { useCloud.setState({ linkSent: false, pendingEmail: null, error: null }); setCode(""); }}>直す</button>
        </div>
        <div className="steprow"><span className="stepno now">2</span>
          <div className="g"><div className="t">届いた 6 桁を入れる</div><div className="s">件名は「締め台帳 ログインコード」</div></div></div>

        <label className="field" style={{ marginTop: 12 }}>
          <input className="inp num big" style={{ textAlign: "center", letterSpacing: ".38em", fontSize: 30 }} type="text"
            inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="000000" value={code} autoFocus
            aria-label="メールに書かれたコード"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            onKeyDown={(e) => { if (e.key === "Enter" && code.length >= 6) void c.verifyCode(code); }} /></label>
        <button type="button" className="btn primary wide" style={{ minHeight: 50 }} disabled={c.busy || code.length < 6}
          onClick={() => c.verifyCode(code)}>ログイン</button>
        {c.error && <div style={{ marginTop: 10 }}><Notice bad>{c.error}</Notice></div>}
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm" disabled={c.busy || wait > 0} onClick={() => send(c.pendingEmail!)}>
            {wait > 0 ? `もう一度送る（${wait}秒）` : "もう一度送る"}
          </button>
        </div>
        <LoginHelp />
      </>
    );
  }

  return (
    <>
      <div className="steprow"><span className="stepno now">1</span>
        <div className="g"><div className="t">メールアドレスを入れる</div><div className="s">パスワードはありません</div></div></div>
      <label className="field" style={{ marginTop: 10 }}>
        <input className="inp" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
          aria-label="メールアドレス" onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) send(email); }} /></label>
      <button type="button" className="btn primary wide" style={{ minHeight: 50 }} disabled={c.busy || !email.includes("@")}
        onClick={() => send(email)}>ログイン用のメールを送る</button>
      {c.error && <div style={{ marginTop: 10 }}><Notice bad>{c.error}</Notice></div>}
      <div className="steprow" style={{ marginTop: 10 }}><span className="stepno">2</span>
        <div className="g"><div className="t">届いた 6 桁を入れる</div><div className="s">それだけでログインできます</div></div></div>
      <LoginHelp />
    </>
  );
}

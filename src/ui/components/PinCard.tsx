import { useState } from "react";
import { useApp } from "../../state/store";
import { clearPin, hasPin, lock, setPin, validPin } from "../../data/pin";
import { Notice } from "./Notice";

/** 端末の暗証番号。レジはカウンターに置かれてキャストも触るので、
 *  給料と利益が見える画面だけを隠す */
export function PinCard() {
  const showToast = useApp((s) => s.showToast);
  const [on, setOn] = useState(hasPin());
  const [mode, setMode] = useState<null | "set" | "off">(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setMode(null); setA(""); setB(""); setErr(null); };

  const save = async () => {
    if (!validPin(a)) { setErr("4〜8 桁の数字で入れてください"); return; }
    if (a !== b) { setErr("2 回の入力が違います"); return; }
    await setPin(a);
    setOn(true); reset();
    showToast("暗証番号を決めました");
  };

  const off = async () => {
    if (!(await clearPin(a))) { setErr("番号が違います"); return; }
    setOn(false); reset();
    showToast("暗証番号をやめました");
  };

  return (
    <div className="card" id="set-pin">
      <h2>暗証番号</h2>
      <p className="sub">設定・キャスト・今月（時給と利益が見える画面）を隠します。レジと日報は番号なしで使えます。</p>

      {!on && mode !== "set" && (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>
            今は誰でも全部見られます。カウンターに端末を置くなら決めておくと安心です。
          </div>
          <button type="button" className="btn wide" onClick={() => { reset(); setMode("set"); }}>暗証番号を決める</button>
        </>
      )}

      {on && !mode && (
        <div className="btnrow">
          <button type="button" className="btn sm" onClick={() => { reset(); setMode("set"); }}>番号を変える</button>
          <button type="button" className="btn sm" onClick={() => { reset(); setMode("off"); }}>やめる</button>
          <button type="button" className="btn sm" onClick={() => { lock(); showToast("鍵をかけました"); }}>今すぐ鍵をかける</button>
        </div>
      )}

      {mode === "set" && (
        <>
          <label className="field"><span className="lbl">新しい番号（4〜8 桁）</span>
            <input className="inp" type="password" inputMode="numeric" autoComplete="new-password"
              value={a} onChange={(e) => { setA(e.target.value.replace(/\D/g, "")); setErr(null); }} /></label>
          <label className="field"><span className="lbl">もう一度</span>
            <input className="inp" type="password" inputMode="numeric" autoComplete="new-password"
              value={b} onChange={(e) => { setB(e.target.value.replace(/\D/g, "")); setErr(null); }} /></label>
          <div className="btnrow">
            <button type="button" className="btn primary" onClick={() => void save()}>決める</button>
            <button type="button" className="btn" onClick={reset}>やめる</button>
          </div>
        </>
      )}

      {mode === "off" && (
        <>
          <label className="field"><span className="lbl">今の番号</span>
            <input className="inp" type="password" inputMode="numeric" autoComplete="current-password"
              value={a} onChange={(e) => { setA(e.target.value.replace(/\D/g, "")); setErr(null); }} /></label>
          <div className="btnrow">
            <button type="button" className="btn danger" onClick={() => void off()}>番号をやめる</button>
            <button type="button" className="btn" onClick={reset}>やめる</button>
          </div>
        </>
      )}

      {err && <Notice bad title="やり直してください">{err}</Notice>}

      <div className="hint" style={{ marginTop: 10 }}>
        これは「うっかり見えてしまう」を防ぐためのものです。端末そのものを預ける相手には、
        クラウド同期の<b>役割</b>（スタッフ／キャスト）で分けてください。
      </div>
    </div>
  );
}

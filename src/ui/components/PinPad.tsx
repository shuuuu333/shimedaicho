import { useState } from "react";
import { validPin, verify } from "../../data/pin";

/** 暗証番号の入力。レジの現場で片手で押せるよう、数字を大きく並べる */
export function PinPad({ title, note, onOk, onCancel }: {
  title: string;
  note?: string;
  onOk: () => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  // 早く押しても桁が落ちないように、直前の値から作る（レジは指が速い）
  const push = (n: string) => { setErr(false); setPin((p) => (p.length < 8 ? p + n : p)); };
  const back = () => { setErr(false); setPin((p) => p.slice(0, -1)); };

  const submit = async () => {
    if (!validPin(pin) || busy) return;
    setBusy(true);
    const ok = await verify(pin);
    setBusy(false);
    if (ok) { onOk(); return; }
    setPin("");
    setErr(true);   // 入力を消したあとに立てる。消した拍子に消えないように
  };

  return (
    <div className="pinwrap">
      <div className="pinbox">
        <b>{title}</b>
        {note && <div className="hint" style={{ marginTop: 4 }}>{note}</div>}
        <div className={`pindots ${err ? "err" : ""}`} aria-live="polite">
          {[0, 1, 2, 3, 4, 5, 6, 7].slice(0, Math.max(4, pin.length)).map((i) => (
            <span key={i} className={i < pin.length ? "on" : ""} />
          ))}
        </div>
        {err && <div className="hint neg">番号が違います</div>}
        <div className="pingrid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <button key={n} type="button" className="btn" onClick={() => push(n)}>{n}</button>
          ))}
          <button type="button" className="btn" onClick={back} aria-label="1文字消す">←</button>
          <button type="button" className="btn" onClick={() => push("0")}>0</button>
          <button type="button" className="btn primary" disabled={!validPin(pin) || busy} onClick={() => void submit()}>OK</button>
        </div>
        {onCancel && <button type="button" className="btn wide" style={{ marginTop: 10 }} onClick={onCancel}>やめる</button>}
      </div>
    </div>
  );
}

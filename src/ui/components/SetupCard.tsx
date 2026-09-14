import { useState } from "react";
import { useApp } from "../../state/store";
import { needsSetup, remainingSteps, setupProgress, SETUP_STEPS } from "../../domain/setup";
import { ChevRight } from "../icons";

/** 済ませた手順の覚え書き。
 *
 *  台帳ではなく端末に置いている。店名やキャストのように中身から分かるものは
 *  どの端末でも消えるし、残りは「自分の目で確かめたか」なので端末ごとでいい。
 *  台帳に足すと、移行のたびに面倒を見る欄がひとつ増える。 */
const LS = "shimedaicho.setup";
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(LS) ?? "[]") as string[]; } catch { return []; } };
const save = (v: string[]) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* ignore */ } };

/** はじめの設定。あと何を直せば「自分の店の数字」になるかを出す。
 *
 *  新しい店は、値段も時給もバックもよその店の数字が入った状態で始まる。
 *  そのままレジを打つと合わない金額が出て、そこで信用を失う。
 *  何が残っているかを見えるようにしておく。 */
export function SetupCard() {
  const L = useApp((s) => s.ledger);
  const setUI = useApp((s) => s.setUI);
  const [done, setDone] = useState<string[]>(load);
  const [hidden, setHidden] = useState(false);

  if (hidden || !needsSetup(L, done)) return null;
  const left = remainingSteps(L, done);
  const p = setupProgress(L, done);

  const tick = (id: string) => { const v = [...done, id]; setDone(v); save(v); };
  const go = (s: typeof SETUP_STEPS[number]) => {
    if (s.tab) { setUI({ tab: s.tab, sheet: null }); window.scrollTo(0, 0); return; }
    setUI({ tab: "set", setFocus: s.anchor, sheet: null });
  };

  return (
    <div className="card setupcard">
      <div className="cardhead">
        <h2>はじめの設定</h2>
        <span className="pill warn">あと {left.length}</span>
      </div>
      <p className="sub">
        いま入っている値段や単価は<b>よその店の数字</b>です。直さないまま打つと、合わない金額が出ます。
      </p>
      <div className="setupbar" aria-hidden="true"><i style={{ width: `${(p.done / p.total) * 100}%` }} /></div>

      {left.map((s) => (
        <div key={s.id} className="setuprow">
          <button type="button" className="g" onClick={() => go(s)}>
            <span className="t">{s.title}</span>
            <span className="s">{s.why}</span>
          </button>
          {s.ask
            ? <button type="button" className="btn sm" onClick={() => tick(s.id)}>確かめた</button>
            : <ChevRight size={16} className="chevi" />}
        </div>
      ))}

      <button type="button" className="btn sm wide" style={{ marginTop: 12 }} onClick={() => setHidden(true)}>
        あとでやる
      </button>
    </div>
  );
}

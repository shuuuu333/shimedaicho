import { useState } from "react";
import { useApp } from "../../state/store";
import { defaultBacks, defaultMenu, defaultPosRule, defaultSeats } from "../../domain/migrate";
import { uid } from "../../domain/format";
import { NumberField } from "../components/NumberField";
import { Trash } from "../icons";
import type { MenuItem } from "../../domain/types";

/** レジの設定（会計ルール・商品・席）。設定画面のカードとして並ぶ */
export function PosSettings() {
  const L = useApp((s) => s.ledger);
  const update = useApp((s) => s.update);
  const updateWithUndo = useApp((s) => s.updateWithUndo);
  const rule = L.posRule ?? defaultPosRule();
  const menu = L.menu ?? [];
  const seats = L.seats ?? [];
  const [openCat, setOpenCat] = useState<string | null>(null);

  const setRule = (patch: Partial<typeof rule>) =>
    update((D) => { D.posRule = { ...(D.posRule ?? defaultPosRule()), ...patch }; });
  const setItem = (id: string, patch: Partial<MenuItem>) =>
    update((D) => { const m = (D.menu ?? []).find((x) => x.id === id); if (m) Object.assign(m, patch); });

  const cats = [...new Set(menu.map((m) => m.category))];

  return (
    <>
      <div className="card" id="set-pos">
        <h2>レジの会計ルール</h2>
        <p className="sub">セット料金は「1名あたり × 人数」で計算します。2名でセット ¥3,000 なら ¥6,000 です。</p>
        <div className="row2">
          <label className="field"><span className="lbl">セットの時間（分）</span>
            <NumberField value={rule.setMinutes} onChange={(v) => setRule({ setMinutes: v ?? 60 })} /></label>
          <label className="field"><span className="lbl">セット料金（1名あたり）</span>
            <NumberField value={rule.setPrice} onChange={(v) => setRule({ setPrice: v ?? 0 })} /></label>
        </div>
        <div className="field">
          <span className="lbl">入店のときに 1 タップで選べる金額</span>
          <div className="pricerow">
            {(rule.setPriceOptions ?? []).map((p, i) => (
              <span key={i} className="pricechip">
                <NumberField value={p} aria-label={`料金プラン ${i + 1}`}
                  onChange={(v) => setRule({ setPriceOptions: (rule.setPriceOptions ?? []).map((x, j) => (j === i ? (v ?? 0) : x)) })} />
                <button type="button" className="iconbtn" aria-label={`${p} を消す`}
                  onClick={() => setRule({ setPriceOptions: (rule.setPriceOptions ?? []).filter((_, j) => j !== i) })}>
                  <Trash />
                </button>
              </span>
            ))}
          </div>
          <button type="button" className="btn sm" style={{ marginTop: 8 }}
            onClick={() => setRule({ setPriceOptions: [...(rule.setPriceOptions ?? []), rule.setPrice] })}>＋ 金額を足す</button>
          <div className="hint">¥3,000 / ¥2,500 / ¥2,000 のように並べておくと、入店のときに押すだけで選べます。</div>
        </div>

        <div className="row2">
          <label className="field"><span className="lbl">延長の時間（分）</span>
            <NumberField value={rule.extendMinutes} onChange={(v) => setRule({ extendMinutes: v ?? 30 })} /></label>
          <label className="field"><span className="lbl">延長料金（1名あたり）</span>
            <NumberField value={rule.extendPrice} onChange={(v) => setRule({ extendPrice: v ?? 0 })} /></label>
        </div>
        <div className="row2">
          <label className="field"><span className="lbl">テーブルチャージ（％）</span>
            <NumberField decimal value={rule.tableChargeRate} onChange={(v) => setRule({ tableChargeRate: v ?? 0 })} /></label>
          <label className="field"><span className="lbl">消費税（％）</span>
            <NumberField decimal value={rule.taxRate} onChange={(v) => setRule({ taxRate: v ?? 0 })} /></label>
        </div>
        <label className="lrow" style={{ cursor: "pointer" }}>
          <div className="g">
            <div className="t">テーブルチャージをセット料金にもかける</div>
            <div className="s">切っておくと、商品（ドリンクやチェキ）にだけかかります</div>
          </div>
          <input type="checkbox" checked={rule.tableChargeOnSet} onChange={(e) => setRule({ tableChargeOnSet: e.target.checked })} />
        </label>
        <div className="hint">
          20 と入れると、¥2,000 のキャストドリンクが ¥2,400 になります。
        </div>
        <label className="lrow" style={{ cursor: "pointer" }}>
          <div className="g"><div className="t">単価は税込み</div><div className="s">税込みなら会計で税を上乗せしません</div></div>
          <input type="checkbox" checked={rule.taxIncluded} onChange={(e) => setRule({ taxIncluded: e.target.checked })} />
        </label>
        <div className="row2">
          <label className="field"><span className="lbl">のこり何分で知らせるか</span>
            <NumberField value={rule.alertBeforeMin} onChange={(v) => setRule({ alertBeforeMin: v ?? 10 })} /></label>
          <label className="field"><span className="lbl">会計の丸め（円）</span>
            <NumberField value={rule.roundTo} onChange={(v) => setRule({ roundTo: Math.max(1, v ?? 1) })} /></label>
        </div>
        <div className="hint">丸めは切り捨てです。10 にすると ¥6,908 は ¥6,900 になります。</div>
      </div>

      <div className="card" id="set-menu">
        <h2>商品</h2>
        <p className="sub">「バック」を選んだ商品は、レジで売るときに誰の分かを聞かれ、その本数が日報のバックに入ります。</p>
        {cats.map((cat) => {
          const items = menu.filter((m) => m.category === cat);
          const on = openCat === cat;
          return (
            <div key={cat} className="itemcard">
              <button type="button" className="lrow" onClick={() => setOpenCat(on ? null : cat)}>
                <div className="g"><div className="t">{cat}</div><div className="s">{items.length} 品</div></div>
                <div className="a">{on ? "閉じる" : "開く"}</div>
              </button>
              {on && items.map((m) => (
                <div key={m.id} className="itemcard" style={{ marginTop: 8 }}>
                  <div className="backrow" style={{ gap: 8, border: 0, padding: "0 0 8px" }}>
                    <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} placeholder="商品名"
                      value={m.name} autoFocus={!m.name} onChange={(e) => setItem(m.id, { name: e.target.value })} />
                    <button type="button" className="iconbtn" aria-label={`${m.name || "商品"}を削除`}
                      onClick={() => updateWithUndo(`${m.name.trim() || "商品"} を消しました`, (D) => { D.menu = (D.menu ?? []).filter((y) => y.id !== m.id); })}>
                      <Trash />
                    </button>
                  </div>
                  <div className="row2">
                    <label className="field" style={{ margin: 0 }}><span className="lbl">価格</span>
                      <NumberField value={m.price} onChange={(v) => setItem(m.id, { price: v ?? 0 })} /></label>
                    <label className="field" style={{ margin: 0 }}><span className="lbl">バック</span>
                      <select className="inp" value={m.backItemId ?? ""}
                        onChange={(e) => update((D) => {
                          const x = (D.menu ?? []).find((y) => y.id === m.id);
                          if (!x) return;
                          if (e.target.value) { x.backItemId = e.target.value; x.kind = "castLinked"; }
                          else { delete x.backItemId; x.kind = "normal"; }
                        })}>
                        <option value="">バックなし</option>
                        {L.backItems.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select></label>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => update((D) => {
            (D.menu ??= []).push({ id: uid(), name: "", price: 0, category: openCat ?? cats[0] ?? "ドリンク", kind: "normal", active: true, sort: (D.menu?.length ?? 0) });
            setOpenCat(openCat ?? cats[0] ?? "ドリンク");
          })}>＋ 商品を足す</button>
          <button type="button" className="btn sm" onClick={() => updateWithUndo("商品を雛形に戻しました", (D) => {
            // 雛形の商品は 場内バック・ショットバックを使う。足りないバック項目は足す（既にあるものは触らない）
            const have = new Set(D.backItems.map((b) => b.id));
            for (const b of defaultBacks()) if (!have.has(b.id)) D.backItems.push(b);
            D.menu = defaultMenu();
          })}>雛形に戻す</button>
        </div>
      </div>

      <div className="card" id="set-seats">
        <h2>席</h2>
        <p className="sub">レジの一覧に並びます。カウンターだけの店は番号だけで十分です。</p>
        {seats.map((s) => (
          <div className="backrow" key={s.id} style={{ gap: 8, border: 0, padding: "0 0 8px" }}>
            <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} value={s.name} placeholder="席の名前"
              onChange={(e) => update((D) => { const x = (D.seats ?? []).find((y) => y.id === s.id); if (x) x.name = e.target.value; })} />
            <button type="button" className="iconbtn" aria-label={`${s.name || "席"}を削除`}
              onClick={() => updateWithUndo(`${s.name || "席"} を消しました`, (D) => { D.seats = (D.seats ?? []).filter((y) => y.id !== s.id); })}>
              <Trash />
            </button>
          </div>
        ))}
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => update((D) => {
            (D.seats ??= []).push({ id: uid(), name: "席" + ((D.seats?.length ?? 0) + 1), sort: (D.seats?.length ?? 0) });
          })}>＋ 席を足す</button>
          {seats.length === 0 && (
            <button type="button" className="btn sm" onClick={() => update((D) => { D.seats = defaultSeats(); })}>雛形を入れる</button>
          )}
        </div>
      </div>
    </>
  );
}

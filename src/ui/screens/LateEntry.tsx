/** 紙の伝票を閉店後にまとめて入れる専用の入り口。
 *
 *  営業中の流れ（席 → タイマー → 注文 → 会計）は、閉店後に紙から写す作業に向かない。
 *  1 枚 1 画面・30 秒で終わることを目標にしてある。
 *
 *  守っている決まり
 *  - 金額を打たせない。全部タップで選ぶ（打ち間違いの最大の原因を構造から消す）
 *  - 紙伝票と同じ並び（入店時刻 → 人数 → セット → 延長 → 商品）
 *  - 入れたものが常に下に見えている。選び間違いにその場で気づける
 *  - 確定の前に、もらった額を大きく出す */
import { useMemo, useState } from "react";
import { useApp } from "../../state/store";
import { usePos } from "../../state/pos";
import { checkTotals, lineFromMenu, planLabel, setPlanChoices } from "../../domain/pos";
import { yen } from "../../domain/format";
import { defaultPosRule } from "../../domain/migrate";
import { BottomSheet } from "../components/BottomSheet";
import { TimeField } from "../components/TimeField";
import { Stepper } from "../components/Stepper";
import type { Check, MenuItem, PayKind, SetPlan } from "../../domain/types";

interface Row { key: string; item: MenuItem; castId?: string; castName?: string; qty: number }

export function LateEntrySheet({ onClose }: { onClose: () => void }) {
  const L = useApp((s) => s.ledger);
  const rule = L.posRule ?? defaultPosRule();
  const showToast = useApp((s) => s.showToast);
  const enterFromPaper = usePos((s) => s.enterFromPaper);
  const date = usePos((s) => s.date);

  const seats = useMemo(() => [...(L.seats ?? [])].sort((a, b) => a.sort - b.sort), [L.seats]);
  const menu = useMemo(() => (L.menu ?? []).filter((m) => m.active).sort((a, b) => a.sort - b.sort), [L.menu]);
  const cats = useMemo(() => [...new Set(menu.map((m) => m.category))], [menu]);
  const casts = (L.casts ?? []).filter((c) => c.active !== false);

  const [seatId, setSeatId] = useState<string | null>(seats[0]?.id ?? null);
  const [guests, setGuests] = useState(2);
  const [plan, setPlan] = useState<SetPlan>({ min: rule.setMinutes, price: rule.setPrice });
  const [enteredAt, setEnteredAt] = useState("");
  const [extendTimes, setExtendTimes] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [method, setMethod] = useState<PayKind | null>(null);
  const [tabName, setTabName] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = menu.filter((m) => m.category === (cat ?? cats[0]));

  /** 同じ商品・同じキャストなら 1 行にまとめる。紙の「正の字」と同じ形にする */
  const add = (item: MenuItem, castId?: string) => {
    const castName = castId ? casts.find((c) => c.id === castId)?.name : undefined;
    const key = `${item.id}:${castId ?? ""}`;
    setRows((list) => {
      const i = list.findIndex((r) => r.key === key);
      if (i < 0) return [...list, { key, item, castId, castName, qty: 1 }];
      return list.map((r, j) => (j === i ? { ...r, qty: r.qty + 1 } : r));
    });
  };
  const setQty = (key: string, qty: number) =>
    setRows((list) => (qty <= 0 ? list.filter((r) => r.key !== key) : list.map((r) => (r.key === key ? { ...r, qty } : r))));

  const tap = (m: MenuItem) => {
    if (m.kind === "castLinked") setPicking(m);
    else add(m);
  };

  // 合計は、いま入れたものから伝票を組み立てて出す（会計と同じ計算を通す）
  const total = useMemo(() => {
    const draft: Check = {
      id: "draft", date, seatId, guests: Math.max(1, guests),
      setPrice: plan.price, setMinutes: plan.min, enteredAt: new Date().toISOString(),
      extends: Array.from({ length: Math.max(0, extendTimes) }, () =>
        ({ min: rule.extendMinutes, price: rule.extendPrice, at: new Date().toISOString() })),
      lines: rows.map((r) => lineFromMenu(r.item, new Date().toISOString(), r.castId, r.qty)),
      payments: [], status: "open", log: [],
    };
    return checkTotals(draft, rule).total;
  }, [date, seatId, guests, plan, extendTimes, rows, rule]);

  const seatName = seats.find((s) => s.id === seatId)?.name ?? "席なし";

  const save = async (m: PayKind) => {
    setBusy(true);
    try {
      const id = await enterFromPaper({
        seatId, guests: Math.max(1, guests), plan, enteredAt,
        extendTimes: Math.max(0, extendTimes),
        lines: rows.map((r) => ({ item: r.item, castId: r.castId, qty: r.qty })),
        method: m, tabName: m === "tab" ? tabName : undefined,
      });
      if (id) showToast(`${seatName} ${guests}名 ${yen(total)} を入れました`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open title="紙の伝票から入れる" onClose={onClose}
      footer={<span className="sum">合計 <b>{yen(total)}</b><br />{seatName} ・ {guests}名{enteredAt ? ` ・ 入店 ${enteredAt}` : ""}</span>}>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        紙に書いてある順に入れてください。金額はこちらで計算します。
      </p>

      <div className="row2">
        <label className="field" style={{ margin: 0 }}><span className="lbl">入店（紙の時刻）</span>
          <TimeField value={enteredAt} ariaLabel="入店時刻" onChange={setEnteredAt} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">席</span>
          <select className="inp" value={seatId ?? ""} aria-label="席" onChange={(e) => setSeatId(e.target.value || null)}>
            {seats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="">席なし</option>
          </select></label>
      </div>

      <div className="backrow">
        <div><div className="bn">人数</div><div className="br">セットは 1名あたり × 人数</div></div>
        <div className="ctl"><Stepper value={guests} onChange={(v) => setGuests(Math.max(1, v ?? 1))} label="人数" /></div>
      </div>

      <div className="lbl" style={{ marginTop: 8 }}>セット</div>
      <div className="pricerow">
        {setPlanChoices(rule).map((p) => (
          <button key={`${p.min}:${p.price}`} type="button" className="btn"
            aria-pressed={plan.min === p.min && plan.price === p.price}
            onClick={() => setPlan(p)}>{planLabel(p)}</button>
        ))}
      </div>

      <div className="backrow">
        <div><div className="bn">延長</div><div className="br">1回 ＋{rule.extendMinutes}分 {yen(rule.extendPrice)}／人</div></div>
        <div className="ctl"><Stepper value={extendTimes} onChange={(v) => setExtendTimes(Math.max(0, v ?? 0))} label="延長の回数" /></div>
      </div>

      <div className="seg menuseg" style={{ marginTop: 10 }}>
        {cats.map((c) => (
          <button key={c} type="button" aria-pressed={(cat ?? cats[0]) === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="menugrid">
        {shown.map((m) => (
          <button key={m.id} type="button" className={`menubtn ${m.kind === "castLinked" ? "cast" : ""}`} onClick={() => tap(m)}>
            <b>{m.name}</b><span>{yen(m.price)}</span>
          </button>
        ))}
        {shown.length === 0 && <div className="empty">このカテゴリに商品がありません</div>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="sechead" style={{ marginTop: 12 }}><div className="t">入れたもの</div><div className="l" /><div className="n">{rows.length}種</div></div>
          {rows.map((r) => (
            <div key={r.key} className="backrow">
              <div><div className="bn">{r.item.name}</div>
                <div className="br">{r.castName ? r.castName : yen(r.item.price)}</div></div>
              <div className="ctl">
                <Stepper value={r.qty} onChange={(v) => setQty(r.key, v ?? 0)} label={r.item.name} />
                <span className="sum">{yen(r.item.price * r.qty)}</span>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="sechead" style={{ marginTop: 12 }}><div className="t">もらった額</div><div className="l" /></div>
      <div className="lrow total"><div className="g"><div className="t">合計</div>
        <div className="s">{planLabel(plan)} × {guests}名{extendTimes ? ` ＋ 延長${extendTimes}回` : ""}</div></div>
        <div className="a num">{yen(total)}</div></div>

      {method === "tab" && (
        <label className="field" style={{ marginTop: 8 }}><span className="lbl">ツケの相手（紙に書いてある名前）</span>
          <input className="inp" value={tabName} placeholder="田中さん" onChange={(e) => setTabName(e.target.value)} />
        </label>
      )}

      <div className="paygrid" style={{ marginTop: 10 }}>
        <button type="button" className="btn primary" disabled={busy || total <= 0} onClick={() => void save("cash")}>現金でもらった</button>
        <button type="button" className="btn" disabled={busy || total <= 0} onClick={() => void save("card")}>カード</button>
      </div>
      <button type="button" className="btn wide" style={{ marginTop: 8 }} disabled={busy || total <= 0}
        onClick={() => (method === "tab" ? void save("tab") : setMethod("tab"))}>
        {method === "tab" ? `ツケにする${tabName ? `（${tabName}）` : ""}` : "ツケ（あとでもらう）"}
      </button>
      <div className="hint">
        押すと、その場で会計済みの伝票として入ります。直したいときは「会計済み」の行から開いてください。
      </div>

      {/* キャストに紐づく商品は「誰の分か」を聞く。紙の正の字をそのまま写せるように、
          選んだあとは下の一覧で ＋ を押して増やす */}
      <BottomSheet open={!!picking} title={`${picking?.name ?? ""} は誰の分？`} onClose={() => setPicking(null)}>
        <div className="chipgrid">
          {casts.map((c) => (
            <button key={c.id} type="button" className="btn chip"
              onClick={() => { const m = picking; setPicking(null); if (m) add(m, c.id); }}>
              {c.name || "（名前なし）"}
            </button>
          ))}
          {casts.length === 0 && <div className="empty">先にキャストを登録してください</div>}
        </div>
        <button type="button" className="btn wide" style={{ marginTop: 12 }}
          onClick={() => { const m = picking; setPicking(null); if (m) add(m); }}>
          キャストを付けずに入れる
        </button>
      </BottomSheet>
    </BottomSheet>
  );
}

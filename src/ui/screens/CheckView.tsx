import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../state/store";
import { usePos } from "../../state/pos";
import { activeLines, checkTotals, clock, elapsedMin, endsAt, extendOptions, lineAmount, remainingMin, setPriceChoices, setUnitPrice } from "../../domain/pos";
import { jp, yen } from "../../domain/format";
import { defaultPosRule } from "../../domain/migrate";
import { BottomSheet } from "../components/BottomSheet";
import { NumberField } from "../components/NumberField";
import { ChevLeft } from "../icons";
import { PayView } from "./PayView";
import { hhmm } from "./Register";
import type { CheckLine, MenuItem } from "../../domain/types";


export function CheckView({ id }: { id: string }) {
  const L = useApp((s) => s.ledger);
  const rule = L.posRule ?? defaultPosRule();
  const check = usePos((s) => s.checks.find((c) => c.id === id));
  const setActive = usePos((s) => s.setActive);
  const addItem = usePos((s) => s.addItem);
  const extend = usePos((s) => s.extend);
  const setGuests = usePos((s) => s.setGuests);
  const setSetPrice = usePos((s) => s.setSetPrice);
  const removeCheck = usePos((s) => s.removeCheck);

  const [now, setNow] = useState(() => Date.now());
  const [cat, setCat] = useState<string | null>(null);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [lineSheet, setLineSheet] = useState<CheckLine | null>(null);
  const [paying, setPaying] = useState(false);
  const [priceSheet, setPriceSheet] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const menu = useMemo(() => (L.menu ?? []).filter((m) => m.active).sort((a, b) => a.sort - b.sort), [L.menu]);
  const cats = useMemo(() => [...new Set(menu.map((m) => m.category))], [menu]);
  const shown = menu.filter((m) => m.category === (cat ?? cats[0]));
  const casts = (L.casts ?? []).filter((c) => c.active);
  const castName = (cid?: string) => casts.find((c) => c.id === cid)?.name ?? L.casts.find((c) => c.id === cid)?.name ?? "";

  if (!check) return <div className="empty">伝票が見つかりません</div>;
  const seat = (L.seats ?? []).find((s) => s.id === check.seatId);
  const t = checkTotals(check, rule);
  const left = remainingMin(check, rule, now);
  const lines = activeLines(check);

  const tap = (m: MenuItem) => {
    if (m.kind === "castLinked") setPicking(m);       // 1タップ目: 商品 → 2タップ目: キャスト
    else void addItem(check.id, m);
  };

  return (
    <div className="checkview">
      <div className="titlebar">
        <button type="button" className="iconbtn back" aria-label="席一覧へ戻る" onClick={() => setActive(null)}><ChevLeft size={20} /></button>
        <div>
          <b>{seat?.name ?? "席なし"}</b>
          <span className="muted"> {check.guests}名 ・ 経過 {hhmm(elapsedMin(check, now))}</span>
        </div>
      </div>

      <div className={`card timecard ${left < 0 ? "over" : left <= rule.alertBeforeMin ? "soon" : ""}`}>
        <div className="timebig">
          <div>
            <div className="k">{left < 0 ? "超過" : "のこり時間"}</div>
            <b>{hhmm(left)}</b>
          </div>
          <div className="timeend">
            <div className="k">終了予定</div>
            <b>{clock(endsAt(check, rule))}</b>
          </div>
        </div>
        <div className="btnrow">
          {extendOptions(rule).map((o) => (
            <button key={o.label} type="button" className="btn" onClick={() => void extend(check.id, o.min, o.price)}>
              延長 {o.label}
            </button>
          ))}
        </div>
        <div className="btnrow" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={() => void setGuests(check.id, check.guests - 1)} disabled={check.guests <= 1}>人数 −</button>
          <button type="button" className="btn" onClick={() => void setGuests(check.id, check.guests + 1)}>人数 ＋</button>
        </div>
        {check.extends.length > 0 && (
          <div className="hint">延長 {check.extends.map((e) => `＋${e.min}分`).join(" ")}（計 {yen(check.extends.reduce((a, e) => a + e.price, 0) * check.guests)}）</div>
        )}
      </div>

      <div className="card">
        <div className="cardhead"><h2>伝票</h2><span className="muted">{check.guests}名</span></div>
        <button type="button" className="lrow" onClick={() => setPriceSheet(true)}>
          <div className="g">
            <div className="t">セット{check.extends.length > 0 ? "・延長" : ""}</div>
            <div className="s">1名 {yen(setUnitPrice(check))} × {check.guests}名 ・ タップで変更</div>
          </div>
          <div className="a">{yen(t.setAmount)}</div>
        </button>
        {lines.map((l) => (
          <button key={l.id} type="button" className="lrow" onClick={() => setLineSheet(l)}>
            <div className="g">
              <div className="t">{l.name}{l.qty > 1 ? ` ×${l.qty}` : ""}</div>
              {l.castId && <div className="s">{castName(l.castId)}</div>}
            </div>
            <div className="a">{yen(lineAmount(l))}</div>
          </button>
        ))}
        {t.tableCharge > 0 && (
          <div className="lrow">
            <div className="g"><div className="t">テーブルチャージ</div><div className="s">{jp(rule.tableChargeRate)}％{rule.tableChargeOnSet ? "" : "（商品のみ）"}</div></div>
            <div className="a">{yen(t.tableCharge)}</div>
          </div>
        )}
        {t.tax > 0 && <div className="lrow"><div className="g"><div className="t">消費税</div></div><div className="a">{yen(t.tax)}</div></div>}
        {t.discount > 0 && <div className="lrow"><div className="g"><div className="t">値引き</div><div className="s">{check.discount?.name}</div></div><div className="a neg">−{yen(t.discount)}</div></div>}
        <div className="lrow total"><div className="g"><div className="t">合計</div></div><div className="a">{yen(t.total)}</div></div>
        {lines.length === 0 && <div className="hint">下のボタンから注文を入れてください。</div>}
      </div>

      <div className="card">
        <div className="seg menuseg">
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
      </div>

      {lines.length === 0 && (
        <div className="card">
          <button type="button" className="btn danger wide" onClick={() => void removeCheck(check.id)}>
            この伝票をやめる
          </button>
          <div className="hint">まだ注文が入っていないので、記録を残さずに消せます。</div>
        </div>
      )}

      <div className="paybar">
        <span>合計 <b>{yen(t.total)}</b></span>
        <button type="button" className="btn primary" onClick={() => setPaying(true)}>会計へ</button>
      </div>

      {/* 1タップ目の商品に対して、誰の分かを選ぶ */}
      <BottomSheet open={!!picking} title={`${picking?.name ?? ""} は誰の分？`} onClose={() => setPicking(null)}>
        <div className="chipgrid">
          {casts.map((c) => (
            <button key={c.id} type="button" className="btn chip" onClick={() => { const m = picking; setPicking(null); if (m) void addItem(check.id, m, c.id); }}>
              {c.name}
            </button>
          ))}
          {casts.length === 0 && <div className="empty">先にキャストを登録してください</div>}
        </div>
        <button type="button" className="btn wide" style={{ marginTop: 12 }}
          onClick={() => { const m = picking; setPicking(null); if (m) void addItem(check.id, m); }}>
          キャストを付けずに入れる
        </button>
      </BottomSheet>

      <BottomSheet open={priceSheet} title="セット料金を変える" onClose={() => setPriceSheet(false)}>
        <div className="hint">1名あたりの金額です。延長ぶんはそのまま残ります。</div>
        <div className="pricerow">
          {setPriceChoices(rule).map((p) => (
            <button key={p} type="button" className="btn" aria-pressed={check.setPrice === p}
              onClick={() => { void setSetPrice(check.id, p); setPriceSheet(false); }}>{yen(p)}</button>
          ))}
        </div>
        <label className="field"><span className="lbl">ほかの金額</span>
          <NumberField value={check.setPrice} onChange={(v) => void setSetPrice(check.id, v ?? 0)} aria-label="セット料金" />
        </label>
      </BottomSheet>

      <LineSheet line={lineSheet} checkId={check.id} onClose={() => setLineSheet(null)} />
      {paying && <PayView check={check} rule={rule} onClose={() => setPaying(false)} />}
      <div className="paybarspacer" />
    </div>
  );
}

/** 行をタップしたとき。数量の増減と取消（理由が要る） */
function LineSheet({ line, checkId, onClose }: { line: CheckLine | null; checkId: string; onClose: () => void }) {
  const setQty = usePos((s) => s.setQty);
  const voidLine = usePos((s) => s.voidLine);
  const [reason, setReason] = useState("");
  useEffect(() => { setReason(""); }, [line?.id]);
  if (!line) return null;
  return (
    <BottomSheet open title={line.name} onClose={onClose}>
      <div className="lrow">
        <div className="g"><div className="t">数量</div></div>
        <span className="btnrow">
          <button type="button" className="btn" onClick={() => void setQty(checkId, line.id, line.qty - 1)} disabled={line.qty <= 1}>−</button>
          <b style={{ minWidth: 32, textAlign: "center" }}>{line.qty}</b>
          <button type="button" className="btn" onClick={() => void setQty(checkId, line.id, line.qty + 1)}>＋</button>
        </span>
      </div>
      <label className="field"><span className="lbl">取り消す理由（残ります）</span>
        <input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="打ち間違い / お客様都合" />
      </label>
      <button type="button" className="btn danger wide" disabled={!reason.trim()}
        onClick={() => { void voidLine(checkId, line.id, reason.trim()); onClose(); }}>
        この行を取り消す
      </button>
      <div className="hint">取消は消さずに履歴として残ります。理由は必ず入れてください。</div>
    </BottomSheet>
  );
}

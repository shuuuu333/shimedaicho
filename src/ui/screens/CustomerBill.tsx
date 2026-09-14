import { useEffect } from "react";
import { useApp } from "../../state/store";
import { billLines, cardTotalOf, checkTotals, clock, setUnitPrice } from "../../domain/pos";
import { jp, yen } from "../../domain/format";
import type { Check, PosRule } from "../../domain/types";

/** お客様に見せる明細。卓の向こうから読めるように、文字を大きくする。
 *
 *  ここに出さないものが 3 つある。
 *  ・キャストの名前（誰に何本ついたかは店の内部情報で、請求には関係がない）
 *  ・編集のボタン（お客様が見ている画面で押せてしまう形を作らない）
 *  ・取り消した行（お客様には「消したもの」を見せる意味がない。店の履歴には残っている）
 *
 *  閉じるのは下の 1 か所だけにしてある。背景を触ると閉じる形だと、
 *  お客様が画面をのぞき込んだ拍子に消えてしまう。 */
export function CustomerBill({ check, rule, onClose }: { check: Check; rule: PosRule; onClose: () => void }) {
  const shop = useApp((s) => s.ledger.shop);
  const seats = useApp((s) => s.ledger.seats);
  const t = checkTotals(check, rule);
  const lines = billLines(check);
  const seat = (seats ?? []).find((s) => s.id === check.seatId);
  const cardTotal = cardTotalOf(check, rule, shop.cardFeeRate);
  const cardFee = cardTotal - t.total;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); };
  }, [onClose]);

  const hhmm = (iso?: string) => (iso && Number.isFinite(Date.parse(iso)) ? clock(new Date(iso)) : "");

  return (
    <div className="billwrap" role="dialog" aria-modal="true" aria-label="お会計の明細">
      <div className="bill">
        <div className="billhead">
          <div className="shop">{shop.name}</div>
          <h1>お会計</h1>
          <div className="meta">
            {seat?.name ?? ""}{seat ? " ・ " : ""}{check.guests}名
            {hhmm(check.enteredAt) ? ` ・ ${hhmm(check.enteredAt)}〜` : ""}
          </div>
        </div>

        <div className="billbody">
          <div className="billrow">
            <div className="n">セット{check.extends.length > 0 ? "・延長" : ""}</div>
            <div className="q">{yen(setUnitPrice(check))}×{check.guests}名</div>
            <div className="a">{yen(t.setAmount)}</div>
          </div>
          {lines.map((l) => (
            <div key={`${l.name} ${l.price}`} className="billrow">
              <div className="n">{l.name}</div>
              <div className="q">{l.qty > 1 ? `${yen(l.price)}×${l.qty}` : ""}</div>
              <div className="a">{yen(l.amount)}</div>
            </div>
          ))}
          {t.tableCharge > 0 && (
            <div className="billrow">
              <div className="n">テーブルチャージ</div><div className="q">{jp(rule.tableChargeRate)}％</div>
              <div className="a">{yen(t.tableCharge)}</div>
            </div>
          )}
          {t.tax > 0 && (
            <div className="billrow">
              <div className="n">消費税</div><div className="q">{rule.taxRate}％</div>
              <div className="a">{yen(t.tax)}</div>
            </div>
          )}
          {t.discount > 0 && (
            <div className="billrow">
              <div className="n">値引き</div><div className="q" />
              <div className="a neg">−{yen(t.discount)}</div>
            </div>
          )}
        </div>

        <div className="billtotal">
          <span>合計</span>
          <b>{yen(t.total)}</b>
        </div>
        {cardFee > 0 && (
          <div className="billnote">
            カードでお支払いの場合は、決済手数料 {shop.cardFeeRate}％（{yen(cardFee)}）を頂戴しております。
            <b> カードでのお会計 {yen(cardTotal)}</b>
          </div>
        )}

        <button type="button" className="btn wide billclose" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

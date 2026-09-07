import { useState } from "react";
import { usePos } from "../../state/pos";
import { cashSuggestions, changeDue, checkTotals } from "../../domain/pos";
import { yen } from "../../domain/format";
import { BottomSheet } from "../components/BottomSheet";
import { NumberField } from "../components/NumberField";
import type { Check, PosRule } from "../../domain/types";

/** 会計。現金は「金額ボタン → 確定」の 2 タップ、カードは 1 タップで終わる */
export function PayView({ check, rule, onClose }: { check: Check; rule: PosRule; onClose: () => void }) {
  const pay = usePos((s) => s.pay);
  const setDiscount = usePos((s) => s.setDiscount);
  const [received, setReceived] = useState<number | null>(null);
  const [disc, setDisc] = useState(false);
  const [discAmount, setDiscAmount] = useState<number | null>(null);

  const t = checkTotals(check, rule);
  const change = received == null ? null : changeDue(received, t.total);
  const short = received != null && received < t.total;

  return (
    <BottomSheet open title="会計" onClose={onClose}>
      <div className="card flat">
        <div className="lrow"><div className="g"><div className="t">セット</div><div className="s">{rule.taxOnSet ? "＋税" : "税込"}</div></div><div className="a">{yen(t.baseAmount)}</div></div>
        {t.extendAmount > 0 && <div className="lrow"><div className="g"><div className="t">延長</div><div className="s">{rule.taxOnExtend ? "＋税" : "税込"}</div></div><div className="a">{yen(t.extendAmount)}</div></div>}
        <div className="lrow"><div className="g"><div className="t">商品</div></div><div className="a">{yen(t.itemAmount)}</div></div>
        {t.tableCharge > 0 && <div className="lrow"><div className="g"><div className="t">テーブルチャージ</div><div className="s">{rule.tableChargeRate}％{rule.tableChargeOnSet ? "" : "（商品のみ）"}</div></div><div className="a">{yen(t.tableCharge)}</div></div>}
        {t.tax > 0 && <div className="lrow"><div className="g"><div className="t">消費税</div><div className="s">{rule.taxRate}％ ・ 対象 {yen(t.taxBase)}</div></div><div className="a">{yen(t.tax)}</div></div>}
        {t.discount > 0 && <div className="lrow"><div className="g"><div className="t">値引き</div></div><div className="a neg">−{yen(t.discount)}</div></div>}
        <div className="lrow total"><div className="g"><div className="t">ご請求</div></div><div className="a">{yen(t.total)}</div></div>
      </div>

      <div className="cashrow">
        {cashSuggestions(t.total).map((v) => (
          <button key={v} type="button" className="btn" aria-pressed={received === v} onClick={() => setReceived(v)}>{yen(v)}</button>
        ))}
      </div>
      <label className="field"><span className="lbl">お預かり</span>
        <NumberField value={received} onChange={setReceived} big aria-label="お預かり" />
      </label>
      {received == null && <div className="hint">お預かりを入れなければ、ちょうど受け取ったものとして会計します。</div>}
      {change != null && (
        <div className={`lrow total ${short ? "warn" : ""}`}>
          <div className="g"><div className="t">{short ? "不足しています" : "お釣り"}</div></div>
          <div className={`a ${short ? "neg" : ""}`}>{short ? yen(t.total - received) : yen(change)}</div>
        </div>
      )}

      {!disc ? (
        <button type="button" className="btn wide" onClick={() => { setDisc(true); setDiscAmount(check.discount?.amount ?? null); }}>値引きする</button>
      ) : (
        <div className="card flat">
          <label className="field"><span className="lbl">値引き額</span>
            <NumberField value={discAmount} onChange={setDiscAmount} aria-label="値引き額" />
          </label>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => { void setDiscount(check.id, "値引き", discAmount ?? 0); setDisc(false); }}>反映する</button>
            <button type="button" className="btn" onClick={() => { void setDiscount(check.id, "値引き", 0); setDisc(false); }}>やめる</button>
          </div>
          <div className="hint">値引きは伝票の履歴に残ります。</div>
        </div>
      )}

      <div className="paygrid">
        {/* 預り金を入れていなければ「ちょうど受け取った」として会計する。
            足りない額を入れているときだけ止める */}
        <button type="button" className="btn primary" disabled={short}
          onClick={() => { void pay(check.id, "cash", t.total, received ?? t.total); onClose(); }}>
          現金で会計
        </button>
        <button type="button" className="btn" onClick={() => { void pay(check.id, "card", t.total); onClose(); }}>
          カードで会計
        </button>
      </div>
    </BottomSheet>
  );
}

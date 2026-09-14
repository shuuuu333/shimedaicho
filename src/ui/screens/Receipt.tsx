import { useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../state/store";
import { billLines, checkTotals } from "../../domain/pos";
import { PURPOSES, issuedOn, needsStamp, receiptAmount, receiptNo, receiptTax } from "../../domain/receipt";
import { yen } from "../../domain/format";
import { BottomSheet } from "../components/BottomSheet";
import type { Check, PosRule } from "../../domain/types";

/** 領収書。書いてから端末の「印刷」に渡す。
 *
 *  入れる欄は上から順に、書く順番のまま。宛名 → 但し書き → 印刷。
 *  金額は打たせない。会計で受け取った額をそのまま載せる
 *  （打たせると、紙とレジで違う額が残って、あとから直せなくなる）。 */
export function Receipt({ check, rule, onClose }: { check: Check; rule: PosRule; onClose: () => void }) {
  const shop = useApp((s) => s.ledger.shop);
  const [to, setTo] = useState("");
  const [purpose, setPurpose] = useState(PURPOSES[0]);

  const stamp = needsStamp(check);
  const tabbed = check.payments[0]?.method === "tab";

  return (
    <BottomSheet open title="領収書" onClose={onClose}>
      {/* 書く欄。印刷には出さない */}
      <div className="noprint">
        <label className="field"><span className="lbl">宛名</span>
          <input className="inp" value={to} autoFocus placeholder="空のままでも出せます"
            aria-label="宛名" onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="lbl">但し書き</div>
        <div className="chipgrid">
          {PURPOSES.map((p) => (
            <button key={p} type="button" className="btn chip" aria-pressed={purpose === p}
              onClick={() => setPurpose(p)}>{p}</button>
          ))}
        </div>
        <label className="field"><span className="lbl">ほかの但し書き</span>
          <input className="inp" value={purpose} aria-label="但し書き" onChange={(e) => setPurpose(e.target.value)} />
        </label>

        {tabbed && (
          <div className="hint warnhint">
            この伝票はツケです。<b>まだお金を受け取っていません。</b>
            受け取る前に領収書を渡すと、二重に請求できなくなります。
          </div>
        )}
        {stamp && (
          <div className="hint warnhint">
            現金で 5万円以上なので、<b>収入印紙</b>が要ります。貼って割印を押してください。
            カードで受け取ったぶんには要りません。
          </div>
        )}
        {!shop.invoiceNo && (
          <div className="hint">
            インボイスの登録番号を設定に入れておくと、ここに刷られます。
            持っていない店はそのままで大丈夫です。
          </div>
        )}
      </div>

      {/* 画面の下書き。印刷では #root ごと消えるので、紙には出ない */}
      <Paper check={check} rule={rule} to={to} purpose={purpose} />

      {/* 紙になるのはこちら。#root の外に置く（アプリの画面が紙に混ざらない） */}
      {createPortal(
        <div className="printarea"><Paper check={check} rule={rule} to={to} purpose={purpose} /></div>,
        document.body)}

      <div className="noprint">
        <button type="button" className="btn primary wide" style={{ marginTop: 12 }} onClick={() => window.print()}>
          印刷する
        </button>
        <div className="hint">
          端末の印刷画面が開きます。プリンタが無ければ「PDF で保存」を選べば、そのまま渡せる控えになります。
        </div>
      </div>
    </BottomSheet>
  );
}

/** 紙になる部分。画面の下書きと、印刷に渡すぶんの両方でこれを使う。
 *  2 か所に同じ見た目を書くと、片方だけ直したときに紙とずれる */
function Paper({ check, rule, to, purpose }: { check: Check; rule: PosRule; to: string; purpose: string }) {
  const shop = useApp((s) => s.ledger.shop);
  const amount = receiptAmount(check, rule);
  const tax = receiptTax(amount, rule);
  const stamp = needsStamp(check);
  const t = checkTotals(check, rule);
  const lines = billLines(check);
  const issued = issuedOn(new Date());

  return (
    <div className="receipt">
      <div className="rhead">
        <h1>領 収 書</h1>
        <div className="rno">No. {receiptNo(check)}</div>
        <div className="rdate">{issued}</div>
      </div>

      <div className="rto"><span className="v">{to || "　"}</span><span className="sama">様</span></div>

      <div className="ramt"><span>金</span><b>{yen(amount)}</b></div>

      <div className="rpurpose">但し <u>{purpose}</u> として<br />上記正に領収いたしました</div>

      {/* インボイスで求められる「税率ごとの対価の額と税額」。ここが正となる 1 行。
          下の明細の「消費税」は外税で足したぶんだけなので、税込で値付けしている
          料金（セットなど）に含まれる税のぶん食い違う。黙って並べると嘘に見えるので、
          違うときだけ理由を書く */}
      <div className="rtax">
        {tax
          ? <>{tax.rate}％対象 {yen(tax.included)}（うち消費税 {yen(tax.tax)}）
              {t.tax > 0 && t.tax !== tax.tax &&
                <span className="note">下の「消費税」は外税で足したぶん。税込の料金に含まれる税を合わせると上の額になります。</span>}
            </>
          : <>消費税の内訳はありません</>}
      </div>

      <div className="rshop">
        <div className="nm">{shop.name || "　"}</div>
        {shop.address && <div className="ad">{shop.address}</div>}
        {shop.invoiceNo && <div className="ad">登録番号 {shop.invoiceNo}</div>}
      </div>

      <div className="rdetail">
        <div className="dh">お買い上げ明細</div>
        <div className="drow"><span>セット{check.extends.length > 0 ? "・延長" : ""}</span><b>{yen(t.setAmount)}</b></div>
        {lines.map((l) => (
          <div key={`${l.name} ${l.price}`} className="drow">
            <span>{l.name}{l.qty > 1 ? ` ×${l.qty}` : ""}</span><b>{yen(l.amount)}</b>
          </div>
        ))}
        {t.tableCharge > 0 && <div className="drow"><span>テーブルチャージ</span><b>{yen(t.tableCharge)}</b></div>}
        {t.tax > 0 && <div className="drow"><span>消費税</span><b>{yen(t.tax)}</b></div>}
        {t.discount > 0 && <div className="drow"><span>値引き</span><b>−{yen(t.discount)}</b></div>}
        {t.cardFee > 0 && <div className="drow"><span>カード手数料</span><b>{yen(t.cardFee)}</b></div>}
        <div className="drow tot"><span>合計</span><b>{yen(amount)}</b></div>
      </div>

      {stamp && <div className="rstamp">収入印紙</div>}
    </div>
  );
}

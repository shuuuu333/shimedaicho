/** 領収書。お客様に渡す紙をそのまま作る。
 *
 *  熱転写のレシートプリンタ（ESC/POS）は使わない。計画では `receiptjs` を
 *  入れる想定だったが、このアプリはスマホ・タブレットの PWA で動く。
 *  ブラウザからプリンタへ直に TCP を張ることはできず、Web Serial も iOS には無い。
 *  端末の「印刷」（AirPrint 等）に渡せば、いま店にあるプリンタでそのまま出せる。
 *  専用機を買うことになったら、そのときにドライバを足せばいい。 */
import type { Check, PosRule } from "./types";
import { checkTotals, paidTotal } from "./pos";

/** 但し書き。よくあるものをボタンにする（忙しいときに文字を打たせない） */
export const PURPOSES = ["お品代", "飲食代", "会議費", "接待交際費"];

/** 収入印紙が要る額。現金で 5 万円以上を受け取った受取書に貼る。
 *  カードは「金銭の受取書」にあたらないので要らない（お金を受け取っていないため） */
export const STAMP_FROM = 50000;

/** 印紙が要るか。要るときだけ true。
 *  額は「消費税を分けて書いていれば税抜で見る」が、ここでは総額で見て
 *  早めに知らせる（貼り忘れの方が困るため） */
export function needsStamp(c: Check): boolean {
  return c.payments[0]?.method === "cash" && receiptAmount(c) >= STAMP_FROM;
}

/** 領収した額。実際に受け取った額（会計の記録）を使う。
 *  計算し直すと、あとから直した伝票で紙と帳簿がずれる */
export function receiptAmount(c: Check, rule?: PosRule): number {
  const paid = paidTotal(c);
  if (paid > 0) return paid;
  return rule ? checkTotals(c, rule).total : 0;
}

export interface ReceiptTax {
  rate: number;
  /** 税込の対価の額（＝領収額そのもの） */
  included: number;
  /** うち消費税額 */
  tax: number;
}

/** うち消費税額。総額 × 率 ÷（100 ＋ 率）で出す。
 *
 *  店の設定が外税でも内税でも、同じ率なら税込の総額に含まれる税額は同じになる。
 *  （税抜 × 1.1 ＝ 税込 なので、税込 × 10 ÷ 110 ＝ 税）
 *  だから伝票の組み立て方を追わずに、受け取った額から出してよい。
 *
 *  率が 0 の店（免税事業者など）は税額を出さない。無いものを書かない */
export function receiptTax(amount: number, rule: PosRule): ReceiptTax | null {
  const rate = Number.isFinite(rule.taxRate) ? rule.taxRate : 0;
  if (rate <= 0 || amount <= 0) return null;
  return { rate, included: amount, tax: Math.floor((amount * rate) / (100 + rate)) };
}

/** 領収書の番号。紙に番号を振っている店はその番号、無ければ伝票の id の後ろ 6 桁。
 *  「あとでこの 1 枚を探せる」ことだけが目的なので、通し番号にはしない
 *  （端末が 2 台あると通し番号は必ずぶつかる） */
export function receiptNo(c: Check): string {
  if (c.slipNo) return String(c.slipNo);
  return c.id.replace(/[^0-9a-zA-Z]/g, "").slice(-6).toUpperCase();
}

/** 発行日。営業日ではなく、紙を出す日を書く（お客様の経費処理に使われるため） */
export function issuedOn(now: Date): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

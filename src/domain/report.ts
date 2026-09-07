/** 日報を「読める文章」にする。LINE への通知に使う。UI にも通信にも依存しない。 */
import type { Ledger } from "./types";
import { cashAsOf, dayTotals } from "./calc";
import { dayLabel, jp } from "./format";

const yen = (v: number): string => "¥" + jp(v);

/** 閉店後にオーナーへ送る文面。数字は日報の画面と同じものを使う */
export function dayReportText(L: Ledger, dk: string): string {
  const t = dayTotals(L, dk);
  const shop = L.shop.name || "お店";
  const lines: string[] = [];

  lines.push(`${shop} ${dayLabel(dk)} の締め`);
  lines.push("");
  lines.push(`売上 ${yen(t.sales)}`);
  lines.push(`　現金 ${yen(t.cash)} ／ カード ${yen(t.card)}`);
  if (t.guests > 0) lines.push(`　${t.guests}名 ・ 客単価 ${yen(Math.floor(t.sales / t.guests))}`);

  lines.push("");
  lines.push(`人件費 ${yen(t.labor)}（在籍 ${t.workersR}名${t.workersD ? ` ・ 派遣 ${t.workersD}名` : ""}）`);
  if (t.exp > 0) lines.push(`経費 ${yen(t.exp)}`);
  if (t.fee > 0) lines.push(`カード手数料 ${yen(t.fee)}`);
  lines.push(`差引 ${yen(t.profit)}`);

  lines.push("");
  const cash = cashAsOf(L, dk);
  lines.push(`手元の現金 ${yen(cash)}`);
  if (t.cashCounted != null) {
    const diff = t.cashCounted - cash;
    lines.push(`実査 ${yen(t.cashCounted)}（${diff === 0 ? "ぴったり" : (diff > 0 ? "＋" : "−") + jp(Math.abs(diff))}）`);
  } else {
    lines.push("実査 まだ数えていません");
  }
  if (t.unpaid > 0) lines.push(`今日の未払い ${yen(t.unpaid)}`);

  return lines.join("\n");
}

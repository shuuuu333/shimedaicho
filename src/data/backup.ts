/** バックアップ（JSON）と月次 CSV の書き出し・読み込み */
import type { Ledger } from "../domain/types";
import { castMonth, dispatchMonth, monthTotals } from "../domain/calc";
import { looksLikeLedger, migrate } from "../domain/migrate";
import { todayISO } from "../domain/format";

function csvEsc(v: unknown): string {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** 旧アーティファクトと同じ列構成の CSV */
export function monthCSV(L: Ledger, m: string): string {
  const a = monthTotals(L, m), rows = castMonth(L, m);
  const out: string[] = [];
  out.push("日別");
  out.push(["日付", "現金売上", "カード売上", "売上計", "客数", "在籍人件費", "派遣人件費", "人件費計", "経費", "カード手数料", "差引", "日払い(個別)", "日払い(まとめ)", "精算払い", "銀行入金", "カード入金", "実査現金"].join(","));
  for (const t of a.series) out.push([t.date, t.cash, t.card, t.sales, t.guests, t.laborR, t.laborD, t.labor, t.exp, Math.round(t.fee), Math.round(t.profit), t.paidDetail, t.paidLump, t.settled, t.bankDeposit, t.cardReceived, t.cashCounted == null ? "" : t.cashCounted].map(csvEsc).join(","));
  out.push("");
  out.push("在籍キャスト別");
  out.push(["キャスト", "出勤日数", "時間", "時給分", ...L.backItems.map((b) => b.name), "バック計", "控除", "支給額", "日払い", "精算", "未払い"].map(csvEsc).join(","));
  for (const r of rows) out.push([r.cast.name, r.days, r.hours.toFixed(2), r.wage, ...L.backItems.map((b) => r.backs[b.id] ?? 0), r.backTotal, r.deduct, r.gross, r.paid, r.settled, r.unpaid].map(csvEsc).join(","));
  out.push("");
  out.push("派遣");
  out.push(["名前", "日数", "時間", "日給計", ...L.backItems.map((b) => b.name + "(派遣)"), "バック計", "控除", "支給額", "日払い", "精算", "未払い"].map(csvEsc).join(","));
  for (const r of dispatchMonth(L, m)) out.push([r.name, r.days, r.hours.toFixed(2), r.guarantee, ...L.backItems.map((b) => r.backs[b.id] ?? 0), r.backTotal, r.deduct, r.gross, r.paid, r.settled, r.unpaid].map(csvEsc).join(","));
  out.push("");
  out.push("月計");
  const sum: [string, number][] = [
    ["売上", a.sales], ["在籍人件費", a.laborR], ["派遣人件費", a.laborD], ["まとめ日払い", a.paidLump], ["固定人件費", a.fixedLabor],
    ["経費", a.exp], ["固定費", a.fixedCost], ["カード手数料", Math.round(a.fee)], ["営業利益", Math.round(a.profit)],
    ["日払い計", a.paidCash], ["うちまとめ払い", a.paidLump], ["うち精算払い(当月支払)", a.settled], ["精算済み(当月分)", a.settledFor], ["未払い給料", a.unpaid],
  ];
  for (const r of sum) out.push(r.map(csvEsc).join(","));
  return "﻿" + out.join("\n");
}

export function backupJSON(L: Ledger): string {
  return JSON.stringify(L, null, 1);
}
export const backupFilename = (): string => `締め台帳_バックアップ_${todayISO()}.json`;
export const csvFilename = (m: string): string => `締め台帳_${m}.csv`;

/** テキストから Ledger を復元。旧形式・新形式どちらでも可。壊れていれば例外 */
export function parseBackup(text: string): Ledger {
  let j: unknown;
  try { j = JSON.parse(text.replace(/^﻿/, "")); } catch { throw new Error("JSON として読めませんでした"); }
  if (!looksLikeLedger(j)) throw new Error("締め台帳のバックアップではないようです");
  return migrate(j);
}

/** 共有シートがあれば共有、なければダウンロード */
export async function offerFile(filename: string, text: string, mime: string): Promise<"shared" | "downloaded"> {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title: filename }); return "shared"; }
    catch (e) { if ((e as Error).name === "AbortError") throw e; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

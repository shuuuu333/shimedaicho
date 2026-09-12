/** キャスト本人に見せる数字。
 *
 *  狙いは「毎日開くものにする」こと。1 店に 10〜20 人いるので、その人たちの
 *  日課になれば店の文化になる。
 *
 *  形は資産運用アプリから借りた。総額が大きく出て、今日の増減が出て、
 *  右肩上がりの累積グラフがある。株と違って給料は下がらない（働けば必ず増える）ので、
 *  この見せ方と相性がいい。
 *
 *  気をつけていること
 *  - 毎日見えるということは、暇だった日も見える。「今日は +¥9,000 だけ」は
 *    逆効果になりうる。だから「先月の同じ日より +¥12,000」を常に出せるようにする。
 *    暇な日でも累積では勝っていることが見える
 *  - 比べるのは他人ではなく過去の自分。ランキングはここに出さない
 *    （下位の子が見て辞める。夜職は入れ替わりが激しい）
 *
 *  計算は calc.ts の castShiftDays / castMonth をそのまま使う。新しい計算はほぼ無い。 */
import { castMonth, castShiftDays } from "./calc";
import { daysInMonth, shiftMonth } from "./format";
import type { CastMonthRow, Ledger } from "./types";

/** 1 日ぶん。cum はその日までの積み上げ */
export interface CastDay {
  date: string;
  /** 日（1〜31）。グラフの横軸 */
  day: number;
  worked: boolean;
  hours: number;
  gross: number;
  cum: number;
  planIn?: string;
  planOut?: string;
  in?: string;
  out?: string;
}

export interface CastStats {
  month: string;
  /** その月の合計（calc.ts の castMonth と同じ数字） */
  row: CastMonthRow | null;
  /** 日ごとの積み上げ。出勤した日だけ入る */
  days: CastDay[];
  /** 今日ぶん（その月に今日が含まれていて、出勤していれば） */
  today: CastDay | null;
  /** 先月の同じ日までの積み上げ。比べる相手は他人ではなく過去の自分 */
  prevSameDay: number;
  /** 先月の同じ日との差 */
  vsPrev: number;
  /** これからの予定（今日以降で、まだ記録が無い日） */
  ahead: CastDay[];
}

/** その月のその子の、日ごとの積み上げ */
export function castDays(L: Ledger, castId: string, m: string): CastDay[] {
  let cum = 0;
  return castShiftDays(L, castId, m).map((d) => {
    cum += d.gross;
    const sh = L.days[d.date]?.shifts?.[castId];
    return {
      date: d.date,
      day: Number(d.date.slice(8, 10)),
      worked: d.worked,
      hours: d.hours,
      gross: d.gross,
      cum,
      planIn: d.planIn,
      planOut: d.planOut,
      in: sh?.in || undefined,
      out: sh?.out || undefined,
    };
  });
}

/** 先月の、同じ日数ぶんの積み上げ。
 *  月末の日数が違うので、日付ではなく「何日目まで」で切る
 *  （31日の月と30日の月を、日付でそろえると最後の日が比べられない） */
export function cumThrough(L: Ledger, castId: string, m: string, throughDay: number): number {
  const cap = Math.min(throughDay, daysInMonth(m));
  return castDays(L, castId, m)
    .filter((d) => d.day <= cap)
    .reduce((s, d) => s + d.gross, 0);
}

export function castStats(L: Ledger, castId: string, m: string, today: string): CastStats {
  const days = castDays(L, castId, m);
  const row = castMonth(L, m).find((r) => r.cast.id === castId) ?? null;
  const isCur = m === today.slice(0, 7);
  // 今月は「今日まで」で比べる（同じペースかどうかを見たいので）。
  // 過ぎた月は丸ごと同士で比べる。ここを今月の日数で切ると、
  // 31日の月と30日の月を比べたときに先月の月末が落ちてしまう
  const through = isCur ? Number(today.slice(8, 10)) : 31;
  const nowCum = days.filter((d) => d.day <= through).reduce((s, d) => s + d.gross, 0);
  const prevSameDay = cumThrough(L, castId, shiftMonth(m, -1), through);

  return {
    month: m,
    row,
    days,
    today: days.find((d) => d.date === today && d.worked) ?? null,
    prevSameDay,
    vsPrev: nowCum - prevSameDay,
    ahead: days.filter((d) => !d.worked && d.date >= today),
  };
}

/** バック項目ごとの内訳。
 *  「ドリンク 60本で ¥42,000、1本 ＋¥700」まで出す。
 *  1本いくらが見えると行動が変わるので、金額だけでは足りない。
 *
 *  type が "count" のときだけ本数として意味がある。
 *  "amount"（売上％型）のときは対象売上なので、本数としては出さない */
export interface CastBack {
  id: string;
  name: string;
  /** 件数型なら本数、売上％型なら対象売上 */
  qty: number;
  amount: number;
  /** 1 件あたりの額。件数型のときだけ */
  unit: number | null;
  isCount: boolean;
}

export function castBacks(L: Ledger, castId: string, m: string, row: CastMonthRow | null): CastBack[] {
  if (!row) return [];
  // castMonth は金額しか持っていないので、本数は shifts から数え直す
  const qty: Record<string, number> = {};
  for (const k of Object.keys(L.days)) {
    if (!k.startsWith(m)) continue;
    const sh = L.days[k].shifts?.[castId];
    if (!sh?.on) continue;
    for (const id of Object.keys(sh.backs ?? {})) {
      const v = sh.backs[id];
      if (v == null || !Number.isFinite(v)) continue;
      qty[id] = (qty[id] ?? 0) + v;
    }
  }

  const out: CastBack[] = [];
  for (const b of L.backItems) {
    const amount = Math.round(row.backs[b.id] ?? 0);
    const n = Math.round(qty[b.id] ?? 0);
    if (!amount && !n) continue;
    const isCount = b.type === "count";
    out.push({
      id: b.id,
      name: b.name || "（項目名なし）",
      qty: n,
      amount,
      unit: isCount && n > 0 ? Math.round(amount / n) : null,
      isCount,
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

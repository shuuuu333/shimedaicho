/** 今月の着地予測。
 *
 *  日報は今日のことしか教えない。だから月末になって初めて赤字と気づく。
 *  知りたいのは常に「このままいくと、今月はいくらで終わるのか」。
 *
 *  伸ばし方は「日割り × 残り日数」ではなく曜日別。ガールズバーは金土で別の商売なので、
 *  月の前半に平日が多いか週末が多いかで、単純な日割りは大きく外れる。
 *
 *  固定費・固定人件費（Shop.fixedLabor / fixedCost）は月ぶんの額が monthTotals で
 *  すでに丸ごと引かれている。伸ばすのは変動費だけ。ここを間違えると、
 *  月初めの予測が実際よりずっと悪く出る。
 *
 *  ぜんぶ台帳のデータで解ける（LLM は要らない）。 */
import { dayTotals, monthTotals } from "./calc";
import { daysInMonth, shiftMonth } from "./format";
import type { DayTotals, Ledger } from "./types";

/** 前月の同じ曜日と比べて負けている曜日 */
export interface ForecastWeekday { dow: number; diff: number }

export interface Forecast {
  /** 予測を出していいか。入力が少なすぎるとただの当てものになる */
  ready: boolean;
  /** 入力済みの日数 */
  recordedDays: number;
  /** これから来る日数（今日を含む・まだ日報が無い日） */
  remainingDays: number;
  /** 着地の見込み */
  sales: number;
  profit: number;
  guests: number;
  avgSpend: number;
  /** 着地の人件費率（%）。固定人件費を含む */
  laborRate: number;
  /** 前月の実績との差。前月に記録が無ければ null */
  vsPrev: { sales: number; profit: number; laborRate: number; guests: number; avgSpend: number } | null;
  /** 効いている曜日。負けている大きい順に最大 2 つ */
  weekdays: ForecastWeekday[];
}

/** 予測を出すのに要る最低の日数。これ未満はただの当てもの */
const MIN_DAYS = 3;

const dowOf = (dk: string): number => new Date(dk + "T00:00:00").getDay();

/** その月の、曜日ごとの平均（入力済みの日だけ）。その曜日の記録が無ければ null */
function byDow(L: Ledger, m: string, pick: (t: DayTotals) => number): (number | null)[] {
  const sum = [0, 0, 0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const k of Object.keys(L.days)) {
    if (!k.startsWith(m)) continue;
    const d = dowOf(k);
    sum[d] += pick(dayTotals(L, k));
    cnt[d]++;
  }
  return sum.map((s, i) => (cnt[i] > 0 ? s / cnt[i] : null));
}

export function forecastMonth(L: Ledger, m: string, today: string): Forecast {
  const a = monthTotals(L, m);
  const pm = shiftMonth(m, -1);
  const p = monthTotals(L, pm);
  const dim = daysInMonth(m);

  // これから来る日。過ぎたのに未入力の日は 0 として扱う（あとから入れれば予測も動く）。
  // ここを「まだ売上が立つ日」に数えると、入れ忘れのぶんだけ予測が水増しになる
  const remaining: string[] = [];
  for (let i = 1; i <= dim; i++) {
    const k = `${m}-${String(i).padStart(2, "0")}`;
    if (k < today || L.days[k]) continue;
    remaining.push(k);
  }

  const prevHasData = p.days > 0;
  /** 残りの日の見込み。今月のその曜日 → 前月のその曜日 → 今月の日割り の順に当てる。
   *  前月に記録があってその曜日が無いなら定休日と見なして 0（水増しより少なめに寄せる） */
  const estimator = (thisM: (number | null)[], prevM: (number | null)[], overall: number) =>
    (d: number): number => {
      if (thisM[d] != null) return thisM[d];
      if (prevHasData) return prevM[d] ?? 0;
      return overall;
    };

  const estSales = estimator(byDow(L, m, (t) => t.sales), byDow(L, pm, (t) => t.sales), a.days > 0 ? a.sales / a.days : 0);
  const estGuests = estimator(byDow(L, m, (t) => t.guests), byDow(L, pm, (t) => t.guests), a.days > 0 ? a.guests / a.days : 0);

  const sales = Math.round(a.sales + remaining.reduce((s, k) => s + estSales(dowOf(k)), 0));
  const guests = Math.round(a.guests + remaining.reduce((s, k) => s + estGuests(dowOf(k)), 0));

  // 変動ぶんだけ売上と同じ調子で伸ばす。固定費は月ぶんがもう入っているので伸ばさない
  const r = a.sales > 0 ? sales / a.sales : 1;
  const labor = Math.round(a.labor * r + a.fixedLabor);
  const cost = Math.round((a.exp + a.fee) * r + a.fixedCost);
  const profit = sales - labor - cost;
  const laborRate = sales > 0 ? (labor / sales) * 100 : 0;

  const prevLaborRate = p.sales > 0 ? (p.laborAll / p.sales) * 100 : 0;
  const vsPrev = prevHasData
    ? {
        sales: sales - Math.round(p.sales),
        profit: profit - Math.round(p.profit),
        laborRate: laborRate - prevLaborRate,
        guests: guests - p.guests,
        avgSpend: (guests > 0 ? sales / guests : 0) - p.avgSpend,
      }
    : null;

  // どの曜日で負けているか。1 日ぶんの差引で見る（月ぶんの固定費は曜日に割り当てられない）
  const nowP = byDow(L, m, (t) => t.profit);
  const prevP = byDow(L, pm, (t) => t.profit);
  const weekdays: ForecastWeekday[] = [];
  for (let d = 0; d < 7; d++) {
    const now = nowP[d], was = prevP[d];
    if (now == null || was == null) continue;
    const diff = Math.round(now - was);
    if (diff < 0) weekdays.push({ dow: d, diff });
  }
  weekdays.sort((x, y) => x.diff - y.diff);

  return {
    ready: a.days >= MIN_DAYS && a.sales > 0 && remaining.length > 0,
    recordedDays: a.days,
    remainingDays: remaining.length,
    sales, profit, guests,
    avgSpend: guests > 0 ? Math.round(sales / guests) : 0,
    laborRate,
    vsPrev,
    weekdays: weekdays.slice(0, 2),
  };
}

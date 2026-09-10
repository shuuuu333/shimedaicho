import { describe, it, expect } from "vitest";
import { migrate } from "./migrate";
import { monthTotals } from "./calc";
import { forecastMonth } from "./forecast";

const shop = {
  name: "", cardFeeRate: 0, openingCash: 0, openingDate: "2026-08-01", defaultWage: 2000,
  roundMinutes: 15, fixedLabor: 0, fixedCost: 0, dispatchGuarantee: 10000, openTime: "20:00", closeTime: "01:00",
};
const day = (over: Record<string, unknown> = {}) =>
  ({ cashSales: 0, cardSales: 0, guests: null, expenses: [], bankDeposit: null, cardReceived: null,
     cashCounted: null, payout: null, shifts: {}, dispatch: [], settle: [], ...over });

const led = (days: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  migrate({ v: 4, shop: { ...shop, ...over }, backItems: [], casts: [], days });

describe("今月の着地予測", () => {
  it("入力が少ないうちは予測を出さない", () => {
    // 2日ぶんしかない
    const L = led({ "2026-09-01": day({ cashSales: 10000 }), "2026-09-02": day({ cashSales: 10000 }) });
    expect(forecastMonth(L, "2026-09", "2026-09-03").ready).toBe(false);
  });

  it("売上が 0 のまま、または月が終わっていれば出さない", () => {
    const zero = led({ "2026-09-01": day(), "2026-09-02": day(), "2026-09-03": day() });
    expect(forecastMonth(zero, "2026-09", "2026-09-04").ready).toBe(false);

    // 月末まで全部入っている → 残りが無いので予測ではなく実績
    const full: Record<string, unknown> = {};
    for (let i = 1; i <= 30; i++) full[`2026-09-${String(i).padStart(2, "0")}`] = day({ cashSales: 10000 });
    expect(forecastMonth(led(full), "2026-09", "2026-10-01").ready).toBe(false);
  });

  it("固定費は月ぶんがもう引かれているので、伸ばさない", () => {
    // 固定費 10万。3日で売上 3万 → 実績は赤字だが、月の終わりには黒字で着地する
    const L = led({
      "2026-09-01": day({ cashSales: 10000 }),
      "2026-09-02": day({ cashSales: 10000 }),
      "2026-09-03": day({ cashSales: 10000 }),
    }, { fixedCost: 100000 });
    expect(monthTotals(L, "2026-09").profit).toBe(-70000);

    const f = forecastMonth(L, "2026-09", "2026-09-04");
    expect(f.ready).toBe(true);
    expect(f.remainingDays).toBe(27);
    // 前月に記録が無いので日割りに落ちる。1日 1万 × 30日
    expect(f.sales).toBe(300000);
    // 固定費 10万は 1 回だけ。売上と一緒に 10 倍にはしない
    expect(f.profit).toBe(200000);
  });

  it("曜日別で伸ばす。定休日は 0 として扱う", () => {
    // 前月(8月)は 4火〜8土 の 5 日。金土が 8 万。日月は記録なし＝定休
    const prev = {
      "2026-08-04": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-08-05": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-08-06": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-08-07": day({ cashSales: 80000, guests: 20, payout: 10000 }),
      "2026-08-08": day({ cashSales: 80000, guests: 20, payout: 10000 }),
    };
    // 今月(9月)は 1火〜5土 の 5 日。金土が 5 万に落ちている
    const now = {
      "2026-09-01": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-09-02": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-09-03": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-09-04": day({ cashSales: 50000, guests: 20, payout: 10000 }),
      "2026-09-05": day({ cashSales: 50000, guests: 20, payout: 10000 }),
    };
    const L = led({ ...prev, ...now });
    const f = forecastMonth(L, "2026-09", "2026-09-06");

    expect(f.recordedDays).toBe(5);
    expect(f.remainingDays).toBe(25);
    // 残り 25 日の内訳は 火4・水4・木3・金3・土3・日4・月4。
    // 日月は前月にも記録が無い（＝定休）ので 0 を足す
    //   火水 20,000×4 ずつ ＋ 木 20,000×3 ＋ 金土 50,000×3 ずつ ＝ 520,000
    expect(f.sales).toBe(160000 + 520000);
    // 単純な日割りなら 160,000/5 × 25 ＝ 800,000 足して 960,000 になる。曜日別だと 680,000
    expect(f.sales).toBeLessThan(960000);

    // 変動ぶん（まとめ日払い 5 万）は売上と同じ調子で伸ばす。680,000/160,000 = 4.25 倍
    expect(f.profit).toBe(680000 - 212500);
    expect(f.laborRate).toBeCloseTo(31.25, 4);

    // 客数も曜日別。火水 10×4 ＋ 木 10×3 ＋ 金土 20×3 ＝ 230
    expect(f.guests).toBe(70 + 230);
    expect(f.avgSpend).toBe(Math.round(680000 / 300));
  });

  it("前月との差と、負けている曜日を出す", () => {
    const L = led({
      "2026-08-04": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-08-05": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-08-06": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-08-07": day({ cashSales: 80000, guests: 20, payout: 10000 }),
      "2026-08-08": day({ cashSales: 80000, guests: 20, payout: 10000 }),
      "2026-09-01": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-09-02": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-09-03": day({ cashSales: 20000, guests: 10, payout: 10000 }),
      "2026-09-04": day({ cashSales: 50000, guests: 20, payout: 10000 }),
      "2026-09-05": day({ cashSales: 50000, guests: 20, payout: 10000 }),
    });
    const f = forecastMonth(L, "2026-09", "2026-09-06");

    expect(f.vsPrev).not.toBe(null);
    expect(f.vsPrev!.sales).toBe(680000 - 220000);
    expect(f.vsPrev!.profit).toBe(467500 - 170000);
    // 人件費率は 22.7% → 31.25% に上がっている
    expect(f.vsPrev!.laborRate).toBeCloseTo(31.25 - (50000 / 220000) * 100, 4);
    expect(f.vsPrev!.avgSpend).toBeLessThan(0);   // 客単価は落ちている

    // 落ちているのは金土。1日ぶんの差引で 3 万ずつ負けている
    expect(f.weekdays).toEqual([{ dow: 5, diff: -30000 }, { dow: 6, diff: -30000 }]);
  });

  it("前月に記録が無ければ、前月との比較は出さない", () => {
    const L = led({
      "2026-09-01": day({ cashSales: 10000 }),
      "2026-09-02": day({ cashSales: 10000 }),
      "2026-09-03": day({ cashSales: 10000 }),
    });
    expect(forecastMonth(L, "2026-09", "2026-09-04").vsPrev).toBe(null);
  });

  it("過ぎたのに未入力の日は 0 として扱う（入れ忘れで予測が水増しにならない）", () => {
    const L = led({
      "2026-09-01": day({ cashSales: 10000 }),
      "2026-09-02": day({ cashSales: 10000 }),
      "2026-09-03": day({ cashSales: 10000 }),
    });
    // 9/20 の時点。4〜19 は未入力のまま過ぎた → これから来るのは 20〜30 の 11 日だけ
    const f = forecastMonth(L, "2026-09", "2026-09-20");
    expect(f.remainingDays).toBe(11);
    expect(f.sales).toBe(30000 + 11 * 10000);
  });
});

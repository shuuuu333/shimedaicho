import { describe, it, expect } from "vitest";
import { migrate } from "./migrate";
import { castBacks, castDays, castStats, cumThrough } from "./castStats";
import { castMonth } from "./calc";
import type { Ledger } from "./types";

const shop = {
  name: "", cardFeeRate: 0, openingCash: 0, openingDate: "2026-08-01", defaultWage: 2000,
  roundMinutes: 15, fixedLabor: 0, fixedCost: 0, dispatchGuarantee: 10000, openTime: "20:00", closeTime: "01:00",
};
const backs = [
  { id: "d1", name: "ドリンク", type: "count", rate: 700, rateD: 700 },
  { id: "b4", name: "ボトル", type: "amount", rate: 20, rateD: 20 },
];
/** 20:00-01:00 ＝ 5時間 × 時給2,000 ＝ ¥10,000 */
const shift = (bs: Record<string, number> = {}) =>
  ({ on: true, in: "20:00", out: "01:00", breakMin: null, backs: bs, deduct: null, paid: null });
const day = (over: Record<string, unknown> = {}) =>
  ({ cashSales: 0, cardSales: 0, guests: null, expenses: [], bankDeposit: null, cardReceived: null,
     cashCounted: null, payout: null, shifts: {}, dispatch: [], settle: [], ...over });

const led = (days: Record<string, unknown>, plans?: Record<string, unknown>): Ledger =>
  migrate({ v: 4, shop, backItems: backs,
    casts: [{ id: "a", name: "あい", wage: 2000, active: true }, { id: "b", name: "みく", wage: 2000, active: true }],
    days, ...(plans ? { plans } : {}) });

describe("キャスト本人に見せる数字", () => {
  it("日ごとに積み上がる", () => {
    const L = led({
      "2026-09-01": day({ shifts: { a: shift({ d1: 2 }) } }),   // 10,000 ＋ 1,400
      "2026-09-03": day({ shifts: { a: shift() } }),            // 10,000
      "2026-09-05": day({ shifts: { a: shift({ d1: 1 }) } }),   // 10,000 ＋ 700
    });
    const d = castDays(L, "a", "2026-09");
    expect(d.map((x) => x.gross)).toEqual([11400, 10000, 10700]);
    expect(d.map((x) => x.cum)).toEqual([11400, 21400, 32100]);
    expect(d.map((x) => x.day)).toEqual([1, 3, 5]);
    // 合計は castMonth と必ず一致する（別の計算を作っていない証拠）
    expect(d[d.length - 1].cum).toBe(castMonth(L, "2026-09").find((r) => r.cast.id === "a")!.gross);
  });

  it("出勤していない子は空", () => {
    const L = led({ "2026-09-01": day({ shifts: { a: shift() } }) });
    expect(castDays(L, "b", "2026-09")).toEqual([]);
  });

  it("先月の同じ日までと比べる（他人ではなく過去の自分）", () => {
    const L = led({
      // 先月は 1日と2日で 2万
      "2026-08-01": day({ shifts: { a: shift() } }),
      "2026-08-02": day({ shifts: { a: shift() } }),
      "2026-08-20": day({ shifts: { a: shift() } }),   // 20日ぶんは「1日まで」には入らない
      // 今月は 1日だけで 1万1,400
      "2026-09-01": day({ shifts: { a: shift({ d1: 2 }) } }),
    });
    expect(cumThrough(L, "a", "2026-08", 1)).toBe(10000);
    expect(cumThrough(L, "a", "2026-08", 2)).toBe(20000);
    expect(cumThrough(L, "a", "2026-08", 31)).toBe(30000);

    const s = castStats(L, "a", "2026-09", "2026-09-01");
    expect(s.prevSameDay).toBe(10000);
    expect(s.vsPrev).toBe(1400);      // 11,400 − 10,000
    expect(s.today?.gross).toBe(11400);
  });

  it("月末の日数が違っても、同じ「何日目まで」で比べる", () => {
    // 2月は 28日。31日を渡しても 28日までで切る
    const L = led({ "2026-02-28": day({ shifts: { a: shift() } }) });
    expect(cumThrough(L, "a", "2026-02", 31)).toBe(10000);
    expect(cumThrough(L, "a", "2026-02", 27)).toBe(0);
  });

  it("過ぎた月は丸ごと同士で比べる（8/31 を落とさない）", () => {
    const L = led({
      "2026-08-31": day({ shifts: { a: shift() } }),   // 9月には 31日が無い
      "2026-09-30": day({ shifts: { a: shift() } }),
    });
    const s = castStats(L, "a", "2026-09", "2026-10-05");
    expect(s.days.length).toBe(1);
    expect(s.prevSameDay).toBe(10000);   // 8/31 がちゃんと入る
    expect(s.vsPrev).toBe(0);
  });

  it("今月は「今日まで」で比べる（同じペースかを見たいので）", () => {
    const L = led({
      "2026-08-05": day({ shifts: { a: shift() } }),
      "2026-08-25": day({ shifts: { a: shift() } }),   // まだ来ていない日のぶんは入れない
      "2026-09-05": day({ shifts: { a: shift({ d1: 2 }) } }),
    });
    const s = castStats(L, "a", "2026-09", "2026-09-10");
    expect(s.prevSameDay).toBe(10000);   // 8/25 は 10日目より後なので入らない
    expect(s.vsPrev).toBe(1400);
  });

  it("これからの予定を出す。記録がある日は入れない", () => {
    const L = led(
      { "2026-09-10": day({ shifts: { a: shift() } }) },
      { "2026-09-10": [{ castId: "a" }], "2026-09-12": [{ castId: "a", in: "21:00", out: "02:00" }] },
    );
    const s = castStats(L, "a", "2026-09", "2026-09-10");
    expect(s.ahead.map((d) => d.date)).toEqual(["2026-09-12"]);
    expect(s.ahead[0].planIn).toBe("21:00");
    expect(s.ahead[0].planOut).toBe("02:00");
  });

  it("バックは「1本いくら」まで出す。売上％型は本数として出さない", () => {
    const L = led({
      "2026-09-01": day({ shifts: { a: shift({ d1: 3, b4: 50000 }) } }),
      "2026-09-02": day({ shifts: { a: shift({ d1: 2 }) } }),
    });
    const row = castMonth(L, "2026-09").find((r) => r.cast.id === "a")!;
    const bs = castBacks(L, "a", "2026-09", row);
    const drink = bs.find((x) => x.id === "d1")!;
    expect(drink).toMatchObject({ qty: 5, amount: 3500, unit: 700, isCount: true });
    const bottle = bs.find((x) => x.id === "b4")!;
    expect(bottle).toMatchObject({ amount: 10000, isCount: false, unit: null });   // 5万 × 20%
    // 多い順
    expect(bs[0].id).toBe("b4");
  });

  it("売っていない項目は出さない", () => {
    const L = led({ "2026-09-01": day({ shifts: { a: shift() } }) });
    const row = castMonth(L, "2026-09").find((r) => r.cast.id === "a")!;
    expect(castBacks(L, "a", "2026-09", row)).toEqual([]);
    expect(castBacks(L, "a", "2026-09", null)).toEqual([]);
  });
});

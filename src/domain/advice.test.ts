import { describe, it, expect } from "vitest";
import { migrate } from "./migrate";
import { adviceFor, expenseDeltas, profitBridge, weekdayCost } from "./advice";
import type { Ledger } from "./types";

const shop = {
  name: "検算", cardFeeRate: 5, openingCash: 0, openingDate: "2026-08-01", defaultWage: 2000,
  roundMinutes: 15, fixedLabor: 0, fixedCost: 0, dispatchGuarantee: 10000, openTime: "20:00", closeTime: "01:00",
};
const backs = [{ id: "d1", name: "ドリンク", type: "count", rate: 500, rateD: 500 }];
const shift = (over: Record<string, unknown> = {}) =>
  ({ on: true, in: "20:00", out: "01:00", breakMin: null, backs: {}, deduct: null, paid: null, ...over });
const day = (over: Record<string, unknown> = {}) =>
  ({ cashSales: 0, cardSales: 0, guests: null, expenses: [], bankDeposit: null, cardReceived: null,
     cashCounted: null, payout: null, shifts: {}, dispatch: [], settle: [], ...over });

const led = (days: Record<string, unknown>, over: Record<string, unknown> = {}): Ledger =>
  migrate({ v: 4, shop: { ...shop, ...over }, backItems: backs,
    casts: [{ id: "a", name: "あい", wage: 2000, active: true }, { id: "b", name: "みく", wage: 2000, active: true }],
    days });

/** 内訳の合計が利益の差にぴったり一致すること。合わない分析は読まれない */
const sums = (L: Ledger, m: string) => {
  const b = profitBridge(L, m);
  return { diff: b.diff, sum: b.parts.reduce((s, x) => s + x.diff, 0) };
};

describe("利益の差を分ける", () => {
  it("前月に記録がなければ比べない", () => {
    const L = led({ "2026-09-01": day({ cashSales: 30000, guests: 3 }) });
    expect(profitBridge(L, "2026-09").ready).toBe(false);
  });

  it("内訳の合計は、利益の差とぴったり一致する", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 100000, guests: 10, shifts: { a: shift({ backs: { d1: 4 } }) }, expenses: [{ id: "e1", name: "酒", amount: 8000, method: "cash" }] }),
      "2026-08-02": day({ cashSales: 80000, cardSales: 20000, guests: 12, shifts: { a: shift(), b: shift() } }),
      "2026-09-01": day({ cashSales: 70000, guests: 9, shifts: { a: shift({ backs: { d1: 2 } }), b: shift() }, expenses: [{ id: "e2", name: "酒", amount: 15000, method: "cash" }] }),
      "2026-09-02": day({ cashSales: 60000, cardSales: 30000, guests: 8, shifts: { a: shift() }, payout: 5000 }),
    }, { fixedCost: 50000, fixedLabor: 20000 });
    const { diff, sum } = sums(L, "2026-09");
    expect(sum).toBe(diff);
    expect(diff).not.toBe(0);
  });

  it("客数と単価に割った合計が、売上の差に一致する", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 100000, guests: 10 }),
      "2026-09-01": day({ cashSales: 84000, guests: 12 }),
    });
    const b = profitBridge(L, "2026-09");
    const g = b.parts.find((x) => x.id === "guests")!;
    const s = b.parts.find((x) => x.id === "spend")!;
    expect(g.diff + s.diff).toBe(84000 - 100000);
    expect(g.diff).toBeGreaterThan(0);   // 人は増えた
    expect(s.diff).toBeLessThan(0);      // 単価は落ちた
  });

  it("客数が入っていない月は、売上を 1 本で出す", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 100000 }),
      "2026-09-01": day({ cashSales: 70000 }),
    });
    const b = profitBridge(L, "2026-09");
    expect(b.parts.find((x) => x.id === "sales")!.diff).toBe(-30000);
    expect(b.parts.find((x) => x.id === "guests")).toBe(undefined);
    expect(sums(L, "2026-09").sum).toBe(sums(L, "2026-09").diff);
  });

  it("人件費の内訳は、利益から見た向き（増えたらマイナス）で出す", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 100000, guests: 10, shifts: { a: shift() } }),
      "2026-09-01": day({ cashSales: 100000, guests: 10, shifts: { a: shift(), b: shift() } }),
    });
    const wage = profitBridge(L, "2026-09").parts.find((x) => x.id === "wage")!;
    expect(wage.diff).toBe(-10000);   // 5時間 × 2,000 のもう 1 人ぶん
  });

  it("効いた順に並ぶ", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 100000, guests: 10, expenses: [{ id: "e1", name: "酒", amount: 1000, method: "cash" }] }),
      "2026-09-01": day({ cashSales: 40000, guests: 10, expenses: [{ id: "e2", name: "酒", amount: 3000, method: "cash" }] }),
    });
    const parts = profitBridge(L, "2026-09").parts;
    expect(parts[0].id).toBe("spend");   // 単価が一番効いている
    expect(Math.abs(parts[0].diff)).toBeGreaterThan(Math.abs(parts[1].diff));
  });
});

describe("経費を項目ごとに比べる", () => {
  it("名前でまとめて、差の大きい順に出す", () => {
    const L = led({
      "2026-08-01": day({ expenses: [{ id: "1", name: "酒", amount: 10000, method: "cash" }, { id: "2", name: "氷", amount: 3000, method: "cash" }] }),
      "2026-09-01": day({ expenses: [{ id: "3", name: " 酒 ", amount: 25000, method: "cash" }, { id: "4", name: "氷", amount: 2000, method: "cash" }] }),
      "2026-09-02": day({ expenses: [{ id: "5", name: "酒", amount: 5000, method: "card" }] }),
    });
    const d = expenseDeltas(L, "2026-09");
    expect(d[0]).toEqual({ name: "酒", now: 30000, prev: 10000, diff: 20000 });
    expect(d[1]).toEqual({ name: "氷", now: 2000, prev: 3000, diff: -1000 });
  });

  it("名前が空なら「（名前なし）」でまとめる", () => {
    const L = led({ "2026-09-01": day({ expenses: [{ id: "1", name: "", amount: 500, method: "cash" }] }) });
    expect(expenseDeltas(L, "2026-09")[0].name).toBe("（名前なし）");
  });
});

describe("曜日ごとの人件費率", () => {
  it("記録のある曜日だけ返す", () => {
    // 2026-09-01 は火曜
    const L = led({
      "2026-09-01": day({ cashSales: 50000, shifts: { a: shift() } }),
      "2026-09-08": day({ cashSales: 30000, shifts: { a: shift() } }),
    });
    const w = weekdayCost(L, "2026-09");
    expect(w.length).toBe(1);
    expect(w[0]).toMatchObject({ dow: 2, days: 2, sales: 80000, labor: 20000 });
    expect(w[0].rate).toBeCloseTo(25, 5);
  });
});

describe("打ち手の提案", () => {
  it("一番増えた経費を名指しし、金額を添える", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 100000, guests: 10, expenses: [{ id: "1", name: "酒", amount: 10000, method: "cash" }] }),
      "2026-09-01": day({ cashSales: 100000, guests: 10, expenses: [{ id: "2", name: "酒", amount: 30000, method: "cash" }] }),
    });
    const a = adviceFor(L, "2026-09").find((x) => x.id === "expUp")!;
    expect(a.title).toContain("酒");
    expect(a.title).toContain("¥20,000");
    expect(a.impact).toBe(20000);
  });

  it("人件費率が上がっていれば、同じ率なら何円だったかを出す", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 200000, guests: 20, shifts: { a: shift() } }),
      "2026-09-01": day({ cashSales: 100000, guests: 10, shifts: { a: shift(), b: shift() } }),
    });
    const a = adviceFor(L, "2026-09").find((x) => x.id === "laborRate")!;
    expect(a.impact).toBeGreaterThan(0);
    expect(a.title).toContain("人件費率");
  });

  it("カード手数料を店がかぶっていれば知らせる。請求する設定なら出さない", () => {
    const days = { "2026-09-01": day({ cardSales: 200000, guests: 10 }) };
    expect(adviceFor(led(days), "2026-09").some((x) => x.id === "cardFee")).toBe(true);

    const paid = led(days);
    paid.posRule!.cardFeeOnGuest = true;
    expect(adviceFor(paid, "2026-09").some((x) => x.id === "cardFee")).toBe(false);
  });

  it("未回収のツケを知らせる", () => {
    const L = led({ "2026-09-01": day({ tabSales: 30000, tabCollected: 10000, guests: 3 }) });
    const a = adviceFor(L, "2026-09").find((x) => x.id === "tabOut")!;
    expect(a.impact).toBe(20000);
  });

  it("利益の打ち手が先、現金の手当てがあと。額の大きさでは追い越さない", () => {
    // 未払い（現金）の額を、利益の打ち手より大きくしても順番は変わらない
    const days: Record<string, unknown> = {
      "2026-08-01": day({ cashSales: 100000, guests: 10, shifts: { a: shift() },
        expenses: [{ id: "1", name: "酒", amount: 5000, method: "cash" }] }),
    };
    // 9月は 6 日ぶん 2 人体制（未払い 12万）。売上と客単価は先月と同じにしてある
    for (let i = 1; i <= 6; i++) {
      const k = `2026-09-0${i}`;
      days[k] = day({ cashSales: 100000, guests: 10, shifts: { a: shift(), b: shift() },
        expenses: i === 1 ? [{ id: "e", name: "酒", amount: 9000, method: "cash" }] : [] });
    }
    const L = led(days);
    const list = adviceFor(L, "2026-09");
    const kinds = list.map((x) => x.kind);
    expect(kinds.indexOf("cash")).toBeGreaterThan(-1);           // 未払いは出る
    expect(kinds.lastIndexOf("profit")).toBeLessThan(kinds.indexOf("cash"));
    // 未払い（現金）の方が額は大きいのに、先頭は利益の打ち手
    const cash = list.find((x) => x.kind === "cash")!;
    expect(cash.impact).toBeGreaterThan(list[0].impact);
    expect(list[0].kind).toBe("profit");
  });

  it("効き目の大きい順に並ぶ", () => {
    const L = led({
      "2026-08-01": day({ cashSales: 200000, guests: 20, expenses: [{ id: "1", name: "酒", amount: 5000, method: "cash" }] }),
      "2026-09-01": day({ cashSales: 100000, guests: 10, shifts: { a: shift(), b: shift() }, expenses: [{ id: "2", name: "酒", amount: 9000, method: "cash" }] }),
    });
    const list = adviceFor(L, "2026-09").filter((x) => x.kind === "profit");
    expect(list.length).toBeGreaterThan(1);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].impact).toBeGreaterThanOrEqual(list[i].impact);
  });

  it("記録が無い月には何も言わない", () => {
    expect(adviceFor(led({}), "2026-09")).toEqual([]);
  });

  it("先月と同じなら、余計なことを言わない", () => {
    const same = () => day({ cashSales: 100000, guests: 10, shifts: { a: shift() } });
    const L = led({ "2026-08-01": same(), "2026-09-01": same() });
    const ids = adviceFor(L, "2026-09").map((x) => x.id);
    expect(ids).not.toContain("expUp");
    expect(ids).not.toContain("laborRate");
    expect(ids).not.toContain("spendDown");
    expect(ids).not.toContain("guestsDown");
  });
});

/** 旧アーティファクトの計算部（test/legacy-calc.js）と、移植した calc.ts が同じ答えを出すことを確かめる。 */
import { describe, it, expect } from "vitest";
// @ts-expect-error 旧コードの切り出し（型なし）
import { createLegacy } from "../../test/legacy-calc.js";
import { migrate } from "./migrate";
import * as C from "./calc";

/* ---------- 乱数（再現可能） ---------- */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function pick<T>(r: () => number, arr: T[]): T { return arr[Math.floor(r() * arr.length)]; }
const numStr = (r: () => number, max: number, allowGarbage = true): string => {
  const x = r();
  if (x < 0.25) return "";
  if (allowGarbage && x < 0.28) return "abc";
  if (x < 0.32) return String(Math.floor(r() * max)) + ".5";
  return String(Math.floor(r() * max));
};
const timeStr = (r: () => number): string => {
  const x = r();
  if (x < 0.1) return "";
  if (x < 0.13) return "25:99";
  return String(Math.floor(r() * 24)).padStart(2, "0") + ":" + pick(r, ["00", "15", "30", "45", "07"]);
};

/** 旧形式（v2、数値は文字列）の状態をランダムに作る */
function randomLegacyState(seed: number) {
  const r = rng(seed);
  const backItems = [
    { id: "d1", name: "ドリンク S", type: "count", rate: numStr(r, 1000, false), rateD: numStr(r, 1000, false) },
    { id: "b2", name: "指名", type: "count", rate: "1000", rateD: r() < 0.5 ? undefined : "800" },
    { id: "b4", name: "ボトル", type: "amount", rate: "20", rateD: "15" },
    { id: "xx", name: "", type: "count", rate: "", rateD: "" },
  ];
  const casts = ["a1", "b2", "c3", "d4"].map((id) => ({ id, name: "cast" + id, wage: r() < 0.5 ? "" : numStr(r, 3000), active: r() < 0.8 }));
  const shop = {
    name: "テスト", cardFeeRate: pick(r, ["5", "3.5", "", "0"]), openingCash: numStr(r, 500000, false),
    openingDate: pick(r, ["2026-08-01", "2026-09-01", "", "2026-08-20"]),
    defaultWage: pick(r, ["1800", "2000", ""]), roundMinutes: pick(r, ["15", "1", "30", ""]),
    fixedLabor: numStr(r, 300000, false), fixedCost: numStr(r, 300000, false),
    dispatchGuarantee: pick(r, ["15000", "12000", ""]), openTime: "20:00", closeTime: "01:00",
  };
  const days: Record<string, any> = {};
  const months = ["2026-08", "2026-09"];
  const nDays = 3 + Math.floor(r() * 12);
  for (let i = 0; i < nDays; i++) {
    const k = pick(r, months) + "-" + String(1 + Math.floor(r() * 28)).padStart(2, "0");
    const shifts: Record<string, any> = {};
    for (const c of [...casts, { id: "gone" }]) {
      if (r() < 0.6) shifts[c.id] = {
        on: r() < 0.8, in: timeStr(r), out: timeStr(r), breakMin: numStr(r, 90),
        backs: { d1: numStr(r, 10), b2: numStr(r, 5), b4: numStr(r, 50000), zz: "3" },
        deduct: numStr(r, 3000), paid: numStr(r, 20000),
      };
    }
    const dispatch = [];
    const dn = Math.floor(r() * 3);
    for (let j = 0; j < dn; j++) dispatch.push({
      id: "dp" + i + j, name: pick(r, ["ゆき", " ゆき ", "りん", ""]), guarantee: numStr(r, 20000),
      in: timeStr(r), out: timeStr(r), breakMin: numStr(r, 60),
      backs: { d1: numStr(r, 10), b4: numStr(r, 30000) }, deduct: numStr(r, 2000), paid: numStr(r, 20000),
    });
    const expenses = [];
    const en = Math.floor(r() * 4);
    for (let j = 0; j < en; j++) expenses.push({ name: "exp", amount: numStr(r, 30000), method: pick(r, ["cash", "card", "bank", undefined]) });
    const settle = [];
    const sn = Math.floor(r() * 3);
    for (let j = 0; j < sn; j++) settle.push({
      id: "st" + i + j, who: pick(r, ["c:a1", "c:b2", "c:gone", "d:ゆき", "d:りん", ""]),
      forMonth: pick(r, months), amount: numStr(r, 60000),
    });
    days[k] = {
      cashSales: numStr(r, 400000), cardSales: numStr(r, 300000), guests: numStr(r, 40),
      expenses, bankDeposit: numStr(r, 200000), cardReceived: numStr(r, 200000),
      cashCounted: numStr(r, 600000), payout: numStr(r, 50000), shifts, dispatch, settle,
    };
  }
  return { v: 2, shop, backItems, casts, days };
}

/** NaN と null を含めて厳密に等しいか */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
  return JSON.stringify(a) === JSON.stringify(b);
}
function expectSameFields(actual: any, legacy: any, fields: string[], ctx: string) {
  for (const f of fields) {
    if (!same(actual[f], legacy[f])) throw new Error(`${ctx}.${f}: new=${JSON.stringify(actual[f])} legacy=${JSON.stringify(legacy[f])}`);
  }
}

const DAY_FIELDS = ["date", "cash", "card", "sales", "guests", "expCash", "expCard", "expBank", "exp", "bankDeposit", "cardReceived", "cashCounted", "labor", "laborR", "laborD", "paidCash", "paidDetail", "paidLump", "paidCount", "settled", "unpaid", "workers", "workersR", "workersD", "hours", "fee", "profit"];
// 旧コードの monthTotals は settled を初期化していないため NaN になる（旧バグ）。新実装は 0 始まりなので比較から外す。
const MONTH_FIELDS = ["days", "cash", "card", "sales", "guests", "exp", "expCash", "labor", "laborR", "laborD", "paidCash", "paidDetail", "paidLump", "unpaid", "fee", "bankDeposit", "cardReceived", "hours", "workers", "settledFor", "fixedLabor", "fixedCost", "laborAll", "costAll", "profit", "avgSpend"];
const CAST_FIELDS = ["hours", "wage", "backTotal", "backs", "deduct", "gross", "paid", "settled", "unpaid", "days"];
const DISP_FIELDS = ["name", "days", "hours", "guarantee", "backTotal", "backs", "deduct", "gross", "paid", "settled", "unpaid"];

describe("旧コードとの同値性", () => {
  it("ランダムな状態 300 件で日・月・キャスト・派遣・残高が一致する", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const S = randomLegacyState(seed);
      const Lg = createLegacy(JSON.parse(JSON.stringify(S)));
      const L = migrate(JSON.parse(JSON.stringify(S)));
      const ctx = `seed=${seed}`;

      for (const k of Object.keys(S.days)) expectSameFields(C.dayTotals(L, k), Lg.dayTotals(k), DAY_FIELDS, `${ctx} day ${k}`);
      expectSameFields(C.dayTotals(L, "2026-01-01"), Lg.dayTotals("2026-01-01"), DAY_FIELDS, `${ctx} empty day`);

      for (const m of ["2026-08", "2026-09", "2026-07"]) {
        const a = C.monthTotals(L, m), b = Lg.monthTotals(m);
        expectSameFields(a, b, MONTH_FIELDS, `${ctx} month ${m}`);
        expect(a.series.length).toBe(b.series.length);

        const ca = C.castMonth(L, m).sort((x, y) => x.cast.id.localeCompare(y.cast.id));
        const cb = Lg.castMonth(m).sort((x: any, y: any) => x.cast.id.localeCompare(y.cast.id));
        expect(ca.map((x) => x.cast.id)).toEqual(cb.map((x: any) => x.cast.id));
        ca.forEach((row, i) => expectSameFields(row, cb[i], CAST_FIELDS, `${ctx} cast ${m} ${row.cast.id}`));

        const da = C.dispatchMonth(L, m).sort((x, y) => x.name.localeCompare(y.name));
        const db = Lg.dispatchMonth(m).sort((x: any, y: any) => x.name.localeCompare(y.name));
        expect(da.map((x) => x.name)).toEqual(db.map((x: any) => x.name));
        da.forEach((row, i) => expectSameFields(row, db[i], DISP_FIELDS, `${ctx} disp ${m} ${row.name}`));

        expect(C.owedList(L, m)).toEqual(Lg.owedList(m));
        for (const who of ["c:a1", "c:gone", "d:ゆき", "d:りん", ""]) expect(C.unpaidFor(L, who, m)).toBe(Lg.unpaidFor(who, m));
        expect(C.settlementsFor(L, m)).toBe(Lg.settlementsFor(m));
      }
      expect(C.balances(L)).toEqual(Lg.balances());
      expect(C.dispatchNames(L)).toEqual(Lg.dispatchNames());
      for (const who of ["c:a1", "c:zzz", "d:ゆき", ""]) expect(C.whoLabel(L, who)).toBe(Lg.whoLabel(who));
    }
  });

  it("手書きケース：15分丸め・日跨ぎ・ボトル%・派遣の既定日給", () => {
    const S = {
      v: 2,
      shop: { cardFeeRate: "5", openingCash: "100000", openingDate: "2026-09-01", defaultWage: "2000", roundMinutes: "15", dispatchGuarantee: "15000" },
      backItems: [{ id: "d1", name: "D", type: "count", rate: "500", rateD: "400" }, { id: "b4", name: "B", type: "amount", rate: "20", rateD: "10" }],
      casts: [{ id: "a", name: "A", wage: "" }, { id: "b", name: "B", wage: "2500" }],
      days: {
        "2026-09-01": {
          cashSales: "100000", cardSales: "50000", guests: "10",
          expenses: [{ name: "x", amount: "3000", method: "cash" }, { name: "y", amount: "2000", method: "card" }],
          bankDeposit: "20000", cardReceived: "", cashCounted: "150000", payout: "5000",
          shifts: { a: { on: true, in: "20:00", out: "01:10", breakMin: "", backs: { d1: "3", b4: "30000" }, deduct: "500", paid: "10000" },
                    b: { on: true, in: "21:00", out: "00:00", breakMin: "20", backs: {}, deduct: "", paid: "" } },
          dispatch: [{ id: "x", name: "ゆき", guarantee: "", in: "", out: "", breakMin: "", backs: { d1: "2", b4: "10000" }, deduct: "", paid: "5000" }],
          settle: [],
        },
      },
    };
    const L = migrate(S);
    const pa = C.payOf(L, "a", L.days["2026-09-01"].shifts.a);
    expect(pa.mins).toBe(300); // 5h10m → 15分切り捨てで 300 分
    expect(pa.wage).toBe(10000); // 5h × 2000
    expect(pa.backTotal).toBe(1500 + 6000);
    expect(pa.gross).toBe(10000 + 7500 - 500);
    expect(pa.unpaid).toBe(pa.gross - 10000);
    const pb = C.payOf(L, "b", L.days["2026-09-01"].shifts.b);
    expect(pb.mins).toBe(150); // 3h − 20分 = 160 → 150
    expect(pb.wage).toBe(6250);
    const pd = C.dispatchPay(L, L.days["2026-09-01"].dispatch[0]);
    expect(pd.guarantee).toBe(15000);
    expect(pd.backTotal).toBe(800 + 1000);
    const t = C.dayTotals(L, "2026-09-01");
    expect(t.sales).toBe(150000);
    expect(t.fee).toBe(2500);
    expect(t.labor).toBe(pa.gross + pb.gross + pd.gross + 5000);
    expect(t.paidCash).toBe(10000 + 5000 + 5000);
    expect(C.cashAsOf(L, "2026-09-01")).toBe(100000 + 100000 - 3000 - 20000 - 20000);
    expect(C.balances(L).cardOut).toBe(50000 - 2500);
    expect(C.balances(L).lastCount).toBe(150000);
  });

  it("migrate：v3 は往復で変わらない、壊れた入力は既定値", () => {
    const L = migrate(randomLegacyState(7));
    expect(migrate(JSON.parse(JSON.stringify(L)))).toEqual(L);
    expect(migrate(null).v).toBe(3);
    expect(migrate("x").casts).toEqual([]);
    expect(migrate({ backItems: [{ id: "b1", name: "ドリンクバック" }, {}, {}, {}], days: {} }).backItems.map((b) => b.id)).toEqual(["d1", "d2", "d3", "b2", "b3", "b4"]);
  });
});

describe("円グラフ・年表示の集計", () => {
  const S = {
    v: 2,
    shop: { cardFeeRate: "5", fixedLabor: "100000", fixedCost: "50000", defaultWage: "2000", roundMinutes: "15", dispatchGuarantee: "10000", openingDate: "2026-01-01" },
    backItems: [{ id: "d1", name: "D", type: "count", rate: "500", rateD: "500" }, { id: "b4", name: "B", type: "amount", rate: "20", rateD: "10" }],
    casts: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    days: {
      "2026-03-02": { cashSales: "100000", cardSales: "0", shifts: { a: { on: true, in: "20:00", out: "01:00", backs: { b4: "30000", d1: "2" } } }, dispatch: [{ id: "x", name: "ゆき", backs: { b4: "10000" } }], expenses: [], settle: [] },
      "2026-03-07": { cashSales: "50000", cardSales: "50000", shifts: { b: { on: true, in: "20:00", out: "01:00", backs: { d1: "5" } } }, dispatch: [], expenses: [{ amount: "2000", method: "cash" }], settle: [] },
      "2026-05-01": { cashSales: "80000", cardSales: "20000", shifts: {}, dispatch: [], expenses: [], settle: [] },
    },
  };
  const L = migrate(S);

  it("castContribution は売上%型があれば対象売上、無ければバック額", () => {
    const { rows, basis } = C.castContribution(L, "2026-03");
    expect(basis).toBe("target");
    expect(rows.map((r) => [r.name, r.value])).toEqual([["A", 30000], ["ゆき（派遣）", 10000]]);
    const L2 = { ...L, backItems: L.backItems.filter((b) => b.type !== "amount") };
    const r2 = C.castContribution(L2, "2026-03");
    expect(r2.basis).toBe("back");
    expect(r2.rows.map((r) => [r.name, r.value])).toEqual([["B", 2500], ["A", 1000]]);
  });

  it("weekdaySales は曜日ごとに売上を足す", () => {
    const w = C.weekdaySales(C.monthTotals(L, "2026-03").series);
    expect(w[1]).toBe(100000); // 3/2 は月曜
    expect(w[6]).toBe(100000); // 3/7 は土曜
    expect(w.reduce((s, x) => s + x, 0)).toBe(200000);
  });

  it("yearTotals は日報のある月だけ固定費を足す", () => {
    const y = C.yearTotals(L, "2026");
    expect(y.months.length).toBe(12);
    expect(y.sales).toBe(300000);
    expect(y.days).toBe(3);
    const mar = y.months[2], apr = y.months[3], may = y.months[4];
    expect(apr.laborAll).toBe(0); expect(apr.costAll).toBe(0); expect(apr.profit).toBe(0);
    expect(mar.laborAll).toBe(C.monthTotals(L, "2026-03").laborAll);
    expect(may.costAll).toBe(50000 + 20000 * 0.05);
    expect(y.profit).toBe(y.months.reduce((s, x) => s + x.profit, 0));
    expect(y.laborAll).toBe(mar.laborAll + may.laborAll);
  });
});

describe("月ごとの時給", () => {
  const base = {
    v: 3,
    shop: { cardFeeRate: 0, openingCash: 0, openingDate: "2026-01-01", defaultWage: 2000, roundMinutes: 15, fixedLabor: 0, fixedCost: 0, dispatchGuarantee: 0, openTime: "20:00", closeTime: "01:00", name: "" },
    backItems: [],
    casts: [{ id: "a", name: "A", wage: 2000, active: true, wages: [{ from: "2026-05", wage: 2500 }, { from: "2026-08", wage: 3000 }] },
             { id: "b", name: "B", wage: null, active: true }],
    days: {} as Record<string, unknown>,
  };
  const shift = { on: true, in: "20:00", out: "00:00", breakMin: null, backs: {}, deduct: null, paid: null };
  for (const k of ["2026-03-10", "2026-05-10", "2026-07-10", "2026-08-10"]) {
    base.days[k] = { cashSales: 100000, cardSales: 0, guests: null, expenses: [], bankDeposit: null, cardReceived: null, cashCounted: null, payout: null, shifts: { a: { ...shift }, b: { ...shift } }, dispatch: [], settle: [] };
  }
  const L = migrate(base);

  it("その月に適用される時給を選ぶ", () => {
    const a = L.casts[0], b = L.casts[1];
    expect(C.castWageAt(a, L.shop, "2026-03")).toBe(2000);
    expect(C.castWageAt(a, L.shop, "2026-04-30")).toBe(2000);
    expect(C.castWageAt(a, L.shop, "2026-05-01")).toBe(2500);
    expect(C.castWageAt(a, L.shop, "2026-07")).toBe(2500);
    expect(C.castWageAt(a, L.shop, "2026-08")).toBe(2500 + 500);
    expect(C.castWageAt(a, L.shop, "2026-12")).toBe(3000);
    expect(C.castWageAt(b, L.shop, "2026-08")).toBe(2000); // 変更なしなら店の基本時給
    expect(C.castWageAt(a, L.shop)).toBe(2000); // 月を渡さなければ最初の時給
  });

  it("過去の月の給料は当時の時給のまま", () => {
    // 4時間勤務 = 時給×4
    expect(C.dayTotals(L, "2026-03-10").laborR).toBe(2000 * 4 + 2000 * 4);
    expect(C.dayTotals(L, "2026-05-10").laborR).toBe(2500 * 4 + 2000 * 4);
    expect(C.dayTotals(L, "2026-08-10").laborR).toBe(3000 * 4 + 2000 * 4);
    const may = C.castMonth(L, "2026-05").find((r) => r.cast.id === "a")!;
    expect(may.wage).toBe(2500 * 4);
    const aug = C.castMonth(L, "2026-08").find((r) => r.cast.id === "a")!;
    expect(aug.wage).toBe(3000 * 4);
  });

  it("wageTimeline は古い順に並ぶ", () => {
    const t = C.wageTimeline(L.casts[0], L.shop);
    expect(t.map((x) => x.wage)).toEqual([2000, 2500, 3000]);
    expect(t[0].from).toBeNull();
    expect(t[1].from).toBe("2026-05");
  });

  it("migrate は wages を往復で保つ・壊れた行は捨てる", () => {
    expect(migrate(JSON.parse(JSON.stringify(L))).casts[0].wages).toEqual(L.casts[0].wages);
    const dirty = migrate({ casts: [{ id: "x", name: "X", wage: "1800", wages: [{ from: "2026-5", wage: "9" }, { from: "2026-06", wage: "2400" }, { wage: 1 }] }] });
    expect(dirty.casts[0].wages).toEqual([{ from: "2026-06", wage: 2400 }]);
  });
});

describe("ランキングとシフト", () => {
  const S = {
    v: 3,
    shop: { cardFeeRate: 0, openingCash: 0, openingDate: "2026-01-01", defaultWage: 2000, roundMinutes: 15, fixedLabor: 0, fixedCost: 0, dispatchGuarantee: 10000, openTime: "20:00", closeTime: "01:00", name: "" },
    backItems: [
      { id: "d1", name: "ドリンク", type: "count", rate: 500, rateD: 500 },
      { id: "b2", name: "指名", type: "count", rate: 1000, rateD: 1000 },
      { id: "b4", name: "ボトル", type: "amount", rate: 20, rateD: 10 },
    ],
    casts: [{ id: "a", name: "あい", wage: 2000, active: true }, { id: "b", name: "みく", wage: 2000, active: true }],
    days: {
      "2026-09-01": {
        cashSales: 0, cardSales: 0, guests: null, expenses: [], bankDeposit: null, cardReceived: null, cashCounted: null, payout: null,
        shifts: {
          a: { on: true, in: "20:00", out: "00:00", breakMin: null, backs: { d1: 4, b2: 2, b4: 50000 }, deduct: null, paid: null },
          b: { on: true, in: "20:00", out: "00:00", breakMin: null, backs: { d1: 1, b2: 6, b4: 20000 }, deduct: null, paid: null },
        },
        dispatch: [{ id: "x", name: "ゆき", guarantee: null, in: "", out: "", breakMin: null, backs: { d1: 3, b4: 90000 }, deduct: null, paid: null }],
        settle: [],
      },
    },
    plans: { "2026-09-05": ["a"], "2026-09-06": ["a", "b"], "2026-09-07": ["zzz"], "bad-date": ["a"] },
  };
  const L = migrate(S);

  it("plans は日付とIDが正しいものだけ残る", () => {
    expect(Object.keys(L.plans ?? {}).sort()).toEqual(["2026-09-05", "2026-09-06"]);
    expect(L.plans!["2026-09-06"]).toEqual(["a", "b"]);
    expect(migrate(JSON.parse(JSON.stringify(L))).plans).toEqual(L.plans);
  });

  it("castRanking は指標ごとに並び替わる", () => {
    const t = C.castRanking(L, "2026-09", "target");
    expect(t.map((r) => [r.name, r.value])).toEqual([["ゆき", 90000], ["あい", 50000], ["みく", 20000]]);
    const cnt = C.castRanking(L, "2026-09", "count");
    expect(cnt.map((r) => [r.name, r.value])).toEqual([["みく", 7], ["あい", 6], ["ゆき", 3]]);
    const back = C.castRanking(L, "2026-09", "back");
    // あい: 2000 + 2000 + 10000 = 14000 / みく: 500 + 6000 + 4000 = 10500 / ゆき(派遣): 1500 + 9000 = 10500
    expect(back.map((r) => r.value)).toEqual([14000, 10500, 10500]);
    expect(back[0].name).toBe("あい");
    expect(t.find((r) => r.name === "ゆき")!.isDispatch).toBe(true);
  });

  it("castShiftDays は予定と実績をまとめる", () => {
    const d = C.castShiftDays(L, "a", "2026-09");
    expect(d.map((x) => x.date)).toEqual(["2026-09-01", "2026-09-05", "2026-09-06"]);
    expect(d[0]).toMatchObject({ planned: false, worked: true, hours: 4 });
    expect(d[1]).toMatchObject({ planned: true, worked: false, hours: 0, gross: 0 });
    expect(C.castShiftDays(L, "b", "2026-09").length).toBe(2);
  });
});

describe("現金の動き", () => {
  const day = (cash: number, expCash: number, paid: number, bank: number) => ({
    cashSales: cash, cardSales: 0, guests: null,
    expenses: [{ id: "e", name: "x", amount: expCash, method: "cash" }],
    bankDeposit: bank, cardReceived: null, cashCounted: null, payout: paid,
    shifts: {}, dispatch: [], settle: [],
  });
  const L = migrate({
    v: 3,
    shop: { cardFeeRate: 0, openingCash: 50000, openingDate: "2026-09-01", defaultWage: 2000, roundMinutes: 15, fixedLabor: 0, fixedCost: 0, dispatchGuarantee: 0, openTime: "20:00", closeTime: "01:00", name: "" },
    backItems: [], casts: [],
    days: {
      "2026-08-31": day(10000, 0, 0, 0),
      "2026-09-01": day(30000, 3000, 19200, 0),
      "2026-09-02": day(50000, 2000, 10000, 20000),
    },
  });

  it("その日だけの現金は、前の日を引きずらない", () => {
    const a = C.dayCashFlow(L, "2026-09-01");
    expect(a).toMatchObject({ cash: 30000, expCash: 3000, paidCash: 19200, bankDeposit: 0 });
    expect(a.net).toBe(30000 - 3000 - 19200); // 7,800
    const b = C.dayCashFlow(L, "2026-09-02");
    expect(b.net).toBe(50000 - 2000 - 10000 - 20000); // 18,000
    expect(C.dayCashFlow(L, "2026-09-09").net).toBe(0); // 記録のない日は 0
  });

  it("月ぶんはその月だけを足す", () => {
    const m = C.monthCashFlow(L, "2026-09");
    expect(m.cash).toBe(80000);
    expect(m.net).toBe(7800 + 18000);
    expect(C.monthCashFlow(L, "2026-08").cash).toBe(10000);
  });

  it("累計は起点日より前を含めない", () => {
    const all = C.cashFlow(L, Object.keys(L.days).filter((k) => k >= L.shop.openingDate));
    expect(all.cash).toBe(80000); // 8/31 は起点より前なので入らない
    expect(50000 + all.net).toBe(C.balances(L).cash);
  });
});

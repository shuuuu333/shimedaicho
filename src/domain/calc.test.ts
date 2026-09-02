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

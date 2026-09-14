import { describe, it, expect } from "vitest";
import * as R from "./receipt";
import * as P from "./pos";
import type { Check, PosRule } from "./types";

const RULE: PosRule = {
  setMinutes: 60, setPrice: 3000,
  setPlans: [{ min: 60, price: 3000 }],
  extendMinutes: 30, extendPrice: 1500,
  tableChargeRate: 0, tableChargeOnSet: false,
  taxRate: 10, taxOnSet: false, taxOnExtend: false, taxOnItems: false,
  alertBeforeMin: 10, autoExtend: false, roundTo: 1,
};
const T0 = "2026-09-14T20:00:00.000Z";

function paid(method: "cash" | "card" | "tab", amount: number): Check {
  const c = P.newCheck("2026-09-14", "s1", 2, { min: 60, price: 3000 }, T0, "店長");
  c.status = "closed";
  c.payments = [{ method, amount }];
  return c;
}

describe("領収書の額", () => {
  it("受け取った額をそのまま載せる（計算し直さない）", () => {
    // あとから伝票を直しても、渡した紙と同じ額が残る
    const c = paid("cash", 12960);
    c.setPrice = 99999;
    expect(R.receiptAmount(c, RULE)).toBe(12960);
  });

  it("まだ会計していなければ、いまの請求額を使う", () => {
    const c = P.newCheck("2026-09-14", "s1", 2, { min: 60, price: 3000 }, T0, "店長");
    expect(R.receiptAmount(c, RULE)).toBe(6000);
  });
});

describe("うち消費税", () => {
  it("総額 × 率 ÷（100 ＋ 率）で出す", () => {
    expect(R.receiptTax(11000, RULE)).toEqual({ rate: 10, included: 11000, tax: 1000 });
  });

  it("外税で組み立てた伝票でも、内税の伝票でも同じ税額になる", () => {
    const soto = { ...RULE, taxOnSet: true, taxOnExtend: true, taxOnItems: true };
    const a = P.newCheck("2026-09-14", "s1", 2, { min: 60, price: 3000 }, T0, "x");   // 6000 ＋税 600
    const b = P.newCheck("2026-09-14", "s1", 2, { min: 60, price: 3300 }, T0, "x");   // 6600 税込
    const ta = P.checkTotals(a, soto).total;
    const tb = P.checkTotals(b, RULE).total;
    expect(ta).toBe(tb);
    expect(R.receiptTax(ta, soto)!.tax).toBe(R.receiptTax(tb, RULE)!.tax);
  });

  it("税率 0 の店（免税事業者）は税額を出さない", () => {
    expect(R.receiptTax(10000, { ...RULE, taxRate: 0 })).toBeNull();
  });
});

describe("収入印紙", () => {
  it("現金で 5 万円以上なら要る", () => {
    expect(R.needsStamp(paid("cash", 50000))).toBe(true);
    expect(R.needsStamp(paid("cash", 49999))).toBe(false);
  });

  it("カードは要らない（お金を受け取っていないため）", () => {
    expect(R.needsStamp(paid("card", 120000))).toBe(false);
  });

  it("ツケも要らない（まだ受け取っていない）", () => {
    expect(R.needsStamp(paid("tab", 120000))).toBe(false);
  });
});

describe("領収書の番号", () => {
  it("紙に番号を振っている店は、その番号を使う", () => {
    const c = paid("cash", 8000);
    c.slipNo = "A-1043";
    expect(R.receiptNo(c)).toBe("A-1043");
  });

  it("無ければ伝票の id から作る。同じ伝票なら何度出しても同じ番号", () => {
    const c = paid("cash", 8000);
    expect(R.receiptNo(c)).toBe(R.receiptNo(c));
    expect(R.receiptNo(c)).toHaveLength(6);
  });
});

describe("発行日", () => {
  it("紙を出す日を書く（営業日ではない）", () => {
    expect(R.issuedOn(new Date(2026, 8, 14))).toBe("2026年9月14日");
  });
});

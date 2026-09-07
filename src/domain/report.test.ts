import { describe, it, expect } from "vitest";
import { defaultLedger, emptyDay } from "./migrate";
import { dayReportText } from "./report";
import type { Ledger } from "./types";

function ledger(): Ledger {
  const L = defaultLedger();
  L.shop.name = "テストガールズバー";
  L.shop.openingDate = "2026-09-01";
  L.shop.openingCash = 100000;
  L.shop.cardFeeRate = 5;
  L.casts = [{ id: "c1", name: "あや", wage: 2000, active: true }];
  return L;
}

describe("LINE に送る文面", () => {
  it("売上・人件費・現金の差が入る", () => {
    const L = ledger();
    L.days["2026-09-06"] = {
      ...emptyDay(),
      cashSales: 80000, cardSales: 20000, guests: 10,
      expenses: [{ id: "e1", name: "おしぼり", amount: 3000, method: "cash" }],
      cashCounted: 150000,
      shifts: { c1: { on: true, in: "20:00", out: "01:00", breakMin: null, backs: {}, deduct: null, paid: 5000 } },
    };
    const t = dayReportText(L, "2026-09-06");

    expect(t).toContain("テストガールズバー");
    expect(t).toContain("売上 ¥100,000");
    expect(t).toContain("現金 ¥80,000 ／ カード ¥20,000");
    expect(t).toContain("10名 ・ 客単価 ¥10,000");
    expect(t).toContain("人件費 ¥10,000（在籍 1名）");   // 5時間 × ¥2,000
    expect(t).toContain("経費 ¥3,000");
    expect(t).toContain("カード手数料 ¥1,000");          // 20,000 × 5%
    expect(t).toContain("差引 ¥86,000");
    // 手元現金 = 起点100,000 ＋ (現金売上80,000 − 現金経費3,000 − 日払い5,000)
    expect(t).toContain("手元の現金 ¥172,000");
    expect(t).toContain("実査 ¥150,000（−22,000）");
    expect(t).toContain("今日の未払い ¥5,000");          // 支給10,000 − 日払い5,000
  });

  it("実査を入れていなければ、その旨を出す", () => {
    const L = ledger();
    L.days["2026-09-06"] = { ...emptyDay(), cashSales: 50000 };
    const t = dayReportText(L, "2026-09-06");
    expect(t).toContain("実査 まだ数えていません");
    expect(t).not.toContain("客単価");   // 客数が無ければ出さない
  });

  it("ぴったり合っていれば「ぴったり」と出す", () => {
    const L = ledger();
    L.days["2026-09-06"] = { ...emptyDay(), cashSales: 50000, cashCounted: 150000 };
    expect(dayReportText(L, "2026-09-06")).toContain("実査 ¥150,000（ぴったり）");
  });

  it("LINE の上限（5000字）に対して十分短い", () => {
    const L = ledger();
    L.days["2026-09-06"] = { ...emptyDay(), cashSales: 999999999, cardSales: 999999999, guests: 999 };
    expect(dayReportText(L, "2026-09-06").length).toBeLessThan(500);
  });
});

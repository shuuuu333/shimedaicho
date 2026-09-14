import { describe, it, expect } from "vitest";
import { demoLedger } from "./demo";
import { monthTotals } from "./calc";

const TODAY = "2026-09-14";

describe("お試しデータ", () => {
  it("何度作っても同じ月になる（撮り直しができる）", () => {
    expect(JSON.stringify(demoLedger(TODAY))).toBe(JSON.stringify(demoLedger(TODAY)));
  });

  it("今日までが実績、先は予定だけ", () => {
    const L = demoLedger(TODAY);
    const days = Object.keys(L.days).sort();
    expect(days[0]).toBe("2026-09-01");
    expect(days[days.length - 1]).toBe(TODAY);          // 先の日に実績を作らない
    expect(Object.keys(L.plans!).length).toBeGreaterThan(days.length);   // 予定は先まである
  });

  it("月をまたいで日を作らない（9月に 31 日を作らない）", () => {
    for (const k of Object.keys(demoLedger(TODAY).days)) expect(k.startsWith("2026-09")).toBe(true);
    for (const k of Object.keys(demoLedger("2026-02-20").days)) {
      expect(k.startsWith("2026-02")).toBe(true);
      expect(Number(k.slice(8, 10))).toBeLessThanOrEqual(28);
    }
  });

  it("見せたい画面が動くだけの中身がある", () => {
    const L = demoLedger(TODAY);
    const a = monthTotals(L, "2026-09");
    expect(a.sales).toBeGreaterThan(0);
    expect(a.days).toBeGreaterThanOrEqual(10);          // 着地予測は 3 日以上で動く
    expect(a.labor).toBeGreaterThan(0);
    expect(a.unpaid).toBeGreaterThan(0);                // 未払いの画面も出る
  });

  it("金土が月火より大きい（均した月は嘘っぽく見える）", () => {
    const L = demoLedger(TODAY);
    const by = (dow: number) => Object.entries(L.days)
      .filter(([k]) => new Date(k + "T00:00:00").getDay() === dow)
      .reduce((s, [, d]) => s + (d.cashSales ?? 0) + (d.cardSales ?? 0), 0);
    expect(by(6) + by(5)).toBeGreaterThan(by(1) + by(2));
  });

  it("昨日だけ現金が合っていない（合わないときの画面を見せるため）", () => {
    const L = demoLedger(TODAY);
    const y = L.days["2026-09-13"];
    expect(y.cashCounted).not.toBeNull();
    const 出た = (y.cashSales ?? 0)
      - Object.values(y.shifts).reduce((s, sh) => s + (sh.paid ?? 0), 0)
      - y.expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
    expect(出た - (y.cashCounted ?? 0)).toBe(3000);
  });

  it("キャストと席と商品がそろっている", () => {
    const L = demoLedger(TODAY);
    expect(L.casts).toHaveLength(6);
    expect(L.casts.every((c) => c.name.length > 0)).toBe(true);
    expect((L.seats ?? []).length).toBeGreaterThan(0);
    expect((L.menu ?? []).length).toBeGreaterThan(0);
  });
});

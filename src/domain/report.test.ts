import { describe, it, expect } from "vitest";
import { defaultLedger, emptyDay, migrate } from "./migrate";
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

  it("送った記録と自動送信の設定が、往復しても残る", () => {
    // 二度送りを防ぐ目印（lineSentAt）と、店の設定（lineAuto）が
    // バックアップやクラウド同期を通っても消えないこと
    const raw = {
      v: 4,
      shop: { name: "テスト", lineAuto: false },
      casts: [], backItems: [],
      days: { "2026-09-06": { cashSales: 1000, cashCounted: 5000, lineSentAt: "2026-09-07T01:20:00.000Z", shifts: {}, dispatch: [], expenses: [], settle: [] } },
    };
    const L = migrate(raw);
    expect(L.shop.lineAuto).toBe(false);
    expect(L.days["2026-09-06"].lineSentAt).toBe("2026-09-07T01:20:00.000Z");
    expect(migrate(JSON.parse(JSON.stringify(L)))).toEqual(L);

    // 設定していなければ未定義のまま（既定は「自動で送る」として画面側で扱う）
    const L2 = migrate({ v: 4, shop: {}, casts: [], backItems: [], days: {} });
    expect(L2.shop.lineAuto).toBeUndefined();
  });

  it("LINE の上限（5000字）に対して十分短い", () => {
    const L = ledger();
    L.days["2026-09-06"] = { ...emptyDay(), cashSales: 999999999, cardSales: 999999999, guests: 999 };
    expect(dayReportText(L, "2026-09-06").length).toBeLessThan(500);
  });
});

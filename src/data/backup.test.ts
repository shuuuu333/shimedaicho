import { describe, it, expect } from "vitest";
import { defaultLedger, emptyDay } from "../domain/migrate";
import { newCheck, lineFromMenu } from "../domain/pos";
import { backupJSON, parseBackup } from "./backup";
import type { Check, MenuItem } from "../domain/types";

const menu = (id: string, price: number, backItemId?: string): MenuItem =>
  ({ id, name: id, price, category: "x", kind: backItemId ? "castLinked" : "normal", backItemId, active: true, sort: 0 });

function sampleCheck(): Check {
  const c = newCheck("2026-09-06", "s1", 2, 3000, "2026-09-06T20:00:00.000Z", "test");
  c.lines.push(lineFromMenu(menu("cd", 1500, "d2"), "2026-09-06T20:10:00.000Z", "c1"));
  c.lines.push(lineFromMenu(menu("beer", 800), "2026-09-06T20:20:00.000Z"));
  c.lines[1].voided = { at: "2026-09-06T20:25:00.000Z", by: "me", reason: "打ち間違い" };
  c.status = "closed";
  c.closedAt = "2026-09-06T23:00:00.000Z";
  c.payments = [{ method: "cash", amount: 7500 }];
  c.received = 10000;
  return c;
}

describe("バックアップ", () => {
  it("台帳と伝票を包んで、読み戻せる", () => {
    const L = defaultLedger();
    L.shop.name = "テスト";
    L.days["2026-09-06"] = { ...emptyDay(), cashSales: 7500 };
    const c = sampleCheck();

    const back = parseBackup(backupJSON(L, [c]));
    expect(back.ledger.shop.name).toBe("テスト");
    expect(back.ledger.days["2026-09-06"].cashSales).toBe(7500);
    expect(back.checks).toHaveLength(1);
    // 取消の理由も、預かり金も、そのまま残る
    expect(back.checks[0].lines[1].voided?.reason).toBe("打ち間違い");
    expect(back.checks[0].received).toBe(10000);
    expect(back.checks[0]).toEqual(c);
  });

  it("伝票の無い（旧い）バックアップも読める", () => {
    const L = defaultLedger();
    L.days["2026-09-06"] = { ...emptyDay(), cashSales: 1000 };
    const back = parseBackup(JSON.stringify(L));
    expect(back.checks).toEqual([]);
    expect(back.ledger.days["2026-09-06"].cashSales).toBe(1000);
  });

  it("壊れた伝票は取り込まない", () => {
    const L = defaultLedger();
    const text = JSON.stringify({ ...L, checks: [sampleCheck(), { id: "x" }, null, "だめ", { id: "y", date: "2026-09-06", lines: [], status: "変" }] });
    const back = parseBackup(text);
    expect(back.checks).toHaveLength(1);
  });

  it("締め台帳のバックアップでなければ断る", () => {
    expect(() => parseBackup("{}")).toThrow();
    expect(() => parseBackup("これは JSON ではない")).toThrow();
  });
});

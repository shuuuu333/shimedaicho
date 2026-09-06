import { describe, it, expect } from "vitest";
import { produce } from "immer";
import { defaultLedger, emptyDay } from "../domain/migrate";
import { diffDirty, emptyDirty, mergeLedger, parseDirty, serializeDirty } from "./merge";

describe("merge", () => {
  it("diffDirty は変えた日と設定だけを拾う", () => {
    const a = defaultLedger();
    a.days["2026-09-01"] = emptyDay(); a.days["2026-09-02"] = emptyDay();
    const b = produce(a, (L) => { L.days["2026-09-02"].cashSales = 1000; L.days["2026-09-03"] = emptyDay(); });
    const d = diffDirty(a, b, emptyDirty());
    expect([...d.days].sort()).toEqual(["2026-09-02", "2026-09-03"]);
    expect(d.meta).toBe(false);
    const c = produce(b, (L) => { L.shop.name = "X"; delete L.days["2026-09-01"]; });
    diffDirty(b, c, d);
    expect(d.meta).toBe(true);
    expect(d.days.has("2026-09-01")).toBe(true);
  });

  it("mergeLedger は remote を土台に dirty な日だけ local を重ねる", () => {
    const remote = defaultLedger(); remote.shop.name = "R";
    remote.days["2026-09-01"] = { ...emptyDay(), cashSales: 1 };
    remote.days["2026-09-02"] = { ...emptyDay(), cashSales: 2 };
    remote.days["2026-09-04"] = { ...emptyDay(), cashSales: 4 };
    const local = defaultLedger(); local.shop.name = "L";
    local.days["2026-09-01"] = { ...emptyDay(), cashSales: 10 };
    local.days["2026-09-03"] = { ...emptyDay(), cashSales: 30 };
    const dirty = { days: new Set(["2026-09-01", "2026-09-03", "2026-09-04"]), meta: false };
    const m = mergeLedger(remote, local, dirty);
    expect(m.shop.name).toBe("R");
    expect(m.days["2026-09-01"].cashSales).toBe(10);
    expect(m.days["2026-09-02"].cashSales).toBe(2);
    expect(m.days["2026-09-03"].cashSales).toBe(30);
    expect(m.days["2026-09-04"]).toBeUndefined();
    expect(mergeLedger(remote, local, { days: new Set(), meta: true }).shop.name).toBe("L");
  });

  it("シフト予定とレジのマスタが同期で消えない", () => {
    // v3 までの mergeLedger は plans を出力に入れておらず、同期のたびに予定が消えていた
    const remote = defaultLedger();
    remote.plans = { "2026-09-01": ["c1"] };
    remote.menu = [{ id: "m1", name: "R のビール", price: 800, category: "ドリンク", kind: "normal", active: true, sort: 0 }];
    remote.seats = [{ id: "s1", name: "R の席", sort: 0 }];

    const local = defaultLedger();
    local.plans = { "2026-09-02": ["c2"] };
    local.menu = [{ id: "m2", name: "L のビール", price: 900, category: "ドリンク", kind: "normal", active: true, sort: 0 }];
    local.seats = [{ id: "s2", name: "L の席", sort: 0 }];

    // この端末では何も触っていない → remote 側がそのまま残る
    const keep = mergeLedger(remote, local, emptyDirty());
    expect(keep.plans).toEqual({ "2026-09-01": ["c1"] });
    expect(keep.menu?.[0].name).toBe("R のビール");
    expect(keep.seats?.[0].name).toBe("R の席");
    expect(keep.posRule?.setMinutes).toBe(60);

    // この端末で触った → local 側を採る
    const mine = mergeLedger(remote, local, { days: new Set(), meta: true });
    expect(mine.plans).toEqual({ "2026-09-02": ["c2"] });
    expect(mine.menu?.[0].name).toBe("L のビール");
    expect(mine.seats?.[0].name).toBe("L の席");
  });

  it("diffDirty はレジのマスタとシフト予定の変更も meta として拾う", () => {
    const a = defaultLedger();
    for (const mut of [
      (L: typeof a) => { L.menu![0].price = 12345; },
      (L: typeof a) => { L.seats!.push({ id: "z", name: "新しい席", sort: 99 }); },
      (L: typeof a) => { L.posRule!.setPrice = 2000; },
      (L: typeof a) => { L.plans = { "2026-09-01": ["c1"] }; },
    ]) {
      const b = produce(a, mut);
      expect(diffDirty(a, b, emptyDirty()).meta).toBe(true);
    }
  });

  it("dirty の保存と復元", () => {
    const d = { days: new Set(["2026-09-01"]), meta: true };
    const back = parseDirty(serializeDirty(d));
    expect([...back.days]).toEqual(["2026-09-01"]);
    expect(back.meta).toBe(true);
    expect(parseDirty("garbage").days.size).toBe(0);
  });
});

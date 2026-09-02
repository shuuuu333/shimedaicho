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

  it("dirty の保存と復元", () => {
    const d = { days: new Set(["2026-09-01"]), meta: true };
    const back = parseDirty(serializeDirty(d));
    expect([...back.days]).toEqual(["2026-09-01"]);
    expect(back.meta).toBe(true);
    expect(parseDirty("garbage").days.size).toBe(0);
  });
});

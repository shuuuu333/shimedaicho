import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { ShimeDB } from "./db";
import { LocalRepository } from "./localRepository";
import { defaultLedger } from "../domain/migrate";

describe("LocalRepository", () => {
  it("保存して読み戻せる・スナップショットは 30 件まで", async () => {
    const repo = new LocalRepository(new ShimeDB("test-" + Math.random()));
    expect(await repo.load()).toBeNull();
    const L = defaultLedger();
    L.shop.name = "店A";
    L.casts.push({ id: "c1", name: "あい", wage: null, active: true });
    await repo.save(L, "manual");
    const back = await repo.load();
    expect(back?.shop.name).toBe("店A");
    expect(back?.casts[0].name).toBe("あい");
    expect((await repo.meta()).lastSavedAt).not.toBeNull();
    for (let i = 0; i < 40; i++) await repo.snapshot(L, "manual");
    const snaps = await repo.snapshots();
    expect(snaps.length).toBe(30);
    const restored = await repo.loadSnapshot(snaps[0].id);
    expect(restored?.shop.name).toBe("店A");
  });
});

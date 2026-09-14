import { describe, it, expect } from "vitest";
import { defaultLedger, emptyDay } from "./migrate";
import { SETUP_STEPS, needsSetup, remainingSteps, setupProgress } from "./setup";
import type { Ledger } from "./types";

const fresh = (): Ledger => defaultLedger();

describe("はじめの設定", () => {
  it("まっさらな店は、全部が残っている", () => {
    expect(remainingSteps(fresh(), [])).toHaveLength(SETUP_STEPS.length);
  });

  it("店名とキャストは、入れたら勝手に消える（押させない）", () => {
    const L = fresh();
    L.shop.name = "スナックあおい";
    L.casts = [{ id: "c1", name: "あい", wage: null, active: true }];
    const left = remainingSteps(L, []).map((s) => s.id);
    expect(left).not.toContain("name");
    expect(left).not.toContain("casts");
  });

  it("値段や単価は、押さないと消えない（正しいかこちらで決められない）", () => {
    const L = fresh();
    // 値段を変えただけでは済んだことにしない。元の額が正しい店もある
    L.menu![0].price = 1234;
    expect(remainingSteps(L, []).map((s) => s.id)).toContain("menu");
    expect(remainingSteps(L, ["menu"]).map((s) => s.id)).not.toContain("menu");
  });

  it("押した覚えがあっても、店名が空なら残る（中身が勝つ）", () => {
    const L = fresh();
    expect(remainingSteps(L, ["name"]).map((s) => s.id)).toContain("name");
  });

  it("あと何個かを数えられる", () => {
    const L = fresh();
    L.shop.name = "あ";
    expect(setupProgress(L, ["wage", "set"])).toEqual({ done: 3, total: SETUP_STEPS.length });
  });

  it("全部済めば出さない", () => {
    const L = fresh();
    L.shop.name = "あ";
    L.casts = [{ id: "c1", name: "あい", wage: null, active: true }];
    expect(needsSetup(L, ["wage", "set", "menu", "backs", "cash"])).toBe(false);
  });

  it("もう使い始めている店には出さない（3 日入っていたら設定は自分のもの）", () => {
    const L = fresh();
    for (const k of ["2026-09-01", "2026-09-02", "2026-09-03"]) L.days[k] = emptyDay();
    expect(needsSetup(L, [])).toBe(false);
    // 1 日だけならまだ出す
    const L2 = fresh();
    L2.days["2026-09-01"] = emptyDay();
    expect(needsSetup(L2, [])).toBe(true);
  });

  it("設定へ飛ぶものは、設定画面が知っている id を指している", () => {
    // ここがずれるとボタンを押しても何も起きない。
    // GROUP_OF（Settings.tsx）に入っている id しか飛べない
    const known = ["shop", "cash", "fixed", "backs", "pos", "menu", "seats"];
    for (const s of SETUP_STEPS) {
      if (s.tab) continue;                       // 画面へ行くものは対象外
      expect(known, s.id).toContain(s.anchor);
    }
  });

  it("キャストだけは設定ではなく、キャストの画面へ行く", () => {
    expect(SETUP_STEPS.find((s) => s.id === "casts")!.tab).toBe("cast");
  });
});

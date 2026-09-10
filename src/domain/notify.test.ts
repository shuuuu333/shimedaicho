import { describe, it, expect } from "vitest";
import { FREE_LIMIT, batchText, defaultNotify, eventLine, monthlyEstimate, wants, type NowState, type PosEvent } from "./notify";

const T = (h: number, m: number) => new Date(2026, 8, 6, h, m, 0).toISOString();
const now: NowState = { openGroups: 2, openGuests: 5, closedGroups: 3, guests: 7, cash: 21000, card: 8000, tab: 0 };

describe("営業中の LINE 通知", () => {
  it("出来事ごとの行", () => {
    expect(eventLine({ kind: "enter", at: T(20, 15), seat: "カウンター2", guests: 2 }))
      .toBe("20:15 入店　カウンター2　2名");
    expect(eventLine({ kind: "pay", at: T(21, 30), seat: "カウンター2", guests: 2, amount: 10500, method: "card" }))
      .toBe("21:30 会計　カウンター2　2名　¥10,500（カード）");
    expect(eventLine({ kind: "pay", at: T(23, 5), seat: "席なし", guests: 1, amount: 6000, method: "tab", tabName: "田中さん" }))
      .toBe("23:05 会計　席なし　1名　¥6,000（ツケ／田中さん）");
    expect(eventLine({ kind: "void", at: T(22, 0), seat: "テーブル A", name: "ビール×1", reason: "打ち間違い", by: "あい" }))
      .toBe("22:00 取消　テーブル A　ビール×1（打ち間違い）／あい");
    expect(eventLine({ kind: "discount", at: T(22, 40), seat: "カウンター1", amount: 500, by: "店長" }))
      .toBe("22:40 値引き　カウンター1　¥500／店長");
    expect(eventLine({ kind: "extend", at: T(21, 0), seat: "カウンター3", min: 30 }))
      .toBe("21:00 延長　カウンター3　＋30分");
  });

  it("まとめは時刻の順に並び、今の様子が付く", () => {
    const events: PosEvent[] = [
      { kind: "pay", at: T(21, 30), seat: "カウンター1", guests: 2, amount: 10500, method: "cash" },
      { kind: "enter", at: T(21, 10), seat: "カウンター2", guests: 3 },
    ];
    const text = batchText(events, now, "検算");
    expect(text.split("\n")).toEqual([
      "【検算】",
      "21:10 入店　カウンター2　3名",
      "21:30 会計　カウンター1　2名　¥10,500（現金）",
      "",
      "いま 2組 5名",
      "本日 3組 7名 ・ ¥29,000",
      "（現金 ¥21,000 ／ カード ¥8,000）",
    ]);
  });

  it("内訳が 1 つだけなら括弧の行は出さない", () => {
    const t = batchText([{ kind: "enter", at: T(20, 0), seat: "s", guests: 1 }],
      { ...now, card: 0, tab: 0 }, "");
    expect(t).toContain("【営業中】");
    expect(t).not.toContain("（現金");
  });

  it("何も無ければ空文字（送らせない）", () => {
    expect(batchText([], now, "検算")).toBe("");
  });

  it("設定で出来事ごとに出し分ける", () => {
    const r = { ...defaultNotify(), on: true, enter: false };
    expect(wants(r, { kind: "enter", at: T(20, 0), seat: "s", guests: 1 })).toBe(false);
    expect(wants(r, { kind: "pay", at: T(20, 0), seat: "s", guests: 1, amount: 1, method: "cash" })).toBe(true);
    // 通知そのものを切っていれば、何も送らない
    expect(wants({ ...r, on: false }, { kind: "pay", at: T(20, 0), seat: "s", guests: 1, amount: 1, method: "cash" })).toBe(false);
  });

  it("既定は 1 時間まとめ。無料枠に収まる", () => {
    const r = { ...defaultNotify(), on: true };
    expect(r.batchMin).toBe(60);
    expect(monthlyEstimate(r, 10)).toBeLessThanOrEqual(FREE_LIMIT);
  });

  it("ためずに送ると無料枠を大きく超える", () => {
    const now0 = { ...defaultNotify(), on: true, batchMin: 0 };
    expect(monthlyEstimate(now0, 10)).toBe(520);   // 10組 × 2通 × 26日
    expect(monthlyEstimate(now0, 10)).toBeGreaterThan(FREE_LIMIT);
  });

  it("暇な日は区切りの数ではなく組数で頭打ちになる", () => {
    const r = { ...defaultNotify(), on: true, batchMin: 15 };
    // 1 日 1 組なら、24 区切りあっても 2 通しか出来事が無い
    expect(monthlyEstimate(r, 1)).toBe(52);
    expect(monthlyEstimate({ ...r, on: false }, 10)).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { defaultLedger } from "./migrate";
import * as P from "./plans";
import type { Ledger } from "./types";

function led(): Ledger {
  const L = defaultLedger();
  L.shop.openTime = "20:00";
  L.shop.closeTime = "01:00";
  L.casts = [
    { id: "c1", name: "あい", wage: null, active: true },
    { id: "c2", name: "みく", wage: null, active: true },
    { id: "c3", name: "れな", wage: null, active: true },
  ];
  return L;
}

describe("勤務の長さ", () => {
  it("日をまたぐ店なので、退勤が小さければ翌日として数える", () => {
    expect(P.spanMinutes({ in: "20:00", out: "01:00" })).toBe(300);
    expect(P.spanMinutes({ in: "21:30", out: "02:00" })).toBe(270);
  });

  it("またがない時間帯はそのまま引く", () => {
    expect(P.spanMinutes({ in: "10:00", out: "18:00" })).toBe(480);
  });

  it("時刻が無ければ 0", () => {
    expect(P.spanMinutes({ in: "", out: "01:00" })).toBe(0);
  });

  it("見出しは「5時間」「4時間30分」。0 は書かない", () => {
    expect(P.spanLabel(300)).toBe("5時間");
    expect(P.spanLabel(270)).toBe("4時間30分");
    expect(P.spanLabel(45)).toBe("45分");
    expect(P.spanLabel(0)).toBe("");
  });
});

describe("よく使う出退勤", () => {
  it("店の既定が必ず先頭。まだ予定が 1 件も無くても 1 つは出る", () => {
    const out = P.commonShifts(led());
    expect(out[0]).toEqual({ in: "20:00", out: "01:00", used: 0 });
    expect(out).toHaveLength(1);
  });

  it("入れた予定から多い順に拾う（決め打ちの候補は店に当たらないため）", () => {
    const L = led();
    L.plans = {
      "2026-09-01": [{ castId: "c1" }, { castId: "c2", in: "21:00" }],
      "2026-09-02": [{ castId: "c1", in: "21:00" }, { castId: "c2", in: "21:00" }],
      "2026-09-03": [{ castId: "c3", in: "20:00", out: "02:00" }],
    };
    const out = P.commonShifts(L);
    expect(out[0]).toMatchObject({ in: "20:00", out: "01:00" });   // 既定は先頭に固定
    expect(out[1]).toMatchObject({ in: "21:00", out: "01:00", used: 3 });
    expect(out[2]).toMatchObject({ in: "20:00", out: "02:00", used: 1 });
  });

  it("既定と同じ組み合わせを二重に出さない", () => {
    const L = led();
    L.plans = { "2026-09-01": [{ castId: "c1", in: "20:00", out: "01:00" }] };
    const out = P.commonShifts(L);
    expect(out.filter((p) => p.in === "20:00" && p.out === "01:00")).toHaveLength(1);
    expect(out[0].used).toBe(1);
  });

  it("出し過ぎない（押す所が増えると選べなくなる）", () => {
    const L = led();
    L.plans = { "2026-09-01": ["21:00", "22:00", "23:00", "19:00", "18:00"].map((t, i) => ({ castId: "c" + i, in: t })) };
    expect(P.commonShifts(L, 4)).toHaveLength(4);
  });
});

describe("その日に入る子", () => {
  it("実績があれば実績を出す", () => {
    const L = led();
    L.plans = { "2026-09-01": [{ castId: "c1" }] };
    L.days["2026-09-01"] = {
      ...L.days["2026-09-01"],
      shifts: {
        c2: { on: true, in: "20:00", out: "01:00", breakMin: null, backs: {}, deduct: null, paid: null },
        c3: { on: false, in: "", out: "", breakMin: null, backs: {}, deduct: null, paid: null },
      },
    } as never;
    expect(P.whoOn(L, "2026-09-01")).toEqual({ names: ["みく"], total: 1 });
  });

  it("実績がまだ無ければ予定を出す（これから誰が入るのかが知りたい）", () => {
    const L = led();
    L.plans = { "2026-09-20": [{ castId: "c1" }, { castId: "c3" }] };
    expect(P.whoOn(L, "2026-09-20")).toEqual({ names: ["あい", "れな"], total: 2 });
  });

  it("何も無い日は空", () => {
    expect(P.whoOn(led(), "2026-09-20")).toEqual({ names: [], total: 0 });
  });
});

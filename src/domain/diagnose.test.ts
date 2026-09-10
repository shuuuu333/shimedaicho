import { describe, it, expect } from "vitest";
import { migrate } from "./migrate";
import { avgSpend, detectMisses, diagnoseCash } from "./diagnose";
import { lineFromMenu, newCheck } from "./pos";
import type { Check, Ledger, MenuItem } from "./types";

const shop = {
  name: "", cardFeeRate: 0, openingCash: 0, openingDate: "2026-09-01", defaultWage: 2000,
  roundMinutes: 15, fixedLabor: 0, fixedCost: 0, dispatchGuarantee: 10000, openTime: "20:00", closeTime: "01:00",
};
const shift = (over: Record<string, unknown> = {}) =>
  ({ on: true, in: "20:00", out: "00:00", breakMin: null, backs: {}, deduct: null, paid: null, ...over });
const day = (over: Record<string, unknown> = {}) =>
  ({ cashSales: 0, cardSales: 0, guests: null, expenses: [], bankDeposit: null, cardReceived: null,
     cashCounted: null, payout: null, shifts: {}, dispatch: [], settle: [], ...over });

/** あい（時給2000）が 20:00-00:00 で 4時間 → 支給 ¥8,000。現金売上 ¥30,000 の日 */
function base(over: Record<string, unknown> = {}): Ledger {
  return migrate({
    v: 4, shop,
    backItems: [{ id: "d1", name: "ドリンク", type: "count", rate: 500, rateD: 500 }],
    casts: [{ id: "a", name: "あい", wage: 2000, active: true }, { id: "b", name: "みく", wage: 2000, active: true }],
    days: {
      // 客単価を出すための「他の日」。¥30,000 / 3人 = ¥10,000
      "2026-09-02": day({ cashSales: 30000, guests: 3 }),
      "2026-09-01": day({ cashSales: 30000, guests: 3, shifts: { a: shift() }, ...over }),
    },
  });
}
const D = (over: Record<string, unknown> = {}) => diagnoseCash(base(over), "2026-09-01");
const ids = (over: Record<string, unknown> = {}) => D(over)!.hints.map((h) => h.id);

describe("現金が合わないときの原因の候補", () => {
  it("実査現金を入れていなければ、何も言わない", () => {
    expect(D()).toBe(null);
    expect(diagnoseCash(base(), "2026-09-09")).toBe(null);   // 記録の無い日
  });

  it("ぴったり合っていれば候補は出ない", () => {
    const r = D({ cashCounted: 30000 })!;
    expect(r.diff).toBe(0);
    expect(r.hints).toEqual([]);
  });

  it("足りない額が 1 人の支給額と一致したら、その人の日払いを第一候補にする", () => {
    const r = D({ cashCounted: 22000 })!;   // 30,000 − 8,000
    expect(r.diff).toBe(-8000);
    expect(r.hints[0]).toMatchObject({ id: "paidOne", strong: true });
    expect(r.hints[0].text).toContain("あい");
    expect(r.hints[0].text).toContain("¥8,000");
  });

  it("¥1,000 までのずれは「一致」として扱う", () => {
    expect(ids({ cashCounted: 22500 })[0]).toBe("paidOne");   // 差 7,500（8,000 と ¥500 違い）
    expect(ids({ cashCounted: 24000 })[0]).not.toBe("paidOne"); // 差 6,000 は遠い
  });

  it("2人ぶんまとめて渡した額と一致したら、まとめての入れ忘れを疑う", () => {
    // あい ¥8,000 ＋ みく ¥6,000（21:00-00:00 で 3時間）＝ ¥14,000
    const r = D({ cashCounted: 16000, shifts: { a: shift(), b: shift({ in: "21:00" }) } })!;
    expect(r.hints[0]).toMatchObject({ id: "paidAll", strong: true });
    expect(r.hints[0].text).toContain("¥14,000");
  });

  it("金額が一致しないときは、日払いと経費の入れ忘れを順に疑う", () => {
    expect(ids({ cashCounted: 27000 })).toEqual(["paidNone", "expNone", "change"]);
  });

  it("日払いが入っていれば「1 件も入っていません」は言わない", () => {
    const r = D({ cashCounted: 19000, shifts: { a: shift({ paid: 8000 }) } })!;
    expect(r.hints.map((h) => h.id)).not.toContain("paidNone");
  });

  it("カード売上がある日は、打ち間違いも候補に出す", () => {
    expect(ids({ cashCounted: 27000, cardSales: 10000, expenses: [{ id: "e", name: "氷", amount: 500, method: "cash" }] }))
      .toEqual(["paidNone", "cardAsCash", "change"]);
  });

  it("多いときは、客単価の倍数から伝票の打ち忘れを疑う", () => {
    const r = D({ cashCounted: 50000 })!;   // ＋20,000 ＝ 客単価 ¥10,000 の 2人ぶん
    expect(r.diff).toBe(20000);
    expect(r.hints[0]).toMatchObject({ id: "guestsMissing", strong: true });
    expect(r.hints[0].text).toContain("2人ぶん");
    expect(r.hints[0].text).toContain("¥10,000");
  });

  it("多くて客単価と合わないときは、お釣りの渡し忘れを疑う", () => {
    expect(ids({ cashCounted: 33300 })).toEqual(["changeKept"]);
  });

  it("候補は多くても 3 件", () => {
    for (const c of [22000, 27000, 50000, 33300]) expect(D({ cashCounted: c })!.hints.length).toBeLessThanOrEqual(3);
  });

  it("客単価は、その日ぶんを外して同じ月の他の日から出す", () => {
    const L = base();
    expect(avgSpend(L, "2026-09-01")).toBe(10000);   // 09-02 の 30,000/3
    // 他の日が無ければ、その日ぶんで見る
    const only = migrate({ v: 4, shop, backItems: [], casts: [], days: { "2026-09-01": day({ cashSales: 24000, guests: 3 }) } });
    expect(avgSpend(only, "2026-09-01")).toBe(8000);
    // その日に記録が無くても、同じ月の他の日から出す
    expect(avgSpend(only, "2026-09-05")).toBe(8000);
    // 客数の入っている日がどこにも無ければ 0（倍数の当てはめをやめる合図）
    expect(avgSpend(only, "2026-10-01")).toBe(0);
  });
});

/* ---------- 打ち忘れの検知 ---------- */

const T0 = "2026-09-01T20:00:00.000Z";
const at = (min: number) => Date.parse(T0) + min * 60000;
const beer: MenuItem = { id: "m1", name: "ビール", price: 800, category: "ドリンク", kind: "normal", active: true, sort: 0 };

/** 入店 20:00 の伝票。closed にすると会計済み扱い */
function chk(over: Partial<Check> = {}): Check {
  return { ...newCheck("2026-09-01", "s1", 2, 3000, T0, "test"), ...over };
}

describe("打ち忘れの検知", () => {
  const L = base({ cashCounted: 30000 });

  it("何も無ければ何も言わない", () => {
    const c = chk({ status: "closed", lines: [lineFromMenu(beer, T0)] });
    expect(detectMisses(L, "2026-09-01", [c], at(30))).toEqual([]);
  });

  it("終了予定を大きく過ぎて入店中のままなら、会計の打ち忘れを疑う", () => {
    const c = chk();   // セット60分 → 21:00 まで
    // 21:30 の時点ではまだ言わない（営業中に毎回警告すると無視される）
    expect(detectMisses(L, "2026-09-01", [c], at(90))).toEqual([]);
    // 22:30 なら言う
    const m = detectMisses(L, "2026-09-01", [c], at(150));
    expect(m[0]).toMatchObject({ id: "openStale", strong: true });
    expect(m[0].text).toContain("カウンター1");
  });

  it("延長を押していれば、そのぶん猶予が伸びる", () => {
    const c = chk({ extends: [{ min: 60, price: 1500, at: T0 }] });   // 22:00 まで
    expect(detectMisses(L, "2026-09-01", [c], at(150))).toEqual([]);  // 22:30 はまだ
    expect(detectMisses(L, "2026-09-01", [c], at(210))[0]?.id).toBe("openStale");
  });

  it("会計済みで商品が 1 件も無い伝票を拾う", () => {
    const m = detectMisses(L, "2026-09-01", [chk({ status: "closed" })], at(30));
    expect(m[0]).toMatchObject({ id: "noItems" });
    expect(m[0].text).toContain("カウンター1");
  });

  it("取り消した行しか無い伝票も「商品が無い」として拾う", () => {
    const line = { ...lineFromMenu(beer, T0), voided: { at: T0, by: "x", reason: "打ち間違い" } };
    expect(detectMisses(L, "2026-09-01", [chk({ status: "closed", lines: [line] })], at(30))[0]?.id).toBe("noItems");
  });

  it("席が多いときは 3 つまで名前を出して、あとは件数にする", () => {
    const seats = ["s1", "s2", "s3", "s4", "s5"];
    const list = seats.map((seatId) => chk({ id: seatId, seatId, status: "closed" }));
    const m = detectMisses(L, "2026-09-01", list, at(30));
    expect(m[0].text).toContain("ほか2件");
  });

  it("出勤しているのに本数が全部 0 の子を拾う", () => {
    // あいは 2 本入っている。みくは 0 本 → みくだけ言う
    const LL = base({ cashCounted: 30000, shifts: {
      a: { on: true, in: "20:00", out: "00:00", breakMin: null, backs: { d1: 2 }, deduct: null, paid: null },
      b: { on: true, in: "20:00", out: "00:00", breakMin: null, backs: {}, deduct: null, paid: null },
    } });
    const m = detectMisses(LL, "2026-09-01", [], at(30));
    expect(m[0]).toMatchObject({ id: "zeroBacks" });
    expect(m[0].text).toContain("みく");
    expect(m[0].text).not.toContain("あい");
  });

  it("全員 0 本の日は言わない（本数を使っていない店で毎日出てしまう）", () => {
    const LL = base({ cashCounted: 30000, shifts: {
      a: { on: true, in: "20:00", out: "00:00", breakMin: null, backs: {}, deduct: null, paid: null },
      b: { on: true, in: "20:00", out: "00:00", breakMin: null, backs: { d1: 0 }, deduct: null, paid: null },
    } });
    expect(detectMisses(LL, "2026-09-01", [], at(30)).map((x) => x.id)).not.toContain("zeroBacks");
  });

  it("売上があるのに客数が 0 のままなら指摘する", () => {
    const LL = base({ cashCounted: 30000, guests: null });
    expect(detectMisses(LL, "2026-09-01", [], at(30)).map((x) => x.id)).toContain("noGuests");
  });

  it("ほかの営業日の伝票は見ない", () => {
    const c = chk({ date: "2026-09-02" });
    expect(detectMisses(L, "2026-09-01", [c], at(300))).toEqual([]);
  });
});

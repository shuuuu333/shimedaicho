import { describe, it, expect } from "vitest";
import { defaultLedger, emptyDay } from "./migrate";
import { myDayState } from "./plans";
import type { Ledger, Shift } from "./types";

const TODAY = "2026-09-15";

function shop(): Ledger {
  const L = defaultLedger();
  L.casts = [{ id: "a", name: "あい", wage: null, active: true }];
  L.shop.openTime = "20:00";
  L.shop.closeTime = "01:00";
  return L;
}
const shift = (p: Partial<Shift> = {}): Shift =>
  ({ on: true, in: "20:00", out: "01:00", breakMin: null, backs: {}, deduct: null, paid: null, ...p });

describe("キャスト手帳のカレンダー（その日は何の日か）", () => {
  it("何も無い日は、何でもない", () => {
    expect(myDayState(shop(), "a", "2026-09-20", TODAY)).toEqual({ kind: "", from: "", worked: false });
  });

  it("これからの予定は「入ります」。何時からも出す", () => {
    const L = shop();
    L.plans = { "2026-09-20": [{ castId: "a", in: "21:00" }] };
    expect(myDayState(L, "a", "2026-09-20", TODAY)).toEqual({ kind: "next", from: "21:00", worked: false });
  });

  it("予定の時刻が空なら、店の開店時刻を出す", () => {
    const L = shop();
    L.plans = { "2026-09-20": [{ castId: "a" }] };
    expect(myDayState(L, "a", "2026-09-20", TODAY).from).toBe("20:00");
  });

  it("今日は「入ります」（もう過ぎた日にしない）", () => {
    const L = shop();
    L.plans = { [TODAY]: [{ castId: "a" }] };
    expect(myDayState(L, "a", TODAY, TODAY).kind).toBe("next");
  });

  it("過ぎた日に出勤が記録されていれば「入りました」。時刻は実績のほう", () => {
    const L = shop();
    L.days["2026-09-08"] = { ...emptyDay(), shifts: { a: shift({ in: "20:25" }) } };
    L.plans = { "2026-09-08": [{ castId: "a", in: "20:00" }] };
    expect(myDayState(L, "a", "2026-09-08", TODAY)).toEqual({ kind: "done", from: "20:25", worked: true });
  });

  it("過ぎた日に予定だけあって店の記録がまだでも「入りました」にする", () => {
    // 本人から見れば入った日。記録待ちであることは、開いた所に書く
    const L = shop();
    L.plans = { "2026-09-08": [{ castId: "a" }] };
    expect(myDayState(L, "a", "2026-09-08", TODAY)).toEqual({ kind: "done", from: "20:00", worked: false });
  });

  it("予定に無い日でも、出勤が記録されていれば出す（急に入った日）", () => {
    const L = shop();
    L.days["2026-09-09"] = { ...emptyDay(), shifts: { a: shift() } };
    expect(myDayState(L, "a", "2026-09-09", TODAY).kind).toBe("done");
  });

  it("出勤が off の日は、予定が無ければ何でもない", () => {
    const L = shop();
    L.days["2026-09-09"] = { ...emptyDay(), shifts: { a: shift({ on: false }) } };
    expect(myDayState(L, "a", "2026-09-09", TODAY).kind).toBe("");
  });

  it("ほかの子の予定や出勤は、自分の日にしない", () => {
    const L = shop();
    L.casts.push({ id: "k", name: "かな", wage: null, active: true });
    L.plans = { "2026-09-20": [{ castId: "k" }] };
    L.days["2026-09-08"] = { ...emptyDay(), shifts: { k: shift() } };
    expect(myDayState(L, "a", "2026-09-20", TODAY).kind).toBe("");
    expect(myDayState(L, "a", "2026-09-08", TODAY).kind).toBe("");
  });
});

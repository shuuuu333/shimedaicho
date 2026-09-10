import { describe, it, expect } from "vitest";
import { arrivalsByHour, avgPerGroup, busiestHour, openHour } from "./arrivals";
import { defaultPosRule } from "./migrate";
import { newCheck } from "./pos";
import type { Check } from "./types";

const RULE = defaultPosRule();
const shop = { openTime: "20:00" };

/** その日の何時に入店したか（ローカル時刻）で伝票を作る */
function at(hour: number, guests = 2, paid?: number): Check {
  const d = new Date(2026, 8, 6, hour, 30, 0);
  const c = newCheck("2026-09-06", "s1", guests, 3000, d.toISOString(), "test");
  if (paid != null) {
    c.status = "closed";
    c.payments.push({ method: "cash", amount: paid });
  }
  return c;
}

describe("何時にお客様が入っているか", () => {
  it("開店時刻から並べる（0時台が先頭に来ない）", () => {
    const rows = arrivalsByHour([at(20), at(23), at(0), at(1)], RULE, shop);
    expect(rows.map((r) => r.hour)).toEqual([20, 21, 22, 23, 0, 1]);
    expect(rows.map((r) => r.groups)).toEqual([1, 0, 0, 1, 1, 1]);
  });

  it("前後のずっと 0 の時間は落とし、途中の 0 は残す", () => {
    // 21時と23時だけ。22時は「空いている時間」として残す
    const rows = arrivalsByHour([at(21), at(23)], RULE, shop);
    expect(rows.map((r) => r.hour)).toEqual([21, 22, 23]);
    expect(rows.map((r) => r.groups)).toEqual([1, 0, 1]);
  });

  it("組数・人数・売上を数える。会計済みのぶんだけ売上に入れる", () => {
    const rows = arrivalsByHour([at(21, 2, 10000), at(21, 3, 20000), at(21, 4)], RULE, shop);
    const h21 = rows.find((r) => r.hour === 21)!;
    expect(h21.groups).toBe(3);
    expect(h21.guests).toBe(9);
    expect(h21.sales).toBe(30000);           // 入店中の 1 組は入れない
    expect(avgPerGroup(h21)).toBe(10000);
  });

  it("一番混む時間を出す。同数なら早いほう", () => {
    const rows = arrivalsByHour([at(21), at(21), at(23), at(23)], RULE, shop);
    expect(busiestHour(rows)!.hour).toBe(21);
    expect(busiestHour([])).toBe(null);
  });

  it("伝票が無ければ空", () => {
    expect(arrivalsByHour([], RULE, shop)).toEqual([]);
  });

  it("入店時刻が壊れている伝票は数えない", () => {
    const bad = { ...at(21), enteredAt: "なんだこれ" };
    expect(arrivalsByHour([bad], RULE, shop)).toEqual([]);
  });

  it("開店時刻が読めなければ 0 時から並べる", () => {
    expect(openHour({ openTime: "20:00" })).toBe(20);
    expect(openHour({ openTime: "" })).toBe(0);
    expect(openHour({ openTime: "おかしい" })).toBe(0);
    expect(openHour({ openTime: "9:00" })).toBe(9);
  });
});

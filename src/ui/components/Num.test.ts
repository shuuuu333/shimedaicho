import { describe, it, expect } from "vitest";
import { tweenAt } from "./Num";

const MS = 260;

describe("数えながら動く金額", () => {
  it("始まりと終わりはぴったり合う（端数を残さない）", () => {
    expect(tweenAt(0, 50000, 0, MS)).toBe(0);
    expect(tweenAt(0, 50000, MS, MS)).toBe(50000);
    expect(tweenAt(0, 50000, MS * 5, MS)).toBe(50000);
  });

  it("経過が負でも手前へ飛ばない。requestAnimationFrame の時刻は"
    + "直前に取った時刻より前を指すことがある", () => {
    // これを見落として、0 → 50,000 の 2 コマ目に −10,864 と出ていた
    expect(tweenAt(0, 50000, -8, MS)).toBe(0);
    expect(tweenAt(0, 50000, -1000, MS)).toBe(0);
  });

  it("行き先を追い越さない（上げでも下げでも）", () => {
    for (let e = -50; e <= MS + 50; e += 7) {
      const up = tweenAt(0, 50000, e, MS);
      expect(up).toBeGreaterThanOrEqual(0);
      expect(up).toBeLessThanOrEqual(50000);
      const down = tweenAt(50000, 10000, e, MS);
      expect(down).toBeGreaterThanOrEqual(10000);
      expect(down).toBeLessThanOrEqual(50000);
    }
  });

  it("赤字から黒字へ渡るときも、外へはみ出さない", () => {
    for (let e = 0; e <= MS; e += 5) {
      const v = tweenAt(-30000, 20000, e, MS);
      expect(v).toBeGreaterThanOrEqual(-30000);
      expect(v).toBeLessThanOrEqual(20000);
    }
  });

  it("前半で大きく動く（待っている感じを出さない）", () => {
    // 半分の時間で 9 割は進んでいてほしい
    expect(tweenAt(0, 100000, MS / 2, MS)).toBeGreaterThan(90000);
  });

  it("進むだけで、戻らない", () => {
    let prev = -Infinity;
    for (let e = 0; e <= MS; e += 4) {
      const v = tweenAt(0, 50000, e, MS);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("時間が 0 なら、すぐ行き先（0 で割らない）", () => {
    expect(tweenAt(0, 777, 0, 0)).toBe(777);
  });
});

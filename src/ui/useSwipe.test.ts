import { describe, it, expect } from "vitest";
import { shouldCommit, swipeAxis } from "./useSwipe";

describe("横の指か、縦の指か", () => {
  it("少ししか動いていないうちは決めない（決め打ちすると誤爆する）", () => {
    expect(swipeAxis(4, 3)).toBe("");
    expect(swipeAxis(9, 9)).toBe("");
  });

  it("横の方が大きければ横", () => {
    expect(swipeAxis(40, 10)).toBe("x");
    expect(swipeAxis(-40, 10)).toBe("x");
  });

  it("縦の方が大きければ縦。ページのスクロールとして通す", () => {
    expect(swipeAxis(10, 40)).toBe("y");
    expect(swipeAxis(-12, -60)).toBe("y");
  });

  it("斜めでも、縦が勝っていればスクロールを優先する", () => {
    // レジは縦に長い。迷ったらスクロールにしておく方が事故が少ない
    expect(swipeAxis(30, 31)).toBe("y");
  });
});

describe("離したときに送るかどうか", () => {
  it("ゆっくりでも、じゅうぶん動かしていれば送る", () => {
    expect(shouldCommit(80, 1000)).toBe(true);
  });

  it("ゆっくり少しだけなら送らない（ただの揺れで画面を変えない）", () => {
    expect(shouldCommit(40, 600)).toBe(false);
    expect(shouldCommit(-40, 600)).toBe(false);
  });

  it("短くても速く払えば送る（めくる動き）", () => {
    expect(shouldCommit(40, 60)).toBe(true);
  });

  it("左右どちらでも同じ決まり", () => {
    expect(shouldCommit(-80, 1000)).toBe(true);
    expect(shouldCommit(-40, 60)).toBe(true);
  });

  it("動いていなければ送らない", () => {
    expect(shouldCommit(0, 100)).toBe(false);
  });
});

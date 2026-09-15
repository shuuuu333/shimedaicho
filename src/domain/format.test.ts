import { describe, it, expect } from "vitest";
import * as F from "./format";

describe("打ちながら桁区切りを入れるときのカーソル", () => {
  // 「何文字目」で覚えるとカンマの増減でずれる。「何桁目」で覚え直す
  it("左から数えた桁数の、すぐ後ろを指す", () => {
    expect(F.caretAfterDigits("18,800", 2)).toBe(2);    // 18|,800
    expect(F.caretAfterDigits("189,800", 3)).toBe(3);   // 189|,800
    expect(F.caretAfterDigits("1,880", 3)).toBe(4);     // 1,88|0
  });

  it("カンマが 1 つ増えたら、カーソルも 1 つ右へずれる", () => {
    // 999 の末尾に 9 を足すと 9,999。4 桁目の後ろは 5 文字目
    expect(F.caretAfterDigits("999", 3)).toBe(3);
    expect(F.caretAfterDigits("9,999", 4)).toBe(5);
  });

  it("先頭（0 桁）のときは先頭に置く", () => {
    expect(F.caretAfterDigits("18,800", 0)).toBe(0);
  });

  it("桁が足りなければ末尾。消しすぎても外へ出ない", () => {
    expect(F.caretAfterDigits("18", 9)).toBe(2);
    expect(F.caretAfterDigits("", 3)).toBe(0);
  });

  it("数えるのは数字だけ。カンマは桁に入れない", () => {
    expect(F.digitsBefore("18,800", 3)).toBe(2);   // "18," のうち数字は 2 つ
    expect(F.digitsBefore("18,800", 6)).toBe(5);
    expect(F.digitsBefore("18,800", 0)).toBe(0);
  });

  it("行って戻ると同じ所に来る（打つ・消すのどちらでもずれない）", () => {
    // "18,800" の 3 文字目にカーソル → 2 桁目の後ろ → 整形しても 2 文字目
    const caret = 3, before = F.digitsBefore("18,800", caret);
    expect(F.caretAfterDigits("18,800", before)).toBe(2);
  });
});

describe("次までの言い方", () => {
  const T = "2026-09-15";
  it("今日・明日・あさって", () => {
    expect(F.untilLabel("2026-09-15", T)).toBe("今日");
    expect(F.untilLabel("2026-09-16", T)).toBe("明日");
    expect(F.untilLabel("2026-09-17", T)).toBe("あさって");
  });
  it("3 日より先は日数で言う", () => {
    expect(F.untilLabel("2026-09-18", T)).toBe("あと3日");
    expect(F.untilLabel("2026-10-01", T)).toBe("あと16日");
  });
  it("過ぎた日は何も言わない", () => {
    expect(F.untilLabel("2026-09-14", T)).toBe("");
  });
  it("月をまたいでも数えられる", () => {
    expect(F.untilLabel("2026-10-01", "2026-09-30")).toBe("明日");
  });
});

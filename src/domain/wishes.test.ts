import { describe, it, expect } from "vitest";
import { defaultLedger, migrate } from "./migrate";
import {
  applyWishes, diffTotal, isWishDone, markWishDone, pendingCasts, planDiff, setWishTime,
  mergeWishRows, toggleWish, wishCountOn, wishDays, wishOf, wishRows, wishesOn,
} from "./wishes";
import type { Ledger } from "./types";

/** あい・かな・さき の 3 人が居る店 */
function shop(): Ledger {
  const L = defaultLedger();
  L.casts = [
    { id: "a", name: "あい", wage: null, active: true },
    { id: "k", name: "かな", wage: null, active: true },
    { id: "s", name: "さき", wage: null, active: true },
  ];
  return L;
}

describe("シフト希望", () => {
  it("何も出ていない店は、全部が空", () => {
    const L = shop();
    expect(wishesOn(L, "2026-10-01")).toEqual([]);
    expect(wishOf(L, "2026-10-01", "a")).toBeNull();
    expect(wishDays(L, "2026-10", "a")).toEqual([]);
    expect(wishCountOn(L, "2026-10-01")).toBe(0);
    expect(planDiff(L, "2026-10")).toEqual([]);
  });

  it("その月の、その子の希望だけを古い順に返す", () => {
    const L = shop();
    L.wishes = {
      "2026-10-03": [{ castId: "a" }, { castId: "k" }],
      "2026-10-01": [{ castId: "a" }],
      "2026-11-01": [{ castId: "a" }],   // 別の月は混ざらない
    };
    expect(wishDays(L, "2026-10", "a")).toEqual(["2026-10-01", "2026-10-03"]);
    expect(wishDays(L, "2026-10", "k")).toEqual(["2026-10-03"]);
    expect(wishDays(L, "2026-10", "s")).toEqual([]);
    expect(wishCountOn(L, "2026-10-03")).toBe(2);
  });

  it("時刻は持てる。空なら店の時間でいいという意味", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a", in: "21:00", out: "02:00" }, { castId: "k" }] };
    expect(wishOf(L, "2026-10-01", "a")).toEqual({ castId: "a", in: "21:00", out: "02:00" });
    expect(wishOf(L, "2026-10-01", "k")).toEqual({ castId: "k" });
  });

  it("「出し終えた」は月ごと", () => {
    const L = shop();
    L.wishDone = { a: ["2026-10"] };
    expect(isWishDone(L, "a", "2026-10")).toBe(true);
    expect(isWishDone(L, "a", "2026-11")).toBe(false);
    expect(isWishDone(L, "k", "2026-10")).toBe(false);
  });

  it("一覧は、まだ出していない人が上に来る（催促のために開く画面だから）", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "k" }] };
    L.wishDone = { s: ["2026-10"] };
    // あい=まだ / かな=出しかけ / さき=出し終えた
    expect(wishRows(L, "2026-10").map((r) => r.name)).toEqual(["あい", "かな", "さき"]);
    expect(wishRows(L, "2026-10").map((r) => r.days.length)).toEqual([0, 1, 0]);
    expect(wishRows(L, "2026-10").map((r) => r.done)).toEqual([false, false, true]);
  });

  it("辞めた子は一覧に出さない", () => {
    const L = shop();
    L.casts[2].active = false;
    expect(wishRows(L, "2026-10").map((r) => r.name)).toEqual(["あい", "かな"]);
  });

  it("催促する相手は「1 日も出しておらず、出し終えてもいない人」", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "k" }] };
    L.wishDone = { s: ["2026-10"] };   // 1 日も入れないと出し終えた人は、催促しない
    expect(pendingCasts(L, "2026-10").map((c) => c.name)).toEqual(["あい"]);
  });

  it("希望を予定に写す。予定に居ない子だけが足される", () => {
    const L = shop();
    L.wishes = {
      "2026-10-01": [{ castId: "a", in: "21:00" }, { castId: "k" }],
      "2026-10-02": [{ castId: "a" }],
    };
    L.plans = { "2026-10-01": [{ castId: "a" }] };   // あい 1 日はもう入れてある
    const d = planDiff(L, "2026-10");
    expect(d).toEqual([
      { date: "2026-10-01", adds: [{ castId: "k" }] },
      { date: "2026-10-02", adds: [{ castId: "a" }] },
    ]);
    expect(diffTotal(d)).toBe(2);
  });

  it("2 回押しても 2 回目は何も足さない", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a" }, { castId: "k" }] };
    L.plans = { "2026-10-01": [{ castId: "a" }, { castId: "k" }] };
    expect(planDiff(L, "2026-10")).toEqual([]);
    expect(diffTotal(planDiff(L, "2026-10"))).toBe(0);
  });

  it("辞めた子の希望は予定に写さない", () => {
    const L = shop();
    L.casts[0].active = false;
    L.wishes = { "2026-10-01": [{ castId: "a" }, { castId: "k" }] };
    expect(planDiff(L, "2026-10")).toEqual([{ date: "2026-10-01", adds: [{ castId: "k" }] }]);
  });

  it("予定は消さない。希望に無い予定はそのまま残る", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a" }] };
    L.plans = { "2026-10-01": [{ castId: "s" }] };   // 希望を出していない子を店が入れている
    expect(planDiff(L, "2026-10")).toEqual([{ date: "2026-10-01", adds: [{ castId: "a" }] }]);
    expect(L.plans["2026-10-01"]).toEqual([{ castId: "s" }]);
  });

  it("別の月は写さない", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a" }], "2026-11-01": [{ castId: "a" }] };
    expect(planDiff(L, "2026-10").map((d) => d.date)).toEqual(["2026-10-01"]);
  });
});

describe("希望の取り込み（壊れたデータを落とす）", () => {
  it("居ないキャスト・日付でないキーは落ちる。往復しても変わらない", () => {
    const L = migrate({
      ...shop(),
      wishes: {
        "2026-10-01": [{ castId: "a", in: "21:00" }, { castId: "居ない" }, { castId: "a" }],
        "べつの日": [{ castId: "a" }],
      },
    });
    expect(L.wishes).toEqual({ "2026-10-01": [{ castId: "a", in: "21:00" }] });
    expect(migrate(JSON.parse(JSON.stringify(L))).wishes).toEqual(L.wishes);
  });

  it("出し終えた月は、月の形のものだけ残る", () => {
    const L = migrate({
      ...shop(),
      wishDone: { a: ["2026-10", "2026-10", "こわれ"], 居ない: ["2026-10"], k: [] },
    });
    expect(L.wishDone).toEqual({ a: ["2026-10"] });
  });

  it("希望が 1 件も無ければ、欄そのものを持たない", () => {
    const L = migrate({ ...shop(), wishes: {}, wishDone: {} });
    expect(L.wishes).toBeUndefined();
    expect(L.wishDone).toBeUndefined();
  });
});

describe("希望の書き込み", () => {
  it("押すと入り、もう一度押すと消える。空になった欄は残さない", () => {
    const L = shop();
    toggleWish(L, "2026-10-01", "a");
    expect(L.wishes).toEqual({ "2026-10-01": [{ castId: "a" }] });
    toggleWish(L, "2026-10-01", "a");
    expect(L.wishes).toBeUndefined();
  });

  it("時刻を入れて、空にすると店の時間に戻る", () => {
    const L = shop();
    toggleWish(L, "2026-10-01", "a");
    setWishTime(L, "2026-10-01", "a", "in", "21:00");
    expect(wishOf(L, "2026-10-01", "a")).toEqual({ castId: "a", in: "21:00" });
    setWishTime(L, "2026-10-01", "a", "in", "");
    expect(wishOf(L, "2026-10-01", "a")).toEqual({ castId: "a" });
  });

  it("出していない日の時刻は、触っても何も起きない", () => {
    const L = shop();
    setWishTime(L, "2026-10-01", "a", "in", "21:00");
    expect(L.wishes).toBeUndefined();
  });

  it("出し終えたを付けたり外したりできる。同じ月を二重に持たない", () => {
    const L = shop();
    markWishDone(L, "a", "2026-10", true);
    markWishDone(L, "a", "2026-10", true);
    expect(L.wishDone).toEqual({ a: ["2026-10"] });
    markWishDone(L, "a", "2026-11", true);
    expect(L.wishDone).toEqual({ a: ["2026-10", "2026-11"] });
    markWishDone(L, "a", "2026-10", false);
    expect(L.wishDone).toEqual({ a: ["2026-11"] });
    markWishDone(L, "a", "2026-11", false);
    expect(L.wishDone).toBeUndefined();
  });

  it("予定へ写す。時刻も持っていく", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a", in: "21:00", out: "02:00" }, { castId: "k" }] };
    expect(applyWishes(L, "2026-10")).toBe(2);
    expect(L.plans).toEqual({
      "2026-10-01": [{ castId: "a", in: "21:00", out: "02:00" }, { castId: "k" }],
    });
  });

  it("写したあとにもう一度押しても、二重に入らない", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a" }] };
    expect(applyWishes(L, "2026-10")).toBe(1);
    expect(applyWishes(L, "2026-10")).toBe(0);
    expect(L.plans!["2026-10-01"]).toHaveLength(1);
  });

  it("写しても希望は残る（誰が出したかは消さない）", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a" }] };
    applyWishes(L, "2026-10");
    expect(wishDays(L, "2026-10", "a")).toEqual(["2026-10-01"]);
  });

  it("写したあとに店が予定から外しても、また押せば戻せる", () => {
    const L = shop();
    L.wishes = { "2026-10-01": [{ castId: "a" }] };
    applyWishes(L, "2026-10");
    L.plans = {};                       // 店が外した
    expect(applyWishes(L, "2026-10")).toBe(1);
  });
});

describe("サーバーの行との突き合わせ", () => {
  it("サーバーに行のある子は、その子ぶんが丸ごと入れ替わる（消した日が復活しない）", () => {
    const r = mergeWishRows(
      { "2026-10-01": [{ castId: "a" }, { castId: "k" }], "2026-10-02": [{ castId: "a" }] },
      undefined,
      [{ castId: "a", date: "2026-10-05" }],   // あいは 5 日だけに出し直した
      [],
    );
    // あいの 1日・2日 は消え、5日 が入る。かなは店が書いたままで残る
    expect(r.wishes).toEqual({
      "2026-10-01": [{ castId: "k" }],
      "2026-10-05": [{ castId: "a" }],
    });
  });

  it("時刻も持ってくる。空の時刻は持たない", () => {
    const r = mergeWishRows(undefined, undefined,
      [{ castId: "a", date: "2026-10-01", in: "21:00" }, { castId: "k", date: "2026-10-01" }], []);
    expect(r.wishes).toEqual({ "2026-10-01": [{ castId: "a", in: "21:00" }, { castId: "k" }] });
  });

  it("1 日も出さずに「出し終えた」だけ出した子も、本人が触った子として扱う", () => {
    const r = mergeWishRows(
      { "2026-10-01": [{ castId: "a" }] },   // 店が書いた古い希望
      undefined,
      [],
      [{ castId: "a", month: "2026-10" }],   // 本人は「この月は入れない」と出した
    );
    expect(r.wishes).toBeUndefined();
    expect(r.wishDone).toEqual({ a: ["2026-10"] });
  });

  it("サーバーに居ない子の「出し終えた」は、台帳のものが残る", () => {
    const r = mergeWishRows(undefined, { k: ["2026-10"] }, [{ castId: "a", date: "2026-10-01" }], []);
    expect(r.wishDone).toEqual({ k: ["2026-10"] });
  });

  it("何も無ければ欄そのものを持たない", () => {
    expect(mergeWishRows(undefined, undefined, [], [])).toEqual({ wishes: undefined, wishDone: undefined });
  });
});

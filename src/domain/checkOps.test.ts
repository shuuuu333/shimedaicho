import { describe, it, expect } from "vitest";
import { dateOfOp, foldCheck, foldChecks, opFromRow, opToRow, seedOps, sortOps, type CheckOp } from "./checkOps";
import { checkTotals, lineFromMenu } from "./pos";
import type { CheckLine, MenuItem, PosRule } from "./types";

const RULE: PosRule = {
  setMinutes: 60, setPrice: 3000, setPlans: [{ min: 60, price: 3000 }],
  extendMinutes: 30, extendPrice: 1500,
  tableChargeRate: 0, tableChargeOnSet: false,
  taxRate: 10, taxOnSet: false, taxOnExtend: false, taxOnItems: false,
  alertBeforeMin: 10, autoExtend: false, roundTo: 1,
};
const T = (min: number) => new Date(Date.UTC(2026, 8, 6, 20, min, 0)).toISOString();
const menu = (id: string, price: number): MenuItem =>
  ({ id, name: id, price, category: "x", kind: "normal", active: true, sort: 0 });
const line = (id: string, price: number, qty = 1): CheckLine =>
  ({ ...lineFromMenu(menu(id, price), T(0), undefined, qty), id });

const open = (over: Partial<CheckOp> = {}): CheckOp => ({
  id: "o1", checkId: "k1", at: T(0), by: "店長", op: "open",
  date: "2026-09-06", seatId: "s1", guests: 2, plan: { min: 60, price: 3000 },
  ...over,
} as CheckOp);

describe("操作を畳んで伝票を作る", () => {
  it("入店だけで伝票ができる", () => {
    const c = foldCheck([open()])!;
    expect(c).toMatchObject({ id: "k1", date: "2026-09-06", seatId: "s1", guests: 2, setPrice: 3000, setMinutes: 60, status: "open" });
    expect(c.enteredAt).toBe(T(0));
    expect(checkTotals(c, RULE).total).toBe(6000);
  });

  it("紙から写すときは、押した時刻と入店時刻を分けて持てる", () => {
    const c = foldCheck([open({ at: T(300), enteredAt: T(15) } as Partial<CheckOp>)])!;
    expect(c.enteredAt).toBe(T(15));   // 紙に書いてあった時刻
    // 畳む順は at のままなので、あとから押した操作もちゃんと後ろに来る
    const c2 = foldCheck([
      open({ at: T(300), enteredAt: T(15) } as Partial<CheckOp>),
      { id: "a1", checkId: "k1", at: T(301), by: "x", op: "addLine", line: line("beer", 800) } as CheckOp,
    ])!;
    expect(c2.lines.length).toBe(1);
    expect(c2.enteredAt).toBe(T(15));
  });

  it("入店が届いていない操作は、届くまで捨てる", () => {
    const add: CheckOp = { id: "a1", checkId: "k1", at: T(5), by: "あい", op: "addLine", line: line("beer", 800) };
    expect(foldCheck([add])).toBe(null);
    expect(foldCheck([add, open()])!.lines.length).toBe(1);
  });

  it("順番がばらばらに届いても、押した時刻の順に畳む", () => {
    const ops: CheckOp[] = [
      { id: "a2", checkId: "k1", at: T(10), by: "あい", op: "setQty", lineId: "beer", qty: 3 },
      open(),
      { id: "a1", checkId: "k1", at: T(5), by: "あい", op: "addLine", line: line("beer", 800) },
    ];
    const c = foldCheck(ops)!;
    expect(c.lines[0].qty).toBe(3);
    expect(sortOps(ops).map((o) => o.id)).toEqual(["o1", "a1", "a2"]);
  });

  it("同じ操作が二度届いても結果は変わらない（冪等）", () => {
    const add: CheckOp = { id: "a1", checkId: "k1", at: T(5), by: "あい", op: "addLine", line: line("beer", 800) };
    const once = foldCheck([open(), add])!;
    const twice = foldCheck([open(), add, add, open()])!;
    expect(twice).toEqual(once);
    expect(twice.lines.length).toBe(1);
    expect(twice.log.length).toBe(once.log.length);
  });

  it("2 台が同時に注文したら、両方残る（ここが上書きとの違い）", () => {
    const c = foldCheck([
      open(),
      { id: "a1", checkId: "k1", at: T(5), by: "カウンター", op: "addLine", line: line("beer", 800) },
      { id: "a2", checkId: "k1", at: T(5), by: "あいの携帯", op: "addLine", line: line("high", 700) },
    ])!;
    expect(c.lines.map((l) => l.id)).toEqual(["beer", "high"]);
    expect(checkTotals(c, RULE).itemAmount).toBe(1500);
  });

  it("会計は開いているときだけ効く。2 台が同時に押しても二重にならない", () => {
    const pay = (id: string, at: string, amount: number): CheckOp =>
      ({ id, checkId: "k1", at, by: "誰か", op: "pay", method: "cash", amount });
    const c = foldCheck([open(), pay("p2", T(31), 9999), pay("p1", T(30), 6000)])!;
    expect(c.status).toBe("closed");
    expect(c.payments).toEqual([{ method: "cash", amount: 6000 }]);   // 先に押した方
    expect(c.closedAt).toBe(T(30));
  });

  it("会計を戻したあとの会計は効く", () => {
    const c = foldCheck([
      open(),
      { id: "p1", checkId: "k1", at: T(30), by: "x", op: "pay", method: "cash", amount: 6000 },
      { id: "r1", checkId: "k1", at: T(35), by: "x", op: "reopen" },
      { id: "p2", checkId: "k1", at: T(40), by: "x", op: "pay", method: "card", amount: 6300, cardFee: 300 },
    ])!;
    expect(c.payments).toEqual([{ method: "card", amount: 6300 }]);
    expect(c.cardFee).toBe(300);
    expect(c.closedAt).toBe(T(40));
  });

  it("会計を戻すと、支払い方法まわりが全部消える", () => {
    const c = foldCheck([
      open(),
      { id: "p1", checkId: "k1", at: T(30), by: "x", op: "pay", method: "tab", amount: 6000, tabName: "田中さん" },
      { id: "r1", checkId: "k1", at: T(35), by: "x", op: "reopen" },
    ])!;
    expect(c.status).toBe("open");
    expect(c.payments).toEqual([]);
    expect(c.tabName).toBe(undefined);
    expect(c.closedAt).toBe(undefined);
  });

  it("同じ行の数量を 2 台が同時に変えたら、あとに押した方が残る", () => {
    const c = foldCheck([
      open(),
      { id: "a1", checkId: "k1", at: T(5), by: "x", op: "addLine", line: line("beer", 800) },
      { id: "q2", checkId: "k1", at: T(11), by: "みく", op: "setQty", lineId: "beer", qty: 5 },
      { id: "q1", checkId: "k1", at: T(10), by: "あい", op: "setQty", lineId: "beer", qty: 2 },
    ])!;
    expect(c.lines[0].qty).toBe(5);
  });

  it("取消は 1 回だけ。二度取り消しても最初の理由が残る", () => {
    const c = foldCheck([
      open(),
      { id: "a1", checkId: "k1", at: T(5), by: "x", op: "addLine", line: line("beer", 800) },
      { id: "v1", checkId: "k1", at: T(10), by: "あい", op: "void", lineId: "beer", reason: "打ち間違い" },
      { id: "v2", checkId: "k1", at: T(12), by: "みく", op: "void", lineId: "beer", reason: "お客様都合" },
    ])!;
    expect(c.lines[0].voided).toEqual({ at: T(10), by: "あい", reason: "打ち間違い" });
    expect(checkTotals(c, RULE).itemAmount).toBe(0);
  });

  it("延長は押した順に積み上がる", () => {
    const c = foldCheck([
      open(),
      { id: "e2", checkId: "k1", at: T(70), by: "x", op: "extend", min: 60, price: 3000 },
      { id: "e1", checkId: "k1", at: T(60), by: "x", op: "extend", min: 30, price: 1500 },
    ])!;
    expect(c.extends.map((e) => e.min)).toEqual([30, 60]);
    expect(c.extends[0].at).toBe(T(60));
  });

  it("値引きは 0 で取り消しになる", () => {
    const base = [open(), { id: "d1", checkId: "k1", at: T(20), by: "x", op: "discount", name: "値引き", amount: 500 } as CheckOp];
    expect(foldCheck(base)!.discount).toEqual({ name: "値引き", amount: 500 });
    const off = foldCheck([...base, { id: "d2", checkId: "k1", at: T(21), by: "x", op: "discount", name: "値引き", amount: 0 } as CheckOp])!;
    expect(off.discount).toBe(undefined);
  });

  it("あとから追加は、会計済みのときだけ効く", () => {
    const late: CheckOp = { id: "L1", checkId: "k1", at: T(50), by: "x", op: "addLate",
      lines: [line("beer", 800)], collect: true, amount: 6880 };
    // まだ開いているうちは効かない
    expect(foldCheck([open(), late])!.lines.length).toBe(0);
    // 会計済みなら足せて、受け取った額も直る
    const c = foldCheck([
      open(),
      { id: "p1", checkId: "k1", at: T(30), by: "x", op: "pay", method: "cash", amount: 6000 },
      late,
    ])!;
    expect(c.lines.length).toBe(1);
    expect(c.payments).toEqual([{ method: "cash", amount: 6880 }]);
  });

  it("あとから追加で受け取らなかったら、払った額は動かない", () => {
    const c = foldCheck([
      open(),
      { id: "p1", checkId: "k1", at: T(30), by: "x", op: "pay", method: "cash", amount: 6000 },
      { id: "L1", checkId: "k1", at: T(50), by: "x", op: "addLate", lines: [line("beer", 800)], collect: false },
    ])!;
    expect(c.lines.length).toBe(1);
    expect(c.payments).toEqual([{ method: "cash", amount: 6000 }]);
  });

  it("ツケの回収は 1 回だけ記録される", () => {
    const c = foldCheck([
      open(),
      { id: "p1", checkId: "k1", at: T(30), by: "x", op: "pay", method: "tab", amount: 6000, tabName: "田中さん" },
      { id: "t1", checkId: "k1", at: T(100), by: "店長", op: "collectTab", date: "2026-09-08" },
      { id: "t2", checkId: "k1", at: T(110), by: "あい", op: "collectTab", date: "2026-09-09" },
    ])!;
    expect(c.tabPaid).toEqual({ at: T(100), date: "2026-09-08", by: "店長" });
  });

  it("消した伝票は出てこない。戻せば出る", () => {
    const rm: CheckOp = { id: "x1", checkId: "k1", at: T(90), by: "店長", op: "remove" };
    expect(foldCheck([open(), rm])).toBe(null);
    expect(foldCheck([open(), rm, { id: "x2", checkId: "k1", at: T(95), by: "店長", op: "restore" } as CheckOp])).not.toBe(null);
  });

  it("履歴は押した順に積まれ、op が持っている文言をそのまま出す", () => {
    const c = foldCheck([
      open({ log: [{ act: "入店", detail: "2名 ／ 1時間 ¥3,000／人" }] }),
      { id: "a1", checkId: "k1", at: T(5), by: "あい", op: "addLine", line: line("beer", 800),
        log: [{ act: "追加", detail: "ビール" }] } as CheckOp,
      { id: "L1", checkId: "k1", at: T(50), by: "x", op: "addLate", lines: [], collect: false,
        log: [{ act: "あとから追加", detail: "ビール" }, { act: "追加分は受け取っていない", detail: "取り損ね ¥880" }] } as CheckOp,
    ])!;
    expect(c.log.map((g) => g.act)).toEqual(["入店", "追加", "あとから追加", "追加分は受け取っていない"]);
    expect(c.log[0]).toEqual({ at: T(0), by: "店長", act: "入店", detail: "2名 ／ 1時間 ¥3,000／人" });
    expect(c.log[1].by).toBe("あい");
  });

  it("文言が無い op は、種類から見出しを決める", () => {
    const c = foldCheck([open(), { id: "r1", checkId: "k1", at: T(9), by: "x", op: "setGuests", guests: 4 } as CheckOp])!;
    expect(c.guests).toBe(4);
    expect(c.log[1]).toEqual({ at: T(9), by: "x", act: "人数" });
  });

  it("端末の中の伝票は、種にして往復しても何も落ちない", () => {
    // いろいろ起きたあとの伝票を作る
    const before = foldCheck([
      open({ log: [{ act: "入店", detail: "2名 ／ 1時間 ¥3,000／人" }] }),
      { id: "a1", checkId: "k1", at: T(5), by: "あい", op: "addLine", line: line("beer", 800) } as CheckOp,
      { id: "e1", checkId: "k1", at: T(60), by: "x", op: "extend", min: 30, price: 1500 } as CheckOp,
      { id: "d1", checkId: "k1", at: T(70), by: "x", op: "discount", name: "値引き", amount: 500 } as CheckOp,
      { id: "p1", checkId: "k1", at: T(80), by: "x", op: "pay", method: "tab", amount: 9800, tabName: "田中さん" } as CheckOp,
    ])!;

    const seeds = seedOps([before], "移行");
    expect(seeds[0].id).toBe("seed:k1");
    expect(foldCheck(seeds)).toEqual(before);          // 履歴まで含めて同じ
    // 二度流しても増えない（id が同じなので）
    expect(foldCheck([...seeds, ...seeds])).toEqual(before);
  });

  it("種のあとの操作は、ふつうに上に積まれる", () => {
    const base = foldCheck([open()])!;
    const c = foldCheck([
      ...seedOps([base], "移行"),
      { id: "a9", checkId: "k1", at: T(5), by: "あい", op: "addLine", line: line("beer", 800),
        log: [{ act: "追加", detail: "ビール" }] } as CheckOp,
    ])!;
    expect(c.lines.map((l) => l.id)).toEqual(["beer"]);
    expect(c.log.map((g) => g.act)).toEqual(["入店", "追加"]);
  });

  it("行の形にして戻しても、中身が落ちない（送信の往復）", () => {
    const ops: CheckOp[] = [
      open({ log: [{ act: "入店", detail: "2名 ／ 1時間 ¥3,000／人" }] }),
      { id: "a1", checkId: "k1", at: T(5), by: "あい", op: "addLine", line: line("beer", 800),
        log: [{ act: "追加", detail: "ビール" }] } as CheckOp,
      { id: "q1", checkId: "k1", at: T(6), by: "x", op: "setQty", lineId: "beer", qty: 3 } as CheckOp,
      { id: "v1", checkId: "k1", at: T(7), by: "x", op: "void", lineId: "beer", reason: "打ち間違い" } as CheckOp,
      { id: "s1", checkId: "k1", at: T(8), by: "x", op: "setPlan", plan: { min: 40, price: 2000 } } as CheckOp,
      { id: "g1", checkId: "k1", at: T(9), by: "x", op: "setGuests", guests: 3 } as CheckOp,
      { id: "e1", checkId: "k1", at: T(10), by: "x", op: "extend", min: 30, price: 1500 } as CheckOp,
      { id: "d1", checkId: "k1", at: T(11), by: "x", op: "discount", name: "値引き", amount: 500 } as CheckOp,
      { id: "p1", checkId: "k1", at: T(12), by: "x", op: "pay", method: "card", amount: 6300, cardFee: 300 } as CheckOp,
      { id: "r1", checkId: "k1", at: T(13), by: "x", op: "reopen" } as CheckOp,
      { id: "p2", checkId: "k1", at: T(14), by: "x", op: "pay", method: "tab", amount: 6000, tabName: "田中さん" } as CheckOp,
      { id: "L1", checkId: "k1", at: T(15), by: "x", op: "addLate", lines: [line("high", 700)], collect: true, amount: 6700 } as CheckOp,
      { id: "t1", checkId: "k1", at: T(16), by: "x", op: "collectTab", date: "2026-09-08" } as CheckOp,
      { id: "x1", checkId: "k1", at: T(17), by: "x", op: "remove" } as CheckOp,
      { id: "x2", checkId: "k1", at: T(18), by: "x", op: "restore" } as CheckOp,
    ];
    for (const o of ops) expect(opFromRow(opToRow(o))).toEqual(o);
    // 往復させた ops を畳んでも、同じ伝票になる
    expect(foldCheck(ops.map((o) => opFromRow(opToRow(o))))).toEqual(foldCheck(ops));
  });

  it("営業日を列に出すのは入店と引き継ぎだけ（1 日ぶんを引くため）", () => {
    expect(dateOfOp(open())).toBe("2026-09-06");
    expect(dateOfOp({ id: "a", checkId: "k1", at: T(1), by: "x", op: "reopen" } as CheckOp)).toBe("");
    const c = foldCheck([open()])!;
    expect(dateOfOp(seedOps([c], "移行")[0])).toBe("2026-09-06");
  });

  it("種も行の形にして戻せる（伝票まるごとが payload に入る）", () => {
    const c = foldCheck([open(), { id: "a1", checkId: "k1", at: T(5), by: "x", op: "addLine", line: line("beer", 800) } as CheckOp])!;
    const seed = seedOps([c], "移行")[0];
    expect(opFromRow(opToRow(seed))).toEqual(seed);
    expect(foldCheck([opFromRow(opToRow(seed))])).toEqual(c);
  });

  it("たくさんの伝票をまとめて畳む。消えたものは落ちる", () => {
    const ops: CheckOp[] = [
      open(),
      open({ id: "o2", checkId: "k2", at: T(20), seatId: "s2" }),
      open({ id: "o3", checkId: "k3", at: T(10), seatId: "s3" }),
      { id: "x1", checkId: "k3", at: T(90), by: "店長", op: "remove" },
    ];
    const list = foldChecks(ops);
    expect(list.map((c) => c.id)).toEqual(["k1", "k2"]);   // 入店の早い順
  });
});

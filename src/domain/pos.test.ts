import { describe, it, expect } from "vitest";
import { defaultLedger, emptyDay } from "./migrate";
import * as P from "./pos";
import * as CL from "./close";
import * as C from "./calc";
import type { Check, Ledger, MenuItem, PosRule } from "./types";

const RULE: PosRule = {
  setMinutes: 60, setPrice: 1500, setPriceOptions: [2000, 2500, 3000], extendMinutes: 30, extendPrice: 1000,
  tableChargeRate: 0, tableChargeOnSet: false,
  taxRate: 10, taxOnSet: false, taxOnExtend: false, taxOnItems: false,
  alertBeforeMin: 10, autoExtend: false, roundTo: 1,
};
/** 延長を n 回ぶん足した伝票にする */
const ext = (c: Check, min: number, price: number) => { c.extends.push({ min, price, at: T0 }); return c; };
const T0 = "2026-09-06T20:00:00.000Z";
const at = (min: number) => Date.parse(T0) + min * 60000;

const menu = (id: string, price: number, backItemId?: string): MenuItem =>
  ({ id, name: id, price, category: "x", kind: backItemId ? "castLinked" : "normal", backItemId, active: true, sort: 0 });

function check(guests = 2, setPrice = RULE.setPrice): Check {
  return P.newCheck("2026-09-06", "s1", guests, setPrice, T0, "test");
}

describe("伝票の金額", () => {
  it("セットも延長も「1人あたり × 人数」", () => {
    const c = check(3);
    expect(P.checkTotals(c, RULE).setAmount).toBe(4500);
    ext(c, 30, 1000);
    expect(P.checkTotals(c, RULE).setAmount).toBe(4500 + 3000);
    ext(c, 30, 1000);
    expect(P.checkTotals(c, RULE).setAmount).toBe(4500 + 6000);
  });

  it("2名でセット ¥3,000 なら ¥6,000 になる", () => {
    expect(P.checkTotals(check(1, 3000), RULE).setAmount).toBe(3000);
    expect(P.checkTotals(check(2, 3000), RULE).setAmount).toBe(6000);
    expect(P.checkTotals(check(4, 3000), RULE).setAmount).toBe(12000);
    // 料金は伝票ごとに変えられる。同じ 2 名でも別の額になる
    expect(P.checkTotals(check(2, 2500), RULE).setAmount).toBe(5000);
    expect(P.checkTotals(check(2, 2000), RULE).setAmount).toBe(4000);
  });

  it("店の設定を変えても、開いている伝票のセット料金は変わらない", () => {
    const c = check(2, 3000);
    const 値上げ後 = { ...RULE, setPrice: 5000 };
    expect(P.checkTotals(c, 値上げ後).setAmount).toBe(6000);   // 入店時の ¥3,000 のまま
  });

  it("入店で選べる金額は、設定の並びに既定の料金も入れて重複を消す", () => {
    expect(P.setPriceChoices(RULE)).toEqual([1500, 2000, 2500, 3000]);
    expect(P.setPriceChoices({ ...RULE, setPrice: 2500 })).toEqual([2000, 2500, 3000]);
    expect(P.setPriceChoices({ ...RULE, setPriceOptions: [] })).toEqual([1500]);
  });

  it("＋30分 と ＋1時間 を混ぜて押せる", () => {
    const opts = P.extendOptions(RULE);
    expect(opts.map((o) => o.label)).toEqual(["＋30分", "＋1時間"]);
    expect(opts[0]).toMatchObject({ min: 30, price: 1000 });
    expect(opts[1]).toMatchObject({ min: 60, price: 2000 });   // 30分¥1,000 の店なら 1時間は ¥2,000

    const c = check(2);
    ext(c, 30, 1000); ext(c, 60, 2000);
    expect(P.allowedMin(c, RULE)).toBe(60 + 30 + 60);
    expect(P.checkTotals(c, RULE).setAmount).toBe(2 * (1500 + 1000 + 2000));
  });

  it("終了予定の時刻が出る", () => {
    const c = check(2);
    expect(P.clock(P.endsAt(c, RULE))).toBe(P.clock(new Date(Date.parse(T0) + 60 * 60000)));
    ext(c, 60, 2000);
    expect(P.clock(P.endsAt(c, RULE))).toBe(P.clock(new Date(Date.parse(T0) + 120 * 60000)));
  });

  it("税は「セット・延長・商品」ごとに足すかを決められる", () => {
    // セットは税込（¥3,000 のまま）、延長からは税別 という店のルール
    const r = { ...RULE, taxRate: 10, taxOnSet: false, taxOnExtend: true, taxOnItems: true };
    const c = check(2, 3000);
    let t = P.checkTotals(c, r);
    expect(t.baseAmount).toBe(6000);
    expect(t.tax).toBe(0);                    // まだ延長も商品も無い
    expect(t.total).toBe(6000);

    ext(c, 30, 1500);
    t = P.checkTotals(c, r);
    expect(t.baseAmount).toBe(6000);
    expect(t.extendAmount).toBe(3000);
    expect(t.taxBase).toBe(3000);             // 延長だけが税の対象
    expect(t.tax).toBe(300);
    expect(t.total).toBe(6000 + 3000 + 300);

    c.lines.push(P.lineFromMenu(menu("beer", 800), T0, undefined, 1));
    t = P.checkTotals(c, r);
    expect(t.taxBase).toBe(3000 + 800);
    expect(t.tax).toBe(380);

    // 全部税込にすれば税は 0
    expect(P.checkTotals(c, { ...r, taxOnExtend: false, taxOnItems: false }).tax).toBe(0);
    // 全部税別にすれば全体にかかる
    const all = P.checkTotals(c, { ...r, taxOnSet: true });
    expect(all.taxBase).toBe(6000 + 3000 + 800);
  });

  it("テーブルチャージは％。既定では商品にだけかかる", () => {
    const r = { ...RULE, tableChargeRate: 20 };
    const c = check(2);
    c.lines.push(P.lineFromMenu(menu("cd", 2000, "d2"), T0, "cast1"));   // ¥2,000 の商品
    let t = P.checkTotals(c, r);
    expect(t.itemAmount).toBe(2000);
    expect(t.tableCharge).toBe(400);                    // 2,000 → 2,400
    expect(t.total).toBe(3000 + 2000 + 400);            // セット(2名×1,500) ＋ 商品 ＋ TC

    // セットにもかける設定
    t = P.checkTotals(c, { ...r, tableChargeOnSet: true });
    expect(t.tableCharge).toBe(Math.floor((3000 + 2000) * 0.2));
  });

  it("古い形（sets・セット料金なし）の伝票を読んでも壊れない", () => {
    const raw = { ...check(2), sets: 3 } as unknown as Check & { sets: number };
    delete (raw as { extends?: unknown }).extends;
    delete (raw as { setPrice?: unknown }).setPrice;
    const c = P.normalizeCheck(raw, RULE);
    expect(c.extends).toHaveLength(2);
    expect(c.setPrice).toBe(RULE.setPrice);        // 店の設定で埋める
    expect(P.allowedMin(c, RULE)).toBe(60 + 30 + 30);
    expect(P.checkTotals(c, RULE).setAmount).toBe(2 * (1500 + 1000 + 1000));
  });

  it("商品・サービス料・税・値引き・丸め", () => {
    const c = check(2);
    c.lines.push(P.lineFromMenu(menu("beer", 800), T0, undefined, 3));   // 2400
    c.lines.push(P.lineFromMenu(menu("cd", 1500, "d2"), T0, "cast1"));   // 1500
    // 税込み運用: 税は上乗せしない
    let t = P.checkTotals(c, RULE);
    expect(t.itemAmount).toBe(3900);
    expect(t.subtotal).toBe(3000 + 3900);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(6900);

    // テーブルチャージ 10%（セットにもかける）＋ 外税 10%
    const r2 = { ...RULE, tableChargeRate: 10, tableChargeOnSet: true, taxOnSet: true, taxOnExtend: true, taxOnItems: true };
    t = P.checkTotals(c, r2);
    expect(t.tableCharge).toBe(690);
    expect(t.tax).toBe(Math.floor((6900 + 690) * 0.1));  // 759
    expect(t.total).toBe(6900 + 690 + 759);

    // 100円単位に切り捨て
    expect(P.checkTotals(c, { ...r2, roundTo: 100 }).total).toBe(8300);
  });

  it("値引きは請求額を超えない（マイナスの会計を作らない）", () => {
    const c = check(1);
    c.discount = { name: "サービス", amount: 999999 };
    const t = P.checkTotals(c, RULE);
    expect(t.discount).toBe(1500);
    expect(t.total).toBe(0);
  });

  it("取り消した行は金額にも本数にも入らない", () => {
    const c = check(1);
    const l = P.lineFromMenu(menu("beer", 800), T0, undefined, 2);
    c.lines.push(l);
    expect(P.checkTotals(c, RULE).itemAmount).toBe(1600);
    l.voided = { at: T0, by: "me", reason: "打ち間違い" };
    expect(P.checkTotals(c, RULE).itemAmount).toBe(0);
    expect(P.activeLines(c)).toHaveLength(0);
  });

  it("のこり時間と席の色", () => {
    const c = check(2);
    expect(P.allowedMin(c, RULE)).toBe(60);
    expect(P.remainingMin(c, RULE, at(20))).toBe(40);
    expect(P.seatState(c, RULE, at(20))).toBe("ok");
    expect(P.seatState(c, RULE, at(51))).toBe("soon");   // のこり 9分 <= 10
    expect(P.seatState(c, RULE, at(70))).toBe("over");
    ext(c, 30, 1000);
    expect(P.remainingMin(c, RULE, at(70))).toBe(20);
    expect(P.seatState(c, RULE, at(70))).toBe("ok");
  });

  it("お釣りと預り金の候補", () => {
    expect(P.changeDue(10000, 6900)).toBe(3100);
    expect(P.changeDue(5000, 6900)).toBe(0);
    expect(P.cashSuggestions(6900)).toEqual([6900, 7000, 10000]);
  });
});

/* ---------- レジ → 日報 ---------- */

function shopLedger(): Ledger {
  const L = defaultLedger();
  L.casts = [
    { id: "c1", name: "あや", wage: 2000, active: true },
    { id: "c2", name: "みく", wage: null, active: true },
  ];
  return L;
}

/** 会計を済ませた伝票を作る */
function closed(_L: Ledger, guests: number, lines: [string, number, string | undefined, string | undefined, number][], cash: number, card = 0): Check {
  const c = P.newCheck("2026-09-06", "s1", guests, RULE.setPrice, T0, "test");
  for (const [id, price, backItemId, castId, qty] of lines) {
    c.lines.push(P.lineFromMenu(menu(id, price, backItemId), T0, castId, qty));
  }
  c.status = "closed";
  c.closedAt = T0;
  if (cash) c.payments.push({ method: "cash", amount: cash });
  if (card) c.payments.push({ method: "card", amount: card });
  return c;
}

describe("カード手数料をお客様に請求する", () => {
  const onGuest: PosRule = { ...RULE, cardFeeOnGuest: true };

  it("設定が切のうちは、カードでも現金と同じ額", () => {
    const c = check(2, 3000);   // 2名 × ¥3,000 ＝ ¥6,000（税は全部 false）
    expect(P.checkTotals(c, RULE).total).toBe(6000);
    expect(P.cardTotalOf(c, RULE, 5)).toBe(6000);
    expect(P.checkTotals(c, RULE).cardFee).toBe(0);
  });

  it("入にすると、カードのときだけ上乗せされる", () => {
    const c = check(2, 3000);
    expect(P.cardTotalOf(c, onGuest, 5)).toBe(6300);      // ＋5%
    expect(P.checkTotals(c, onGuest).total).toBe(6000);   // 伝票そのものは変わらない
  });

  it("applyCardFee は伝票に書き込み、現金では消す", () => {
    const c = check(2, 3000);
    P.applyCardFee(c, onGuest, 5, "card");
    expect(c.cardFee).toBe(300);
    expect(P.checkTotals(c, onGuest).total).toBe(6300);

    P.applyCardFee(c, onGuest, 5, "cash");
    expect(c.cardFee).toBe(undefined);
    expect(P.checkTotals(c, onGuest).total).toBe(6000);
  });

  it("二度かけても額が膨らまない", () => {
    const c = check(2, 3000);
    P.applyCardFee(c, onGuest, 5, "card");
    P.applyCardFee(c, onGuest, 5, "card");
    expect(c.cardFee).toBe(300);
    expect(P.checkTotals(c, onGuest).total).toBe(6300);
  });

  it("率が 0 のときは付けない", () => {
    const c = check(2, 3000);
    P.applyCardFee(c, onGuest, 0, "card");
    expect(c.cardFee).toBe(undefined);
  });

  it("手数料は丸めたあとの請求額に乗る（お客様に見せる額をきりのいい数から動かさない）", () => {
    const rounded: PosRule = { ...onGuest, roundTo: 100 };
    const c = check(1, 3333);
    // 3,333 → 100円単位で切り捨てて 3,300 → その 5% ＝ 165
    expect(P.checkTotals(c, rounded).total).toBe(3300);
    expect(P.cardTotalOf(c, rounded, 5)).toBe(3465);
  });

  it("値引きしたあとの額に乗る", () => {
    const c = check(2, 3000);
    c.discount = { name: "値引き", amount: 1000 };
    expect(P.checkTotals(c, onGuest).total).toBe(5000);
    expect(P.cardTotalOf(c, onGuest, 5)).toBe(5250);
  });

  it("日報にはお客様が払った額（手数料こみ）がカード売上として入る", () => {
    const L = shopLedger();
    const c = closed(L, 2, [], 0, 0);
    c.cardFee = 300;
    c.payments.push({ method: "card", amount: 3300 });
    expect(CL.applyChecksToDay(emptyDay(), [c], L).cardSales).toBe(3300);
  });
});

describe("ツケ（売掛）", () => {
  const tab = (L: Ledger, guests: number, amount: number, name: string): Check => {
    const c = closed(L, guests, [], 0, 0);
    c.payments.push({ method: "tab", amount });
    c.tabName = name;
    return c;
  };

  it("売上には入るが、現金にもカードにも入らない", () => {
    const L = shopLedger();
    const d = CL.applyChecksToDay(emptyDay(), [tab(L, 2, 8000, "田中さん")], L);
    expect(d.tabSales).toBe(8000);
    expect(d.cashSales).toBe(0);
    expect(d.cardSales).toBe(0);

    L.days["2026-09-06"] = d;
    const t = C.dayTotals(L, "2026-09-06");
    expect(t.sales).toBe(8000);     // 売上には入る
    expect(t.tab).toBe(8000);
    expect(C.dayCashFlow(L, "2026-09-06").net).toBe(0);   // 現金は動かない
  });

  it("回収するとその日の現金として入り、売上には二重に入らない", () => {
    const L = shopLedger();
    L.days["2026-09-06"] = CL.applyChecksToDay(emptyDay(), [tab(L, 2, 8000, "田中さん")], L);
    // 別の日に回収した
    L.days["2026-09-08"] = { ...emptyDay(), tabCollected: 8000 };

    expect(C.dayTotals(L, "2026-09-08").sales).toBe(0);          // 売上は増えない
    expect(C.dayCashFlow(L, "2026-09-08").net).toBe(8000);       // 現金は増える
    expect(C.monthTotals(L, "2026-09").sales).toBe(8000);        // 月の売上は 1 回だけ
  });

  it("未回収のツケが balances に出る", () => {
    const L = shopLedger();
    L.shop.openingDate = "2026-09-01";
    L.days["2026-09-06"] = CL.applyChecksToDay(emptyDay(), [tab(L, 2, 8000, "田中さん")], L);
    expect(C.balances(L).tabOut).toBe(8000);
    expect(C.balances(L).cash).toBe(0);      // まだ手元には無い

    L.days["2026-09-08"] = { ...emptyDay(), tabCollected: 8000 };
    expect(C.balances(L).tabOut).toBe(0);
    expect(C.balances(L).cash).toBe(8000);
  });

  it("現金・カード・ツケが混ざった日も合う", () => {
    const L = shopLedger();
    const d = CL.applyChecksToDay(emptyDay(), [
      closed(L, 2, [], 5000),
      closed(L, 1, [], 0, 3000),
      tab(L, 3, 9000, "佐藤さん"),
    ], L);
    expect([d.cashSales, d.cardSales, d.tabSales]).toEqual([5000, 3000, 9000]);
    L.days["2026-09-06"] = d;
    expect(C.dayTotals(L, "2026-09-06").sales).toBe(17000);
    expect(C.dayTotals(L, "2026-09-06").guests).toBe(6);
  });

  it("ツケが 1 件も無ければ tabSales は付けない（欄を増やさない）", () => {
    const L = shopLedger();
    expect(CL.applyChecksToDay(emptyDay(), [closed(L, 2, [], 5000)], L).tabSales).toBe(null);
  });
});

describe("営業日の判定", () => {
  const shop = { openTime: "20:00", closeTime: "01:00" };
  const at = (s: string) => new Date(s);
  it("閉店が翌1時の店は、明け方の会計を前の日に寄せる", () => {
    expect(P.businessDate(at("2026-09-06T21:30:00"), shop)).toBe("2026-09-06");
    expect(P.businessDate(at("2026-09-07T00:30:00"), shop)).toBe("2026-09-06");
    expect(P.businessDate(at("2026-09-07T03:00:00"), shop)).toBe("2026-09-06");  // 粘ったお客様も前日
    expect(P.businessDate(at("2026-09-07T20:05:00"), shop)).toBe("2026-09-07");
    // 月初もまたげる
    expect(P.businessDate(at("2026-10-01T02:00:00"), shop)).toBe("2026-09-30");
  });

  it("閉店から時間が経った昼・夕方は、これから始まる夜＝その日になる", () => {
    // 閉店 1:00 ＋ 4時間 = 5:00 が区切り
    expect(P.businessDate(at("2026-09-07T04:59:00"), shop)).toBe("2026-09-06");
    expect(P.businessDate(at("2026-09-07T05:00:00"), shop)).toBe("2026-09-07");
    expect(P.businessDate(at("2026-09-07T16:20:00"), shop)).toBe("2026-09-07");  // 開店前の準備中
    expect(P.businessDate(at("2026-09-07T12:00:00"), shop)).toBe("2026-09-07");
  });
  it("日をまたがない店（昼のカフェ）はその日のまま", () => {
    const day = { openTime: "11:00", closeTime: "22:00" };
    expect(P.businessDate(at("2026-09-07T09:00:00"), day)).toBe("2026-09-07");
    expect(P.businessDate(at("2026-09-07T23:00:00"), day)).toBe("2026-09-07");
  });
});

describe("レジを日報に反映する", () => {
  it("売上・客数・キャスト別の本数が入る（count 型は本数、amount 型は対象売上）", () => {
    const L = shopLedger();
    const checks = [
      closed(L, 2, [["cdM", 1500, "d2", "c1", 2], ["beer", 800, undefined, undefined, 1]], 10000),
      closed(L, 3, [["cdS", 1000, "d1", "c2", 1], ["bottle", 30000, "b4", "c1", 1]], 0, 40000),
    ];
    const d = CL.applyChecksToDay(emptyDay(), checks, L);

    expect(d.cashSales).toBe(10000);
    expect(d.cardSales).toBe(40000);
    expect(d.guests).toBe(5);
    // d2 は count 型 → 本数 2 / b4 は amount 型 → 対象売上 30000
    expect(d.shifts.c1.backs).toEqual({ d2: 2, b4: 30000 });
    expect(d.shifts.c2.backs).toEqual({ d1: 1 });
    // レジに出たキャストは出勤扱いになり、時刻は店の初期値が入る
    expect(d.shifts.c1.on).toBe(true);
    expect(d.shifts.c1.in).toBe(L.shop.openTime);
  });

  it("バック項目が見つからなくても、売った子は出勤として数える", () => {
    const L = shopLedger();
    L.backItems = [];   // バック項目を全部消した台帳
    const d = CL.applyChecksToDay(emptyDay(), [
      closed(L, 1, [["cdM", 1500, "d2", "c1", 1]], 5000),
    ], L);
    expect(d.shifts.c1.on).toBe(true);          // 出勤にはなる
    expect(d.shifts.c1.backs).toEqual({});      // 本数は付かない
    expect(d.cashSales).toBe(5000);
  });

  it("会計前（open）の伝票は売上に入らない", () => {
    const L = shopLedger();
    const open = P.newCheck("2026-09-06", "s2", 2, RULE.setPrice, T0, "test");
    open.lines.push(P.lineFromMenu(menu("cd", 1500, "d2"), T0, "c1"));
    const d = CL.applyChecksToDay(emptyDay(), [open], L);
    expect(d.cashSales).toBe(0);
    expect(d.guests).toBe(0);
    expect(d.shifts.c1).toBeUndefined();
  });

  it("手で直した欄はレジが上書きしない", () => {
    const L = shopLedger();
    const checks = [closed(L, 2, [["cdM", 1500, "d2", "c1", 2]], 10000)];
    const d = emptyDay();
    CL.applyChecksToDay(d, checks, L);
    expect(d.cashSales).toBe(10000);

    // 現金だけ手入力に切り替えて直す
    CL.setManual(d, CL.MANUAL_CASH, true);
    d.cashSales = 12000;
    CL.applyChecksToDay(d, checks, L);
    expect(d.cashSales).toBe(12000);   // 守られる
    expect(d.guests).toBe(2);          // ほかはレジのまま

    // キャスト単位でも守れる
    CL.setManual(d, CL.manualShift("c1"), true);
    d.shifts.c1.backs.d2 = 99;
    CL.applyChecksToDay(d, checks, L);
    expect(d.shifts.c1.backs.d2).toBe(99);

    CL.setManual(d, CL.manualShift("c1"), false);
    CL.applyChecksToDay(d, checks, L);
    expect(d.shifts.c1.backs.d2).toBe(2);   // レジに戻る
  });

  it("レジが面倒を見ない項目（手入力のバック）は消さない", () => {
    const L = shopLedger();
    L.menu = [menu("cdM", 1500, "d2")];      // レジが持つのは d2 だけ
    const d = emptyDay();
    d.shifts.c1 = { on: true, in: "20:00", out: "01:00", breakMin: null, backs: { b3: 1 }, deduct: null, paid: null };
    CL.applyChecksToDay(d, [closed(L, 1, [["cdM", 1500, "d2", "c1", 3]], 5000)], L);
    expect(d.shifts.c1.backs).toEqual({ b3: 1, d2: 3 });   // 同伴バック b3 は手入力のまま残る
  });

  it("行を取り消して再反映すると、その本数は未入力に戻る", () => {
    const L = shopLedger();
    const c = closed(L, 1, [["cdM", 1500, "d2", "c1", 2]], 5000);
    const d = emptyDay();
    CL.applyChecksToDay(d, [c], L);
    expect(d.shifts.c1.backs.d2).toBe(2);

    c.lines[0].voided = { at: T0, by: "me", reason: "打ち間違い" };
    CL.applyChecksToDay(d, [c], L);
    expect(d.shifts.c1.backs.d2).toBeUndefined();
  });

  it("レジが反映した日には印が付き、欄ごとに自動か手入力かが分かる", () => {
    const L = shopLedger();
    const checks = [closed(L, 2, [["cdM", 1500, "d2", "c1", 2]], 10000)];
    const d = emptyDay();

    // レジが触るまでは、どの欄も「自動」でも「手入力」でもない
    expect(CL.isAuto(d, CL.MANUAL_CASH)).toBe(false);
    expect(CL.isManual(d, CL.MANUAL_CASH)).toBe(false);

    CL.applyChecksToDay(d, checks, L, "2026-09-06T20:00:00.000Z");
    expect(d.posAt).toBe("2026-09-06T20:00:00.000Z");
    expect(CL.isAuto(d, CL.MANUAL_CASH)).toBe(true);
    expect(CL.isAuto(d, CL.manualShift("c1"))).toBe(true);

    // 手で直すと、その欄だけ手入力になる
    CL.setManual(d, CL.MANUAL_CASH, true);
    expect(CL.isAuto(d, CL.MANUAL_CASH)).toBe(false);
    expect(CL.isManual(d, CL.MANUAL_CASH)).toBe(true);
    expect(CL.isAuto(d, CL.MANUAL_CARD)).toBe(true);   // ほかの欄は自動のまま

    // レジに戻す
    CL.setManual(d, CL.MANUAL_CASH, false);
    expect(CL.isAuto(d, CL.MANUAL_CASH)).toBe(true);
    expect(d.manual).toBeUndefined();
  });

  it("あとから足して受け取らなかったぶんは、売上は増えず本数だけ増える", () => {
    const L = shopLedger();
    // ドリンクM 2本で ¥10,000 受け取って会計済み
    const c = closed(L, 2, [["cdM", 1500, "d2", "c1", 2]], 10000);
    const beforeDay = CL.applyChecksToDay(emptyDay(), [c], L);
    expect(beforeDay.cashSales).toBe(10000);
    expect(beforeDay.shifts.c1.backs).toEqual({ d2: 2 });

    // あとから 1 本足したが、受け取った額は動かさなかった（＝取り損ね）
    const late = { ...c, lines: [...c.lines, P.lineFromMenu(menu("cdM", 1500, "d2"), T0, "c1", 1)] };
    const d = CL.applyChecksToDay(emptyDay(), [late], L);
    expect(d.cashSales).toBe(10000);              // 売上は増えない
    expect(d.shifts.c1.backs).toEqual({ d2: 3 }); // 本数は増える（実際に出しているので）

    // 受け取った額も直したときは、売上も増える
    const collected = { ...late, payments: [{ method: "cash" as const, amount: 11500 }] };
    expect(CL.applyChecksToDay(emptyDay(), [collected], L).cashSales).toBe(11500);
  });

  it("反映したあと、既存の給与計算がそのまま走る", () => {
    const L = shopLedger();
    L.days["2026-09-06"] = CL.applyChecksToDay(emptyDay(), [
      closed(L, 2, [["cdM", 1500, "d2", "c1", 2]], 20000),
    ], L);

    const pay = C.payOf(L, "c1", L.days["2026-09-06"].shifts.c1, "2026-09-06");
    // 20:00→01:00 = 5時間 × 時給2000 ＋ ドリンクM 700 × 2本
    expect(pay.wage).toBe(10000);
    expect(pay.backTotal).toBe(1400);
    expect(pay.gross).toBe(11400);

    const t = C.dayTotals(L, "2026-09-06");
    expect(t.sales).toBe(20000);
    expect(t.guests).toBe(2);
    expect(t.labor).toBe(11400);
  });
});

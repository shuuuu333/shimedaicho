/** お試しデータ。1 か月ぶんの、それらしい店の記録を作る。
 *
 *  入れておかないと、はじめて来た人には「今月」が全部 ¥0 の白い画面に見える。
 *  いちばん見せたい所（グラフ・着地予測・利益の打ち手）が、何も無い状態では
 *  何も出ないため。触ってから決めてもらうには、中身が要る。
 *
 *  作る数字は乱数だが種を固定してあるので、何度入れても同じ月になる。
 *  画面を撮るときに毎回ちがう数字が出ると、撮り直しができない。 */
import type { DayRecord, Ledger, Shift } from "./types";
import { defaultLedger, emptyDay } from "./migrate";
import { shiftDay } from "./format";

/** 種を固定した乱数。同じ種からは必ず同じ並びが出る */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NAMES = ["あや", "みく", "れな", "さき", "ゆい", "かな"];

/** 曜日ごとの入り。金土が跳ねて、月火が沈む。均した月は嘘っぽく見える */
const BY_DOW = [0.85, 0.55, 0.6, 0.7, 0.8, 1.25, 1.45];

export const DEMO_FLAG = "shimedaicho.demo";

/**
 * @param today  基準の日（YYYY-MM-DD）。この日を含む月を埋める
 */
export function demoLedger(today: string): Ledger {
  const L = defaultLedger();
  const r = rng(20260914);
  const month = today.slice(0, 7);
  const dom = Number(today.slice(8, 10));

  L.shop.name = "お試しの店";
  L.shop.defaultWage = 2000;
  L.shop.openingCash = 300000;
  L.shop.openingDate = `${month}-01`;
  // 小さい 1 店舗として無理のない額。ここを大きくすると、月の半ばは
  // 固定費を先に全部かぶるので、実力どおりでも赤字に見えてしまう
  L.shop.fixedLabor = 200000;
  L.shop.fixedCost = 300000;
  L.shop.cardFeeRate = 5;

  L.casts = NAMES.map((name, i) => ({
    id: "dc" + i,
    name,
    wage: [2200, 2000, 1900, 2000, 1800, 1800][i],
    active: true,
  }));

  // 予定は曜日で決まった顔ぶれ。実際の店もだいたいそうなっている
  L.plans = {};
  const shiftOf = (dow: number) =>
    [["dc0", "dc1"], ["dc2"], ["dc0", "dc3"], ["dc1", "dc4"], ["dc0", "dc2", "dc3"],
     ["dc0", "dc1", "dc3", "dc5"], ["dc0", "dc1", "dc2", "dc4", "dc5"]][dow];

  // 今日までを実績、先の日を予定にする
  for (let d = 1; d <= 31; d++) {
    const k = `${month}-${String(d).padStart(2, "0")}`;
    if (k.slice(0, 7) !== month) break;
    const dt = new Date(k + "T00:00:00");
    if (Number.isNaN(dt.getTime()) || dt.getDate() !== d) break;   // 月末を越えた
    const dow = dt.getDay();
    const ids = shiftOf(dow);
    L.plans[k] = ids.map((castId, i) => (i === 1 ? { castId, in: "21:00" } : { castId }));
    if (d > dom) continue;                                          // 先の日は予定だけ

    const mul = BY_DOW[dow] * (0.82 + r() * 0.36);
    const guests = Math.max(2, Math.round(9 * mul));
    const sales = Math.round((guests * (11000 + r() * 5000)) / 100) * 100;
    const cardRate = 0.25 + r() * 0.3;
    const card = Math.round((sales * cardRate) / 100) * 100;

    const shifts: Record<string, Shift> = {};
    for (const id of ids) {
      shifts[id] = {
        on: true,
        in: r() < 0.18 ? "20:25" : "20:00",                         // たまに遅刻
        out: r() < 0.3 ? "02:00" : "01:00",
        breakMin: null,
        backs: {
          d2: Math.round(guests * (0.5 + r() * 0.9)),
          b2: r() < 0.55 ? Math.round(1 + r() * 3) : null,
          b3: r() < 0.2 ? 1 : null,
        },
        deduct: null,
        // 半分くらいは日払い、残りは未払いとして溜まる（実際そうなっている）
        paid: r() < 0.5 ? Math.round((6000 + r() * 8000) / 1000) * 1000 : null,
      };
    }

    const day: DayRecord = {
      ...emptyDay(),
      cashSales: sales - card,
      cardSales: card,
      guests,
      shifts,
      expenses: r() < 0.35
        ? [{ id: "de" + d, name: r() < 0.5 ? "酒の仕入れ" : "おしぼり", amount: Math.round((8000 + r() * 20000) / 100) * 100, method: "cash" }]
        : [],
      // 数えた現金は、たまに少しずれる（合わないときの画面も見てもらう）
      cashCounted: null,
      tabSales: r() < 0.12 ? Math.round((15000 + r() * 20000) / 1000) * 1000 : null,
    };
    L.days[k] = day;
  }

  // 直近の 1 日だけ、現金が合っていない状態にしておく。
  // 「合わないときに何が出るか」がこのアプリの肝なので、そこを見せたい
  const y = shiftDay(today, -1);
  const yd = L.days[y];
  if (yd) {
    const cash = (yd.cashSales ?? 0);
    const paid = Object.values(yd.shifts).reduce((s, sh) => s + (sh.paid ?? 0), 0);
    const exp = yd.expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
    yd.cashCounted = cash - paid - exp - 3000;                      // 3,000 足りない
  }

  return L;
}

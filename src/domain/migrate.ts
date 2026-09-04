/** 旧アーティファクト(v1/v2, 文字列の数値) と 現行(v3) の JSON を Ledger に正規化する。
 *  旧 migrate() の振る舞い（v1 既定バック項目の置換・ドリンク名の改名・rateD 補完）も引き継ぐ。 */
import type { BackItem, Cast, DayRecord, DispatchRow, Expense, Ledger, PayMethod, Settlement, Shift, Shop, WageChange } from "./types";
import { todayISO, uid } from "./format";

export function defaultBacks(): BackItem[] {
  return [
    { id: "d1", name: "ドリンク S", type: "count", rate: 500, rateD: 500 },
    { id: "d2", name: "ドリンク M", type: "count", rate: 700, rateD: 700 },
    { id: "d3", name: "ドリンク L", type: "count", rate: 1000, rateD: 1000 },
    { id: "b2", name: "指名バック", type: "count", rate: 1000, rateD: 1000 },
    { id: "b3", name: "同伴バック", type: "count", rate: 2000, rateD: 2000 },
    { id: "b4", name: "ボトルバック", type: "amount", rate: 20, rateD: 20 },
  ];
}

export function defaultShop(): Shop {
  const t = todayISO();
  return {
    name: "", cardFeeRate: 5, openingCash: 0, openingDate: t.slice(0, 8) + "01",
    defaultWage: 1800, roundMinutes: 15, fixedLabor: 0, fixedCost: 0,
    dispatchGuarantee: 15000, openTime: "20:00", closeTime: "01:00",
  };
}

export function defaultLedger(): Ledger {
  return { v: 3, shop: defaultShop(), backItems: defaultBacks(), casts: [], days: {} };
}

export function emptyDay(): DayRecord {
  return {
    cashSales: null, cardSales: null, guests: null, expenses: [], bankDeposit: null, cardReceived: null,
    cashCounted: null, payout: null, shifts: {}, dispatch: [], settle: [],
  };
}

/** 旧 n() と同じ読み方。"" / null → null（未入力）。数字以外の文字列は 0 として扱う（旧挙動と同じ結果になる） */
export function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v);
  if (s === "") return null;
  const x = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : 0;
}
/** 必須の数値（設定など）。キーが無ければ既定値、空欄なら旧 n() と同じく 0 */
function toNumOr(v: unknown, d: number): number {
  if (v === undefined) return d;
  return toNum(v) ?? 0;
}
const str = (v: unknown, d = ""): string => (v == null ? d : String(v));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function toBacks(v: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!isObj(v)) return out;
  for (const k of Object.keys(v)) out[k] = toNum(v[k]);
  return out;
}

function toShift(v: unknown): Shift | null {
  if (!isObj(v)) return null;
  return {
    on: !!v.on, in: str(v.in), out: str(v.out), breakMin: toNum(v.breakMin),
    backs: toBacks(v.backs), deduct: toNum(v.deduct), paid: toNum(v.paid),
  };
}
function toDispatch(v: unknown): DispatchRow | null {
  if (!isObj(v)) return null;
  return {
    id: str(v.id) || uid(), name: str(v.name), guarantee: toNum(v.guarantee),
    in: str(v.in), out: str(v.out), breakMin: toNum(v.breakMin),
    backs: toBacks(v.backs), deduct: toNum(v.deduct), paid: toNum(v.paid),
  };
}
function toExpense(v: unknown): Expense | null {
  if (!isObj(v)) return null;
  const m = v.method;
  const method: PayMethod = m === "card" || m === "bank" ? m : "cash";
  return { id: str(v.id) || uid(), name: str(v.name), amount: toNum(v.amount), method };
}
function toSettle(v: unknown): Settlement | null {
  if (!isObj(v)) return null;
  return { id: str(v.id) || uid(), who: str(v.who), forMonth: str(v.forMonth), amount: toNum(v.amount) };
}
function toDay(v: unknown): DayRecord {
  const d = emptyDay();
  if (!isObj(v)) return d;
  d.cashSales = toNum(v.cashSales); d.cardSales = toNum(v.cardSales); d.guests = toNum(v.guests);
  d.bankDeposit = toNum(v.bankDeposit); d.cardReceived = toNum(v.cardReceived);
  d.cashCounted = toNum(v.cashCounted); d.payout = toNum(v.payout);
  d.expenses = Array.isArray(v.expenses) ? v.expenses.map(toExpense).filter((x): x is Expense => !!x) : [];
  d.dispatch = Array.isArray(v.dispatch) ? v.dispatch.map(toDispatch).filter((x): x is DispatchRow => !!x) : [];
  d.settle = Array.isArray(v.settle) ? v.settle.map(toSettle).filter((x): x is Settlement => !!x) : [];
  if (isObj(v.shifts)) {
    for (const cid of Object.keys(v.shifts)) {
      const sh = toShift(v.shifts[cid]);
      if (sh) d.shifts[cid] = sh;
    }
  }
  return d;
}
const MONTH_RE = /^\d{4}-\d{2}$/;
function toWages(v: unknown): WageChange[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: WageChange[] = [];
  for (const x of v) {
    if (!isObj(x)) continue;
    const from = str(x.from);
    if (!MONTH_RE.test(from)) continue;
    out.push({ from, wage: toNum(x.wage) });
  }
  if (!out.length) return undefined;
  out.sort((a, b) => a.from.localeCompare(b.from));
  return out;
}
function toCast(v: unknown): Cast | null {
  if (!isObj(v)) return null;
  const c: Cast = { id: str(v.id) || uid(), name: str(v.name), wage: toNum(v.wage), active: v.active !== false };
  const wages = toWages(v.wages);
  if (wages) c.wages = wages;
  return c;
}
function toBackItem(v: unknown): BackItem | null {
  if (!isObj(v)) return null;
  const rate = toNumOr(v.rate, 0);
  return {
    id: str(v.id) || uid(), name: str(v.name), type: v.type === "amount" ? "amount" : "count",
    rate, rateD: v.rateD == null ? rate : (toNum(v.rateD) ?? 0),
  };
}

const RENAME: Record<string, [string, string]> = {
  d1: ["ドリンク（レギュラー）", "ドリンク S"], d2: ["ドリンク（ロング）", "ドリンク M"], d3: ["ドリンク（シャンパン）", "ドリンク L"],
};

/** どの版の JSON でも Ledger にする。壊れていれば既定値。 */
export function migrate(input: unknown): Ledger {
  const d = defaultLedger();
  if (!isObj(input)) return d;
  const o = input;

  const days: Record<string, DayRecord> = {};
  if (isObj(o.days)) for (const k of Object.keys(o.days)) days[k] = toDay(o.days[k]);

  let items: BackItem[] = Array.isArray(o.backItems) && o.backItems.length
    ? o.backItems.map(toBackItem).filter((x): x is BackItem => !!x)
    : d.backItems;
  const wasV1Default = items.length === 4 && items[0]?.id === "b1" && items[0]?.name === "ドリンクバック";
  if (wasV1Default && Object.keys(days).length === 0) items = defaultBacks();
  items = items.map((b) => {
    const r = RENAME[b.id];
    return r && b.name === r[0] ? { ...b, name: r[1] } : b;
  });

  const sh = isObj(o.shop) ? o.shop : {};
  const ds = d.shop;
  const shop: Shop = {
    name: str(sh.name, ds.name),
    cardFeeRate: toNumOr(sh.cardFeeRate, ds.cardFeeRate),
    openingCash: toNumOr(sh.openingCash, ds.openingCash),
    openingDate: str(sh.openingDate, ds.openingDate),
    defaultWage: toNumOr(sh.defaultWage, ds.defaultWage),
    roundMinutes: toNumOr(sh.roundMinutes, ds.roundMinutes),
    fixedLabor: toNumOr(sh.fixedLabor, ds.fixedLabor),
    fixedCost: toNumOr(sh.fixedCost, ds.fixedCost),
    dispatchGuarantee: toNumOr(sh.dispatchGuarantee, ds.dispatchGuarantee),
    openTime: str(sh.openTime, ds.openTime),
    closeTime: str(sh.closeTime, ds.closeTime),
  };

  return {
    v: 3, shop, backItems: items,
    casts: Array.isArray(o.casts) ? o.casts.map(toCast).filter((x): x is Cast => !!x) : [],
    days,
  };
}

/** バックアップ JSON らしいか（読み込み前の軽い検査） */
export function looksLikeLedger(input: unknown): boolean {
  return isObj(input) && (isObj(input.shop) || isObj(input.days) || Array.isArray(input.casts));
}

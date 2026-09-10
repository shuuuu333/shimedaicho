/** 旧アーティファクト(v1/v2, 文字列の数値) と v3 の JSON を 現行(v4) の Ledger に正規化する。
 *  旧 migrate() の振る舞い（v1 既定バック項目の置換・ドリンク名の改名・rateD 補完）も引き継ぐ。
 *  v3 の台帳にはレジのマスタが無いので、既定のメニュー・席・会計ルールを補う（backItems と同じ扱い）。 */
import type { BackItem, Cast, DayRecord, DispatchRow, Expense, Ledger, MenuItem, MenuKind, PayMethod, PlanEntry, PosRule, Seat, Settlement, Shift, Shop, WageChange } from "./types";
import { todayISO, uid } from "./format";

export function defaultBacks(): BackItem[] {
  return [
    { id: "d1", name: "ドリンク S", type: "count", rate: 500, rateD: 500 },
    { id: "d2", name: "ドリンク M", type: "count", rate: 700, rateD: 700 },
    { id: "d3", name: "ドリンク L", type: "count", rate: 1000, rateD: 1000 },
    { id: "b2", name: "指名バック", type: "count", rate: 1000, rateD: 1000 },
    { id: "b5", name: "場内バック", type: "count", rate: 500, rateD: 500 },
    { id: "b3", name: "同伴バック", type: "count", rate: 2000, rateD: 2000 },
    { id: "b6", name: "ショットバック", type: "count", rate: 1000, rateD: 1000 },
    { id: "b4", name: "ボトルバック", type: "amount", rate: 20, rateD: 20 },
  ];
}

/** レジの会計ルールの既定値。ガールズバー想定（設定でいつでも変えられる） */
export function defaultPosRule(): PosRule {
  return {
    setMinutes: 60, setPrice: 3000, setPriceOptions: [2000, 2500, 3000],
    extendMinutes: 30, extendPrice: 1500,
    // テーブルチャージは既定 0%。勝手に上乗せしないで、設定で入れてもらう
    tableChargeRate: 0, tableChargeOnSet: false,
    // 既定は「セットは税込、延長と商品は税別」。ガールズバーでよくある形
    taxRate: 10, taxOnSet: false, taxOnExtend: true, taxOnItems: true,
    alertBeforeMin: 10, autoExtend: false, roundTo: 1,
  };
}

/** 既定の席。カウンター中心のガールズバー想定 */
export function defaultSeats(): Seat[] {
  const out: Seat[] = [];
  for (let i = 1; i <= 6; i++) out.push({ id: "s" + i, name: "カウンター" + i, sort: i });
  out.push({ id: "t1", name: "テーブル A", sort: 7 });
  out.push({ id: "t2", name: "テーブル B", sort: 8 });
  return out;
}

/** 既定の商品。backItemId は defaultBacks() の id に合わせてある。
 *  ここを空にすると初回が真っ白になるので、必ず何か入れておく */
export function defaultMenu(): MenuItem[] {
  const m = (id: string, name: string, price: number, category: string, kind: MenuKind, backItemId?: string): MenuItem =>
    ({ id, name, price, category, kind, backItemId, active: true, sort: 0 });
  // セットと延長はここに入れない（PosRule が持つ）
  const list = [
    m("m-cd1", "キャストドリンク S", 1000, "キャスト", "castLinked", "d1"),
    m("m-cd2", "キャストドリンク M", 1500, "キャスト", "castLinked", "d2"),
    m("m-cd3", "キャストドリンク L", 2000, "キャスト", "castLinked", "d3"),
    m("m-sho", "ショット", 2000, "キャスト", "castLinked", "b6"),
    m("m-nom", "本指名", 2000, "キャスト", "castLinked", "b2"),
    m("m-jou", "場内指名", 1000, "キャスト", "castLinked", "b5"),
    m("m-dou", "同伴", 3000, "キャスト", "castLinked", "b3"),
    m("m-beer", "ビール", 800, "ドリンク", "normal"),
    m("m-high", "ハイボール", 700, "ドリンク", "normal"),
    m("m-cock", "カクテル", 700, "ドリンク", "normal"),
    m("m-soft", "ソフトドリンク", 600, "ドリンク", "normal"),
    m("m-food", "乾き物", 500, "フード", "normal"),
  ];
  return list.map((x, i) => ({ ...x, sort: i }));
}

export function defaultShop(): Shop {
  const t = todayISO();
  return {
    name: "", cardFeeRate: 5, openingCash: 0, openingDate: t.slice(0, 8) + "01",
    defaultWage: 1800, roundMinutes: 15, fixedLabor: 0, fixedCost: 0,
    dispatchGuarantee: 15000, openTime: "20:00", closeTime: "01:00",
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (v: unknown): string | undefined => (typeof v === "string" && TIME_RE.test(v) ? v : undefined);

/** シフト予定。日付とキャストIDの形が正しいものだけ残す。
 *  v3 までの ["c1","c2"] は [{castId:"c1"},{castId:"c2"}] に変換する（無損失） */
function toPlans(v: unknown, castIds: Set<string>): Record<string, PlanEntry[]> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, PlanEntry[]> = {};
  for (const k of Object.keys(v)) {
    if (!DATE_RE.test(k)) continue;
    const list = v[k];
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    const rows: PlanEntry[] = [];
    for (const x of list) {
      const castId = typeof x === "string" ? x : isObj(x) ? str(x.castId) : "";
      if (!castIds.has(castId) || seen.has(castId)) continue;
      seen.add(castId);
      const e: PlanEntry = { castId };
      if (isObj(x)) {
        const i = time(x.in);
        const o = time(x.out);
        if (i) e.in = i;
        if (o) e.out = o;
      }
      rows.push(e);
    }
    if (rows.length) out[k] = rows;
  }
  return Object.keys(out).length ? out : undefined;
}

export function defaultLedger(): Ledger {
  return { v: 4, shop: defaultShop(), backItems: defaultBacks(), casts: [], days: {},
           menu: defaultMenu(), seats: defaultSeats(), posRule: defaultPosRule() };
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
  const slips = toNum(v.slipCount);
  if (slips != null) d.slipCount = slips;
  d.expenses = Array.isArray(v.expenses) ? v.expenses.map(toExpense).filter((x): x is Expense => !!x) : [];
  d.dispatch = Array.isArray(v.dispatch) ? v.dispatch.map(toDispatch).filter((x): x is DispatchRow => !!x) : [];
  d.settle = Array.isArray(v.settle) ? v.settle.map(toSettle).filter((x): x is Settlement => !!x) : [];
  if (isObj(v.shifts)) {
    for (const cid of Object.keys(v.shifts)) {
      const sh = toShift(v.shifts[cid]);
      if (sh) d.shifts[cid] = sh;
    }
  }
  const posAt = str(v.posAt);
  if (posAt) d.posAt = posAt;
  const sentAt = str(v.lineSentAt);
  if (sentAt) d.lineSentAt = sentAt;
  if (Array.isArray(v.manual)) {
    const m = [...new Set(v.manual.filter((x): x is string => typeof x === "string"))];
    if (m.length) d.manual = m;
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
  const email = str(v.email).trim().toLowerCase();
  if (email.includes("@")) c.email = email;
  // この子だけのバック単価。数として読めるものだけ残す
  if (isObj(v.backRates)) {
    const r: Record<string, number> = {};
    for (const k of Object.keys(v.backRates)) {
      const n = toNum(v.backRates[k]);
      if (n != null) r[k] = n;
    }
    if (Object.keys(r).length) c.backRates = r;
  }
  return c;
}
function toBackItem(v: unknown): BackItem | null {
  if (!isObj(v)) return null;
  const rate = toNumOr(v.rate, 0);
  const type = v.type === "amount" ? "amount" : "count";
  const item: BackItem = {
    id: str(v.id) || uid(), name: str(v.name), type,
    rate, rateD: v.rateD == null ? rate : (toNum(v.rateD) ?? 0),
  };
  // 下限・上限は売上％型のときだけ意味がある
  if (type === "amount") {
    const lo = toNum(v.min), hi = toNum(v.max);
    if (lo != null) item.min = lo;
    if (hi != null) item.max = hi;
  }
  return item;
}

const MENU_KINDS = new Set<MenuKind>(["normal", "castLinked"]);
function toMenuItem(v: unknown): MenuItem | null {
  if (!isObj(v)) return null;
  // 初期の版はセット・延長を商品としても持っていた。今は PosRule が持つので、
  // 残っていると会計で二重に取ってしまう。読み込みの時点で落とす。
  // kind は先に normal へ正規化されて保存されている場合があるので、当時の固定 id でも見る
  // （id は uid() の 7 文字なので、ここに書いた名前と衝突しない）
  if (v.kind === "set" || v.kind === "extend") return null;
  if (v.id === "m-set" || v.id === "m-ext") return null;
  const kind = MENU_KINDS.has(v.kind as MenuKind) ? (v.kind as MenuKind) : "normal";
  const item: MenuItem = {
    id: str(v.id) || uid(), name: str(v.name), price: toNumOr(v.price, 0),
    category: str(v.category, "その他"), kind,
    active: v.active !== false, sort: toNumOr(v.sort, 0),
  };
  const b = str(v.backItemId);
  if (b) item.backItemId = b;
  // キャストに紐づく商品は「誰の分か」が決まらないので、自動で入れる対象にしない
  if (v.autoOnEntry === true && kind === "normal") item.autoOnEntry = true;
  return item;
}
function toSeat(v: unknown): Seat | null {
  if (!isObj(v)) return null;
  return { id: str(v.id) || uid(), name: str(v.name), sort: toNumOr(v.sort, 0) };
}
function toPosRule(v: unknown): PosRule {
  const d = defaultPosRule();
  if (!isObj(v)) return d;
  return {
    setMinutes: toNumOr(v.setMinutes, d.setMinutes),
    setPrice: toNumOr(v.setPrice, d.setPrice),
    setPriceOptions: Array.isArray(v.setPriceOptions)
      ? [...new Set(v.setPriceOptions.map((x) => toNum(x) ?? 0).filter((x) => x > 0))].sort((a, b) => a - b)
      : d.setPriceOptions,
    extendMinutes: toNumOr(v.extendMinutes, d.extendMinutes),
    extendPrice: toNumOr(v.extendPrice, d.extendPrice),
    // 初期の版は「サービス料」という名前だった。同じ％なのでそのまま引き継ぐ
    tableChargeRate: toNumOr(v.tableChargeRate ?? v.serviceRate, d.tableChargeRate),
    tableChargeOnSet: v.tableChargeOnSet === undefined ? d.tableChargeOnSet : !!v.tableChargeOnSet,
    taxRate: toNumOr(v.taxRate, d.taxRate),
    // 初期の版は「全部税込 / 全部税別」の 1 つのスイッチだった。そのまま引き継ぐ
    taxOnSet: v.taxOnSet === undefined
      ? (v.taxIncluded === undefined ? d.taxOnSet : !v.taxIncluded) : !!v.taxOnSet,
    taxOnExtend: v.taxOnExtend === undefined
      ? (v.taxIncluded === undefined ? d.taxOnExtend : !v.taxIncluded) : !!v.taxOnExtend,
    taxOnItems: v.taxOnItems === undefined
      ? (v.taxIncluded === undefined ? d.taxOnItems : !v.taxIncluded) : !!v.taxOnItems,
    alertBeforeMin: toNumOr(v.alertBeforeMin, d.alertBeforeMin),
    autoExtend: v.autoExtend === undefined ? d.autoExtend : !!v.autoExtend,
    roundTo: Math.max(1, toNumOr(v.roundTo, d.roundTo)),
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
  if (sh.lineAuto !== undefined) shop.lineAuto = !!sh.lineAuto;

  const casts = Array.isArray(o.casts) ? o.casts.map(toCast).filter((x): x is Cast => !!x) : [];

  // レジのマスタ。無ければ既定を入れる（backItems と同じ扱い。初回を真っ白にしない）
  const hasMenu = Array.isArray(o.menu) && o.menu.length;
  const menu = hasMenu
    ? (o.menu as unknown[]).map(toMenuItem).filter((x): x is MenuItem => !!x)
    : defaultMenu();
  if (!hasMenu) {
    // 既定メニューは既定のバック項目（d1..b6）を指している。自前のバック項目しか持っていない
    // 台帳では、その id は存在しない。ここで勝手にバック項目を足すと、相手が作った
    // バックの一覧を書き換えてしまう（日報の入力欄もその場で増える）ので、足さない。
    // 代わりに、無い参照を外す。商品はキャスト紐付けのまま残るので、
    // 売れば「誰の分か」は聞かれ、出勤には反映される。バックは設定でつなぐ
    const have = new Set(items.map((b) => b.id));
    for (const m of menu) if (m.backItemId && !have.has(m.backItemId)) delete m.backItemId;
  }
  const seats = Array.isArray(o.seats) && o.seats.length
    ? o.seats.map(toSeat).filter((x): x is Seat => !!x)
    : defaultSeats();

  const out: Ledger = { v: 4, shop, backItems: items, casts, days, menu, seats, posRule: toPosRule(o.posRule) };
  const plans = toPlans(o.plans, new Set(casts.map((c) => c.id)));
  if (plans) out.plans = plans;
  return out;
}

/** バックアップ JSON らしいか（読み込み前の軽い検査） */
export function looksLikeLedger(input: unknown): boolean {
  return isObj(input) && (isObj(input.shop) || isObj(input.days) || Array.isArray(input.casts));
}

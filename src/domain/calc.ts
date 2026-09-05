/** 計算ロジック。旧アーティファクト §3 を型付きで移植。演算順序は同じに保つ（test/legacy-calc.js と同値）。 */
import type {
  BackAmounts, BackItem, Balances, Cast, CastMonthRow, DayRecord, DayTotals, DispatchMonthRow,
  DispatchRow, Ledger, MonthTotals, Owed, Pay, RankMetric, RankRow, Settlement, Shift, Shop, WageChange,
} from "./types";

export const num = (v: number | null | undefined): number => (v == null || !Number.isFinite(v) ? 0 : v);
export const pct = (a: number, b: number): number => (b > 0 ? (a / b) * 100 : 0);

export function minutesOf(t: string | undefined | null): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function shiftMinutes(sh: { in: string; out: string; breakMin: number | null }, shop: Shop): number {
  const a = minutesOf(sh.in), b = minutesOf(sh.out);
  if (a == null || b == null) return 0;
  let d = b - a;
  if (d < 0) d += 1440;
  d -= num(sh.breakMin);
  if (d < 0) d = 0;
  const r = Math.max(1, num(shop.roundMinutes) || 1);
  return Math.floor(d / r) * r;
}

/** その月に適用される時給。monthOrDate を省くと最初の時給を使う */
export function castWageAt(c: Cast | null, shop: Shop, monthOrDate?: string): number {
  if (!c) return num(shop.defaultWage);
  if (monthOrDate && c.wages && c.wages.length) {
    const m = monthOrDate.slice(0, 7);
    let best: WageChange | null = null;
    for (const w of c.wages) {
      if (w.from <= m && (best == null || w.from > best.from)) best = w;
    }
    if (best) return best.wage != null ? num(best.wage) : num(shop.defaultWage);
  }
  return c.wage != null ? num(c.wage) : num(shop.defaultWage);
}
export function castWage(c: Cast | null, shop: Shop): number {
  return castWageAt(c, shop);
}
/** 時給の変更を、古い順に並べて返す（最初の時給を先頭に足す） */
export function wageTimeline(c: Cast, shop: Shop): { from: string | null; wage: number; label: string }[] {
  const base = { from: null as string | null, wage: c.wage != null ? num(c.wage) : num(shop.defaultWage), label: "最初から" };
  const rest = [...(c.wages ?? [])]
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((w) => ({ from: w.from, wage: w.wage != null ? num(w.wage) : num(shop.defaultWage), label: `${Number(w.from.slice(5, 7))}月から` }));
  return [base, ...rest];
}
export function castById(L: Ledger, id: string): Cast | null {
  return L.casts.find((c) => c.id === id) ?? null;
}

export function backRate(b: BackItem, isDispatch: boolean): number {
  return isDispatch ? num(b.rateD == null ? b.rate : b.rateD) : num(b.rate);
}

export function calcBacks(items: BackItem[], src: Record<string, number | null> | undefined, isDispatch: boolean): { backs: BackAmounts; total: number } {
  const backs: BackAmounts = {};
  let total = 0;
  for (const b of items) {
    const q = num((src ?? {})[b.id]);
    const r = backRate(b, isDispatch);
    const amt = b.type === "amount" ? Math.floor((q * r) / 100) : Math.floor(q * r);
    backs[b.id] = { qty: q, amount: amt };
    total += amt;
  }
  return { backs, total };
}

/** 在籍キャスト 1人1日の給料内訳。dateKey を渡すと、その月の時給で計算する */
export function payOf(L: Ledger, castId: string, sh: Shift, dateKey?: string): Pay {
  const c = castById(L, castId);
  const mins = shiftMinutes(sh, L.shop);
  const wage = Math.floor((mins / 60) * castWageAt(c, L.shop, dateKey));
  const { backs, total } = calcBacks(L.backItems, sh.backs, false);
  const deduct = num(sh.deduct);
  const gross = wage + total - deduct;
  const paid = num(sh.paid);
  return { mins, hours: mins / 60, wage, guarantee: 0, backs, backTotal: total, deduct, gross, paid, unpaid: gross - paid };
}

/** 派遣 1人1日：日給（保証額）＋ 派遣単価のバック */
export function dispatchPay(L: Ledger, row: DispatchRow): Pay {
  const mins = shiftMinutes(row, L.shop);
  const guarantee = row.guarantee == null ? num(L.shop.dispatchGuarantee) : num(row.guarantee);
  const { backs, total } = calcBacks(L.backItems, row.backs, true);
  const deduct = num(row.deduct);
  const gross = guarantee + total - deduct;
  const paid = num(row.paid);
  return { mins, hours: mins / 60, wage: 0, guarantee, backs, backTotal: total, deduct, gross, paid, unpaid: gross - paid };
}

export function dayKeys(L: Ledger): string[] {
  return Object.keys(L.days).sort();
}
export function monthKeys(L: Ledger, m: string): string[] {
  return dayKeys(L).filter((d) => d.startsWith(m));
}

export function emptyDayTotals(date: string): DayTotals {
  return {
    date, cash: 0, card: 0, sales: 0, guests: 0, expCash: 0, expCard: 0, expBank: 0, exp: 0,
    bankDeposit: 0, cardReceived: 0, cashCounted: null, labor: 0, laborR: 0, laborD: 0,
    paidCash: 0, paidDetail: 0, paidLump: 0, paidCount: 0, settled: 0, unpaid: 0,
    workers: 0, workersR: 0, workersD: 0, hours: 0, fee: 0, profit: 0,
  };
}

/** 1日の集計 */
export function dayTotals(L: Ledger, dateKey: string): DayTotals {
  const d: DayRecord | undefined = L.days[dateKey];
  const z = emptyDayTotals(dateKey);
  if (!d) return z;
  z.cash = num(d.cashSales); z.card = num(d.cardSales); z.sales = z.cash + z.card; z.guests = num(d.guests);
  for (const e of d.expenses ?? []) {
    const a = num(e.amount);
    z.exp += a;
    if (e.method === "card") z.expCard += a;
    else if (e.method === "bank") z.expBank += a;
    else z.expCash += a;
  }
  z.bankDeposit = num(d.bankDeposit); z.cardReceived = num(d.cardReceived);
  z.cashCounted = d.cashCounted == null || !Number.isFinite(d.cashCounted) ? null : d.cashCounted;
  for (const cid of Object.keys(d.shifts ?? {})) {
    const sh = d.shifts[cid];
    if (!sh || !sh.on) continue;
    const p = payOf(L, cid, sh, dateKey);
    z.laborR += p.gross; z.paidDetail += p.paid; if (p.paid > 0) z.paidCount++; z.unpaid += p.unpaid; z.workersR++; z.hours += p.hours;
  }
  for (const row of d.dispatch ?? []) {
    const p = dispatchPay(L, row);
    z.laborD += p.gross; z.paidDetail += p.paid; if (p.paid > 0) z.paidCount++; z.unpaid += p.unpaid; z.workersD++; z.hours += p.hours;
  }
  z.paidLump = num(d.payout);
  for (const x of d.settle ?? []) z.settled += num(x.amount);
  z.paidCash = z.paidDetail + z.paidLump + z.settled;
  z.labor = z.laborR + z.laborD + z.paidLump;
  z.workers = z.workersR + z.workersD;
  z.fee = (z.card * num(L.shop.cardFeeRate)) / 100;
  z.profit = z.sales - z.labor - z.exp - z.fee;
  return z;
}

const MONTH_SUM_FIELDS = ["cash", "card", "sales", "guests", "exp", "expCash", "labor", "laborR", "laborD", "paidCash", "paidDetail", "paidLump", "settled", "unpaid", "fee", "bankDeposit", "cardReceived", "hours"] as const;

/** 月の集計 */
export function monthTotals(L: Ledger, m: string): MonthTotals {
  const keys = monthKeys(L, m);
  const acc: MonthTotals = {
    days: keys.length, cash: 0, card: 0, sales: 0, guests: 0, exp: 0, expCash: 0, labor: 0, laborR: 0, laborD: 0,
    paidCash: 0, paidDetail: 0, paidLump: 0, settled: 0, unpaid: 0, fee: 0, bankDeposit: 0, cardReceived: 0, hours: 0, workers: 0,
    series: [], settledFor: 0, fixedLabor: 0, fixedCost: 0, laborAll: 0, costAll: 0, profit: 0, avgSpend: 0,
  };
  for (const k of keys) {
    const t = dayTotals(L, k);
    for (const f of MONTH_SUM_FIELDS) acc[f] += t[f];
    acc.workers += t.workers;
    acc.series.push(t);
  }
  acc.settledFor = settlementsFor(L, m);
  acc.unpaid -= acc.settledFor;
  acc.fixedLabor = num(L.shop.fixedLabor);
  acc.fixedCost = num(L.shop.fixedCost);
  acc.laborAll = acc.labor + acc.fixedLabor;
  acc.costAll = acc.exp + acc.fixedCost + acc.fee;
  acc.profit = acc.sales - acc.laborAll - acc.costAll;
  acc.avgSpend = acc.guests > 0 ? acc.sales / acc.guests : 0;
  return acc;
}

/** 精算（未払い給料の支払い）の合計。who を省略すると全員 */
export function settlementsFor(L: Ledger, m: string, who?: string): number {
  let s = 0;
  for (const k of dayKeys(L)) {
    for (const x of L.days[k].settle ?? []) {
      if (x.forMonth === m && (!who || x.who === who)) s += num(x.amount);
    }
  }
  return s;
}
export function settleRowsFor(L: Ledger, m: string, who: string): (Settlement & { date: string })[] {
  const out: (Settlement & { date: string })[] = [];
  for (const k of dayKeys(L)) {
    for (const x of L.days[k].settle ?? []) {
      if (x.forMonth === m && x.who === who) out.push({ date: k, ...x });
    }
  }
  return out;
}

export function whoLabel(L: Ledger, who: string | null | undefined): string {
  if (!who) return "";
  if (who.slice(0, 2) === "c:") {
    const c = castById(L, who.slice(2));
    return c ? c.name || "（名前なし）" : "（削除済み）";
  }
  return who.slice(2) + "（派遣）";
}

export function dispatchNames(L: Ledger): string[] {
  const set = new Set<string>();
  for (const k of dayKeys(L)) {
    for (const r of L.days[k].dispatch ?? []) {
      const nm = (r.name ?? "").trim();
      if (nm) set.add(nm);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ja"));
}

export function unpaidFor(L: Ledger, who: string, m: string): number {
  if (!who || !m) return 0;
  if (who.slice(0, 2) === "c:") {
    const r = castMonth(L, m).find((r) => r.cast.id === who.slice(2));
    return r ? r.unpaid : 0;
  }
  const r = dispatchMonth(L, m).find((r) => r.name === who.slice(2));
  return r ? r.unpaid : 0;
}

/** その月ぶんの未払いが残っている人 */
export function owedList(L: Ledger, m: string): Owed[] {
  const list: Owed[] = [
    ...castMonth(L, m).map((r) => ({ who: "c:" + r.cast.id, name: r.cast.name || "（名前なし）", unpaid: r.unpaid })),
    ...dispatchMonth(L, m).map((r) => ({ who: "d:" + r.name, name: r.name + "（派遣）", unpaid: r.unpaid })),
  ];
  return list.filter((x) => x.unpaid > 0);
}

/** 全期間の現金・カード残 */
export function balances(L: Ledger): Balances {
  const start = L.shop.openingDate || "0000-00-00";
  let cash = num(L.shop.openingCash), cardOut = 0;
  let lastCount: number | null = null, lastCountDate: string | null = null;
  for (const k of dayKeys(L).filter((k) => k >= start)) {
    const t = dayTotals(L, k);
    cash += t.cash - t.expCash - t.paidCash - t.bankDeposit;
    cardOut += t.card - (t.card * num(L.shop.cardFeeRate)) / 100 - t.cardReceived;
    if (t.cashCounted != null) { lastCount = t.cashCounted; lastCountDate = k; }
  }
  return { cash, cardOut, lastCount, lastCountDate };
}

/** 現金の動き。レジ金を毎日入れ替える店では、その日だけで見る。 */
export interface CashFlow { cash: number; expCash: number; paidCash: number; bankDeposit: number; net: number }
export function cashFlow(L: Ledger, keys: string[]): CashFlow {
  const f: CashFlow = { cash: 0, expCash: 0, paidCash: 0, bankDeposit: 0, net: 0 };
  for (const k of keys) {
    const t = dayTotals(L, k);
    f.cash += t.cash; f.expCash += t.expCash; f.paidCash += t.paidCash; f.bankDeposit += t.bankDeposit;
  }
  f.net = f.cash - f.expCash - f.paidCash - f.bankDeposit;
  return f;
}
/** その日 1 日ぶんの現金の動き */
export function dayCashFlow(L: Ledger, dk: string): CashFlow {
  return cashFlow(L, L.days[dk] ? [dk] : []);
}
/** その月ぶんの現金の動き */
export function monthCashFlow(L: Ledger, m: string): CashFlow {
  return cashFlow(L, monthKeys(L, m));
}

/** その日の終わりの現金残（起点日からの累計） */
export function cashAsOf(L: Ledger, dk: string): number {
  const start = L.shop.openingDate || "0000-00-00";
  let cash = num(L.shop.openingCash);
  for (const k of dayKeys(L).filter((k) => k >= start && k <= dk)) {
    const t = dayTotals(L, k);
    cash += t.cash - t.expCash - t.paidCash - t.bankDeposit;
  }
  return cash;
}

function emptyDispatchRow(name: string): DispatchMonthRow {
  return { name, days: 0, hours: 0, guarantee: 0, backTotal: 0, backs: {}, deduct: 0, gross: 0, paid: 0, settled: 0, unpaid: 0 };
}

/** 派遣 月集計（名前ごと） */
export function dispatchMonth(L: Ledger, m: string): DispatchMonthRow[] {
  const map: Record<string, DispatchMonthRow> = {};
  for (const k of monthKeys(L, m)) {
    for (const row of L.days[k].dispatch ?? []) {
      const name = (row.name ?? "").trim() || "（名前なし）";
      if (!map[name]) map[name] = emptyDispatchRow(name);
      const p = dispatchPay(L, row), r = map[name];
      r.days++; r.hours += p.hours; r.guarantee += p.guarantee; r.backTotal += p.backTotal;
      r.deduct += p.deduct; r.gross += p.gross; r.paid += p.paid; r.unpaid += p.unpaid;
      for (const b of L.backItems) r.backs[b.id] = (r.backs[b.id] ?? 0) + p.backs[b.id].amount;
    }
  }
  for (const k of dayKeys(L)) {
    for (const x of L.days[k].settle ?? []) {
      if (x.forMonth !== m || !x.who || x.who.slice(0, 2) !== "d:") continue;
      const name = x.who.slice(2);
      if (!map[name]) map[name] = emptyDispatchRow(name);
      map[name].settled += num(x.amount);
      map[name].unpaid -= num(x.amount);
    }
  }
  return Object.values(map).sort((a, b) => b.gross - a.gross);
}

/** キャスト別 月集計 */
export function castMonth(L: Ledger, m: string): CastMonthRow[] {
  const map: Record<string, CastMonthRow> = {};
  const mk = (cast: Cast): CastMonthRow => ({ cast, hours: 0, wage: 0, backTotal: 0, backs: {}, deduct: 0, gross: 0, paid: 0, settled: 0, unpaid: 0, days: 0 });
  for (const c of L.casts) map[c.id] = mk(c);
  for (const k of monthKeys(L, m)) {
    const d = L.days[k];
    if (!d || !d.shifts) continue;
    for (const cid of Object.keys(d.shifts)) {
      const sh = d.shifts[cid];
      if (!sh || !sh.on) continue;
      if (!map[cid]) map[cid] = mk({ id: cid, name: "（削除済み）", wage: null, active: false });
      const p = payOf(L, cid, sh, k), r = map[cid];
      r.hours += p.hours; r.wage += p.wage; r.backTotal += p.backTotal; r.deduct += p.deduct;
      r.gross += p.gross; r.paid += p.paid; r.unpaid += p.unpaid; r.days++;
      for (const b of L.backItems) r.backs[b.id] = (r.backs[b.id] ?? 0) + p.backs[b.id].amount;
    }
  }
  for (const cid of Object.keys(map)) {
    const s = settlementsFor(L, m, "c:" + cid);
    map[cid].settled = s;
    map[cid].unpaid -= s;
  }
  return Object.values(map).filter((r) => r.days > 0 || r.settled > 0).sort((a, b) => b.gross - a.gross);
}

/** 未入力の日（今日から直近 7 日、同じ月内） */
export function missingDays(L: Ledger, today: string, shiftDay: (d: string, n: number) => string): string[] {
  const m = today.slice(0, 7);
  const out: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const k = shiftDay(today, -i);
    if (k.slice(0, 7) !== m) break;
    if (!L.days[k]) out.push(k);
  }
  return out;
}

/* ============================================================
   円グラフ・年表示用の集計
   ============================================================ */

export interface Contribution { id: string; name: string; value: number }

/** キャスト別の売上貢献。売上% 型のバック項目があれば「対象売上」、無ければバック額で見る。派遣も名前で含める */
export function castContribution(L: Ledger, m: string): { rows: Contribution[]; basis: "target" | "back" } {
  const amountIds = L.backItems.filter((b) => b.type === "amount").map((b) => b.id);
  const basis: "target" | "back" = amountIds.length ? "target" : "back";
  const map = new Map<string, Contribution>();
  const add = (id: string, name: string, p: Pay) => {
    const v = basis === "target" ? amountIds.reduce((s, bid) => s + p.backs[bid].qty, 0) : p.backTotal;
    const cur = map.get(id) ?? { id, name, value: 0 };
    cur.value += v;
    map.set(id, cur);
  };
  for (const k of monthKeys(L, m)) {
    const d = L.days[k];
    for (const cid of Object.keys(d.shifts ?? {})) {
      const sh = d.shifts[cid];
      if (!sh?.on) continue;
      const c = castById(L, cid);
      add("c:" + cid, c ? c.name || "（名前なし）" : "（削除済み）", payOf(L, cid, sh, k));
    }
    for (const row of d.dispatch ?? []) {
      const name = (row.name ?? "").trim() || "（名前なし）";
      add("d:" + name, name + "（派遣）", dispatchPay(L, row));
    }
  }
  const rows = [...map.values()].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  return { rows, basis };
}

/** キャスト別のランキング。派遣も名前で混ぜる。
 *  target = 売上%型バックの対象売上 / back = バック額 / count = 件数型バックの本数 */
export function castRanking(L: Ledger, m: string, metric: RankMetric): RankRow[] {
  const amountIds = L.backItems.filter((b) => b.type === "amount").map((b) => b.id);
  const countIds = L.backItems.filter((b) => b.type === "count").map((b) => b.id);
  const map = new Map<string, RankRow>();
  const add = (id: string, name: string, isDispatch: boolean, p: Pay) => {
    const v = metric === "back" ? p.backTotal
      : metric === "count" ? countIds.reduce((sm, bid) => sm + p.backs[bid].qty, 0)
      : amountIds.reduce((sm, bid) => sm + p.backs[bid].qty, 0);
    const cur = map.get(id) ?? { id, name, value: 0, isDispatch };
    cur.value += v;
    map.set(id, cur);
  };
  for (const k of monthKeys(L, m)) {
    const d = L.days[k];
    for (const cid of Object.keys(d.shifts ?? {})) {
      const sh = d.shifts[cid];
      if (!sh?.on) continue;
      const c = castById(L, cid);
      add("c:" + cid, c ? c.name || "（名前なし）" : "（削除済み）", false, payOf(L, cid, sh, k));
    }
    for (const row of d.dispatch ?? []) {
      const name = (row.name ?? "").trim() || "（名前なし）";
      add("d:" + name, name, true, dispatchPay(L, row));
    }
  }
  return [...map.values()].filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ja"));
}

/** その月に「予定」か「実績」がある日を、キャストごとに返す */
export interface ShiftDay { date: string; planned: boolean; worked: boolean; hours: number; gross: number }
export function castShiftDays(L: Ledger, castId: string, m: string): ShiftDay[] {
  const dates = new Set<string>();
  for (const k of Object.keys(L.plans ?? {})) if (k.startsWith(m) && (L.plans![k] ?? []).includes(castId)) dates.add(k);
  for (const k of monthKeys(L, m)) if (L.days[k].shifts?.[castId]?.on) dates.add(k);
  return [...dates].sort().map((date) => {
    const sh = L.days[date]?.shifts?.[castId];
    const worked = !!sh?.on;
    const p = worked ? payOf(L, castId, sh, date) : null;
    return {
      date,
      planned: (L.plans?.[date] ?? []).includes(castId),
      worked,
      hours: p ? p.hours : 0,
      gross: p ? p.gross : 0,
    };
  });
}

/** 曜日別の売上合計（0=日 … 6=土） */
export function weekdaySales(series: DayTotals[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const t of series) out[new Date(t.date + "T00:00:00").getDay()] += t.sales;
  return out;
}

export interface YearMonth {
  m: string; days: number; cash: number; card: number; sales: number; guests: number;
  labor: number; laborAll: number; exp: number; costAll: number; profit: number;
}
export interface YearTotals {
  year: string; months: YearMonth[]; days: number; cash: number; card: number; sales: number; guests: number;
  labor: number; laborAll: number; exp: number; costAll: number; profit: number; avgSpend: number;
}

/** 年の集計。固定費（固定人件費・家賃ほか）は日報のある月だけ加える */
export function yearTotals(L: Ledger, year: string): YearTotals {
  const months: YearMonth[] = [];
  for (let i = 1; i <= 12; i++) {
    const m = `${year}-${String(i).padStart(2, "0")}`;
    const a = monthTotals(L, m);
    const active = a.days > 0;
    const laborAll = a.labor + (active ? a.fixedLabor : 0);
    const costAll = a.exp + a.fee + (active ? a.fixedCost : 0);
    months.push({ m, days: a.days, cash: a.cash, card: a.card, sales: a.sales, guests: a.guests, labor: a.labor, laborAll, exp: a.exp, costAll, profit: a.sales - laborAll - costAll });
  }
  const y: YearTotals = { year, months, days: 0, cash: 0, card: 0, sales: 0, guests: 0, labor: 0, laborAll: 0, exp: 0, costAll: 0, profit: 0, avgSpend: 0 };
  for (const x of months) {
    y.days += x.days; y.cash += x.cash; y.card += x.card; y.sales += x.sales; y.guests += x.guests;
    y.labor += x.labor; y.laborAll += x.laborAll; y.exp += x.exp; y.costAll += x.costAll; y.profit += x.profit;
  }
  y.avgSpend = y.guests > 0 ? y.sales / y.guests : 0;
  return y;
}

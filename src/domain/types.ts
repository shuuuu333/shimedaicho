/** 締め台帳のデータモデル（v3）。
 *  数値は number | null（null = 未入力）。旧アーティファクト(v2)の文字列は migrate.ts で変換する。 */

export type BackType = "count" | "amount";
export type PayMethod = "cash" | "card" | "bank";

/** バックの項目（ドリンク・指名・同伴・ボトル…） */
export interface BackItem {
  id: string;
  name: string;
  /** count: 単価×本数 / amount: 対象売上×％ */
  type: BackType;
  /** 在籍キャストの単価（count なら円、amount なら％） */
  rate: number;
  /** 派遣の単価 */
  rateD: number;
}

export interface Cast {
  id: string;
  name: string;
  /** null なら店の基本時給 */
  wage: number | null;
  active: boolean;
}

export interface Shop {
  name: string;
  cardFeeRate: number;
  openingCash: number;
  /** 現金残の起点日 YYYY-MM-DD */
  openingDate: string;
  defaultWage: number;
  roundMinutes: number;
  fixedLabor: number;
  fixedCost: number;
  dispatchGuarantee: number;
  openTime: string;
  closeTime: string;
}

/** 在籍キャストの 1 日ぶんの出勤 */
export interface Shift {
  on: boolean;
  in: string;
  out: string;
  breakMin: number | null;
  /** backItem.id → 本数（count）または対象売上（amount） */
  backs: Record<string, number | null>;
  deduct: number | null;
  paid: number | null;
}

/** 派遣キャストの 1 日ぶん */
export interface DispatchRow {
  id: string;
  name: string;
  /** null なら店の基本日給 */
  guarantee: number | null;
  in: string;
  out: string;
  breakMin: number | null;
  backs: Record<string, number | null>;
  deduct: number | null;
  paid: number | null;
}

export interface Expense {
  id: string;
  name: string;
  amount: number | null;
  method: PayMethod;
}

/** 未払い給料の精算。who = "c:<castId>" | "d:<派遣名>" */
export interface Settlement {
  id: string;
  who: string;
  forMonth: string;
  amount: number | null;
}

export interface DayRecord {
  cashSales: number | null;
  cardSales: number | null;
  guests: number | null;
  expenses: Expense[];
  bankDeposit: number | null;
  cardReceived: number | null;
  cashCounted: number | null;
  /** まとめて払った日払い */
  payout: number | null;
  shifts: Record<string, Shift>;
  dispatch: DispatchRow[];
  settle: Settlement[];
}

export interface Ledger {
  v: 3;
  shop: Shop;
  backItems: BackItem[];
  casts: Cast[];
  /** YYYY-MM-DD → 日報 */
  days: Record<string, DayRecord>;
}

/* ---------- 集計結果 ---------- */

export interface BackAmounts {
  [backId: string]: { qty: number; amount: number };
}

export interface Pay {
  mins: number;
  hours: number;
  /** 在籍: 時給分 */
  wage: number;
  /** 派遣: 日給（保証額） */
  guarantee: number;
  backs: BackAmounts;
  backTotal: number;
  deduct: number;
  gross: number;
  paid: number;
  unpaid: number;
}

export interface DayTotals {
  date: string;
  cash: number; card: number; sales: number; guests: number;
  expCash: number; expCard: number; expBank: number; exp: number;
  bankDeposit: number; cardReceived: number; cashCounted: number | null;
  labor: number; laborR: number; laborD: number;
  paidCash: number; paidDetail: number; paidLump: number; paidCount: number;
  settled: number; unpaid: number;
  workers: number; workersR: number; workersD: number; hours: number;
  fee: number; profit: number;
}

export interface MonthTotals {
  days: number;
  cash: number; card: number; sales: number; guests: number;
  exp: number; expCash: number;
  labor: number; laborR: number; laborD: number;
  paidCash: number; paidDetail: number; paidLump: number; settled: number; unpaid: number;
  fee: number; bankDeposit: number; cardReceived: number; hours: number; workers: number;
  series: DayTotals[];
  settledFor: number;
  fixedLabor: number; fixedCost: number;
  laborAll: number; costAll: number; profit: number; avgSpend: number;
}

export interface CastMonthRow {
  cast: Cast;
  hours: number; wage: number; backTotal: number;
  backs: Record<string, number>;
  deduct: number; gross: number; paid: number; settled: number; unpaid: number; days: number;
}

export interface DispatchMonthRow {
  name: string;
  days: number; hours: number; guarantee: number; backTotal: number;
  backs: Record<string, number>;
  deduct: number; gross: number; paid: number; settled: number; unpaid: number;
}

export interface Balances {
  cash: number;
  cardOut: number;
  lastCount: number | null;
  lastCountDate: string | null;
}

export interface Owed {
  who: string;
  name: string;
  unpaid: number;
}

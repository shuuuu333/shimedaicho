/** 締め台帳のデータモデル（v4）。
 *  数値は number | null（null = 未入力）。旧アーティファクト(v2)の文字列は migrate.ts で変換する。
 *  v4 でレジ（メニュー・席・会計ルール・伝票）を足した。伝票 Check だけは台帳の外（Dexie の checks）に置く。 */

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

/** 時給の変更。from の月（YYYY-MM）から、その次の変更までこの時給を使う */
export interface WageChange {
  from: string;
  /** null なら店の基本時給 */
  wage: number | null;
}

export interface Cast {
  id: string;
  name: string;
  /** 最初の時給。null なら店の基本時給 */
  wage: number | null;
  active: boolean;
  /** 月ごとの時給変更。過去の締めは当時の時給のまま計算される */
  wages?: WageChange[];
  /** ログイン用のメール。本人がシフトを見るときに使う */
  email?: string;
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
  /** 締め（実査現金の入力）が終わったら、自動で LINE に送るか */
  lineAuto?: boolean;
}

/** シフト予定の 1 件。時刻が空なら店の開店・閉店時刻を使う */
export interface PlanEntry {
  castId: string;
  in?: string;
  out?: string;
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
  /** 手で直した欄。レジからの自動反映がここを上書きしない。
   *  "cashSales" | "cardSales" | "guests" | "shift:<castId>" の形 */
  manual?: string[];
  /** レジが最後にこの日報へ反映した日時。これがあれば「レジから自動」と出せる */
  posAt?: string;
  /** この日の締めを LINE に送った日時。二度送りを防ぐ目印 */
  lineSentAt?: string;
}

export interface Ledger {
  v: 4;
  shop: Shop;
  backItems: BackItem[];
  casts: Cast[];
  /** YYYY-MM-DD → 日報 */
  days: Record<string, DayRecord>;
  /** YYYY-MM-DD → その日のシフト予定。実績は days[].shifts */
  plans?: Record<string, PlanEntry[]>;
  /** レジの商品 */
  menu?: MenuItem[];
  /** レジの席 */
  seats?: Seat[];
  /** レジの会計ルール */
  posRule?: PosRule;
}

/* ---------- レジ（v4） ---------- */

/** 商品の種類。
 *  normal     … ふつうの商品（お客様のドリンク・フード）
 *  castLinked … キャストに紐づけて売る（キャストドリンク・チェキ・指名）
 *  セットと延長はここに入れない。金額の出どころは PosRule と Check.sets の 1 つに決めてある
 *  （メニューの行にも持たせると、同じセット料金を二重に取る事故が起きる） */
export type MenuKind = "normal" | "castLinked";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  /** 伝票画面のタブになる */
  category: string;
  kind: MenuKind;
  /** 締めのバック項目 id。ここが「レジ → 給料」の接続点 */
  backItemId?: string;
  active: boolean;
  sort: number;
}

/** 席。ガールズバーはカウンター番号、コンカフェはテーブル */
export interface Seat {
  id: string;
  name: string;
  sort: number;
}

/** 会計のルール */
export interface PosRule {
  /** 1 セットの分数 */
  setMinutes: number;
  /** セット料金（1 人あたり）の既定 */
  setPrice: number;
  /** 入店のときに 1 タップで選べるセット料金。店の料金プランを並べておく */
  setPriceOptions: number[];
  extendMinutes: number;
  /** 延長料金（1 人あたり・extendMinutes ぶん） */
  extendPrice: number;
  /** テーブルチャージ %。20 なら ¥2,000 の商品が ¥2,400 になる */
  tableChargeRate: number;
  /** テーブルチャージをセット料金にもかけるか。false なら商品だけ */
  tableChargeOnSet: boolean;
  /** 消費税 % */
  taxRate: number;
  /** 税をどこに足すか。false = その単価は税込み（足さない）。
   *  「セットは税込、延長からは税別」といった店のルールをそのまま表せる */
  taxOnSet: boolean;
  taxOnExtend: boolean;
  taxOnItems: boolean;
  /** 残り何分でアラートを出すか */
  alertBeforeMin: number;
  /** 時間が来たら確認なしで延長を足すか */
  autoExtend: boolean;
  /** 会計の丸め単位。1 なら丸めない */
  roundTo: number;
}

/** 延長 1 回ぶん。押した時点の分数と単価（1 人あたり）を写しておく。
 *  「＋30分」と「＋1時間」を混ぜて押せるように、回数ではなく 1 件ずつ持つ */
export interface CheckExtend {
  min: number;
  price: number;
  at: string;
}

/** 取消の記録。行は消さずにこれを付ける（不正防止） */
export interface VoidMark {
  at: string;
  by: string;
  reason: string;
}

export interface CheckLine {
  id: string;
  menuId: string;
  /** 名前・単価・種類・バック項目は打った時点の値を写す。
   *  後でマスタを変えても、過去の伝票と給料は変わらない */
  name: string;
  price: number;
  qty: number;
  kind: MenuKind;
  castId?: string;
  backItemId?: string;
  voided?: VoidMark;
  at: string;
}

export interface Payment {
  method: Exclude<PayMethod, "bank">;
  amount: number;
}

export interface Discount {
  name: string;
  amount: number;
}

/** 伝票に起きたことの記録。誰が・いつ・何を */
export interface CheckLog {
  at: string;
  by: string;
  act: string;
  detail?: string;
}

export interface Check {
  id: string;
  /** 営業日 YYYY-MM-DD。日跨ぎの分は開店日に寄せる */
  date: string;
  seatId: string | null;
  guests: number;
  /** この伝票のセット料金（1 人あたり）。入店した時点の値を写す。
   *  あとで店の設定を変えても、過去の会計は変わらない */
  setPrice: number;
  enteredAt: string;
  closedAt?: string;
  /** 延長。空なら最初のセットだけ */
  extends: CheckExtend[];
  lines: CheckLine[];
  discount?: Discount;
  payments: Payment[];
  /** 預り金 */
  received?: number;
  status: "open" | "closed";
  log: CheckLog[];
}

/** 伝票の金額の内訳 */
export interface CheckTotals {
  /** 最初のセット（延長は含まない） */
  baseAmount: number;
  /** 延長のぶん */
  extendAmount: number;
  /** セット＋延長。画面の互換のために残す */
  setAmount: number;
  /** 商品の合計 */
  itemAmount: number;
  subtotal: number;
  /** テーブルチャージ */
  tableCharge: number;
  tax: number;
  /** 税がかかった金額（何に税が乗ったかを画面で説明するため） */
  taxBase: number;
  discount: number;
  /** 丸めたあとの請求額 */
  total: number;
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

/** ランキングの並べ替え方 */
export type RankMetric = "target" | "back" | "count";
export interface RankRow {
  id: string;
  name: string;
  value: number;
  isDispatch: boolean;
}

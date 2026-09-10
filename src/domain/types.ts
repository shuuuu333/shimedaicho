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
  /** 売上％型（amount）のときの下限・上限（円）。
   *  「ボトルは 20% だけど上限 5,000円」のような頭打ちを表す。
   *  売っていない（対象売上 0）ときは効かない＝下限で勝手に付かない */
  min?: number;
  max?: number;
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
  /** バック単価をこの子だけ変える。backItem.id → 単価（count なら円、amount なら％）。
   *  入っていない項目は店の単価を使う。時給（wage）と同じ考え方 */
  backRates?: Record<string, number>;
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
  /** 営業中の LINE 通知の決まり */
  notify?: NotifyRule;
}

/** シフト予定の 1 件。時刻が空なら店の開店・閉店時刻を使う */
export interface PlanEntry {
  castId: string;
  in?: string;
  out?: string;
}

/** 営業中に LINE へ送る通知の決まり。
 *  LINE の無料枠は月 200 通なので、既定は「1 時間ぶんをまとめて 1 通」にしてある。
 *  1 件ずつ送ると、1 日 10 組の店で月 600 通を超えて送れなくなる */
export interface NotifyRule {
  /** 営業中の通知を使うか */
  on: boolean;
  /** 入店を知らせる */
  enter: boolean;
  /** 会計を知らせる */
  pay: boolean;
  /** 取消・値引きを知らせる（現金の抜き取りの見張り） */
  alert: boolean;
  /** 何分ぶんをまとめて 1 通にするか。0 ならためずにすぐ送る */
  batchMin: number;
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
  /** その日に立てたツケ（売掛）。売上には入るが、現金にもカードにも入らない */
  tabSales?: number | null;
  /** その日に回収したツケ。現金として手元に入る（売上には二重に入れない） */
  tabCollected?: number | null;
  /** 閉店後に数えた紙伝票の枚数。レジの伝票の数と突き合わせて打ち漏らしを見つける。
   *  紙とレジを併用しているあいだ（＝移行のあいだ）だけ意味がある */
  slipCount?: number | null;
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
  /** 入店したときに、人数ぶんを自動で入れる（お通し・チャージ）。
   *  毎回手で押していたぶんを消す。キャストに紐づく商品は誰の分か決まらないので対象外 */
  autoOnEntry?: boolean;
}

/** 席。ガールズバーはカウンター番号、コンカフェはテーブル */
export interface Seat {
  id: string;
  name: string;
  sort: number;
}

/** 会計のルール */
/** 入店のときに選ぶセットの組み合わせ。時間と料金は必ず対で決まる。
 *  料金だけを選ばせると、40分 ¥2,000 のコースを選んでも 60分 になってしまう */
export interface SetPlan { min: number; price: number }

export interface PosRule {
  /** 1 セットの分数 */
  setMinutes: number;
  /** セット料金（1 人あたり）の既定 */
  setPrice: number;
  /** 入店のときに 1 タップで選べるセット。「40分 ¥2,000／60分 ¥3,000」のように、
   *  時間と料金の組み合わせで並べる。時間の違うコースを持つ店のため */
  setPlans: SetPlan[];
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
  /** カード払いのとき、カード手数料をお客様に上乗せして請求するか。
   *  率は Shop.cardFeeRate（カード会社に取られる率）をそのまま使う。
   *  false（既定）なら今までどおり店がかぶる */
  cardFeeOnGuest?: boolean;
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

/** 会計の受け取り方。tab はツケ（売掛）で、まだお金は受け取っていない */
export type PayKind = "cash" | "card" | "tab";

export interface Payment {
  method: PayKind;
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
  /** この伝票のセットの時間（分）。料金と同じく入店した時点の値を写す。
   *  無ければ店の設定（PosRule.setMinutes）を使う（v4 の途中までの伝票） */
  setMinutes?: number;
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
  /** カード払いでお客様からもらった手数料。会計のときに確定して写す。
   *  現金に戻したり会計を取り消したりすると消える */
  cardFee?: number;
  /** ツケ（売掛）にしたときの相手。顧客台帳は作らず、その場で書いた名前をそのまま持つ */
  tabName?: string;
  /** ツケを回収した日時と、回収した営業日。付いていれば「もらった」ということ */
  tabPaid?: { at: string; date: string; by: string };
  log: CheckLog[];
  /** 紙伝票に番号を振っている店のための番号。
   *  番号は書き忘れると「抜け番」に見えて嘘の警告を出すので、まず枚数で照合する。
   *  ここは型だけ先に用意してあり、入れる画面はまだ無い */
  slipNo?: string;
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
  /** カード払いでお客様からもらう手数料。現金なら 0 */
  cardFee: number;
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
  /** ツケで立てた売上と、その日に回収したツケ */
  tab: number; tabCollected: number;
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
  tab: number; tabCollected: number;
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
  /** まだ回収していないツケの合計 */
  tabOut: number;
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

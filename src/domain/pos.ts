/** レジ（伝票）の計算。UI にも保存層にも依存しない。
 *  金額はすべて整数（円）で、端数は floor に統一する（calc.ts と同じ流儀）。 */
import type { Check, CheckExtend, CheckLine, CheckTotals, MenuItem, PosRule, SetPlan, Shop } from "./types";
import { shiftDay, uid } from "./format";

/* ---------- 営業日 ---------- */

/** 日付が変わる時刻（分）。閉店から少し余裕を持たせる。
 *  閉店 1:00 の店で 3:00 まで粘ったお客様の会計を、前の日の売上として締めるため */
const AFTER_CLOSE_GRACE = 4 * 60;

/** その時刻がどの営業日のものか。
 *  日をまたぐ営業（開店 20:00 → 閉店 1:00）では、閉店から 4 時間のあいだは「前の日」として締める。
 *  そのあと（昼や夕方の準備中）は、これから始まる夜＝「その日」になる。 */
export function businessDate(now: Date, shop: Pick<Shop, "closeTime" | "openTime">): string {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  const today = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const close = toMin(shop.closeTime);
  const open = toMin(shop.openTime);
  // 日をまたがない営業（昼のカフェなど）は、いつでもその日
  if (close == null || open == null || close >= open) return today;

  // 区切りは「閉店＋4時間」。ただし開店時刻は越えない
  const cutoff = Math.min(close + AFTER_CLOSE_GRACE, open);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins < cutoff ? shiftDay(today, -1) : today;
}

function toMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* ---------- 行 ---------- */

/** 取り消していない行だけ。金額も本数も、集計はすべてこれを通す */
export function activeLines(c: Check): CheckLine[] {
  return c.lines.filter((l) => !l.voided);
}

export function lineAmount(l: CheckLine): number {
  return Math.floor(l.price * l.qty);
}

/** 商品から伝票の行を作る。名前・単価・種類・バック項目は「打った時点の値」を写す。
 *  後でマスタを変えても、過去の伝票と、そこから計算した給料は変わらない */
export function lineFromMenu(m: MenuItem, at: string, castId?: string, qty = 1): CheckLine {
  const l: CheckLine = { id: uid(), menuId: m.id, name: m.name, price: m.price, qty, kind: m.kind, at };
  if (castId) l.castId = castId;
  if (m.backItemId) l.backItemId = m.backItemId;
  return l;
}

/* ---------- 時間 ---------- */

/** 入店からの経過（分） */
export function elapsedMin(c: Check, now: number): number {
  const t = Date.parse(c.enteredAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/** 今の会計で認められている滞在時間（分）。最初のセット ＋ 押した延長のぶん */
export function allowedMin(c: Check, rule: PosRule): number {
  // 伝票が自分の分数を持っていればそれを使う。持っていない古い伝票は店の設定で見る
  const base = c.setMinutes != null && c.setMinutes > 0 ? Math.floor(c.setMinutes) : rule.setMinutes;
  return base + c.extends.reduce((s, e) => s + e.min, 0);
}

/** 何時までか。席で「22:30まで」と言えるようにする */
export function endsAt(c: Check, rule: PosRule): Date {
  return new Date(Date.parse(c.enteredAt) + allowedMin(c, rule) * 60000);
}

/** 時計の表示 HH:MM */
export function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 延長ボタンの選択肢。店の設定（1 回ぶんの分数と料金）から作る。
 *  ＋1時間は「1 回ぶんの何倍か」で料金を出すので、30分¥1,000 の店なら ¥2,000 になる */
export function extendOptions(rule: PosRule): { label: string; min: number; price: number }[] {
  const unit = Math.max(1, Math.floor(rule.extendMinutes));
  const out = [{ label: `＋${unit}分`, min: unit, price: Math.floor(rule.extendPrice) }];
  if (unit !== 60) {
    out.push({ label: "＋1時間", min: 60, price: Math.floor((rule.extendPrice * 60) / unit) });
  }
  return out;
}

/** のこり時間（分）。マイナスなら超過している */
export function remainingMin(c: Check, rule: PosRule, now: number): number {
  return allowedMin(c, rule) - elapsedMin(c, now);
}

/** 席カードの色分け: ok → soon（そろそろ声かけ）→ over（超過） */
export type SeatState = "ok" | "soon" | "over";
export function seatState(c: Check, rule: PosRule, now: number): SeatState {
  const left = remainingMin(c, rule, now);
  if (left < 0) return "over";
  if (left <= rule.alertBeforeMin) return "soon";
  return "ok";
}

/* ---------- 金額 ---------- */

/** 丸め。切り捨て（お客様に不利にならない向き）。roundTo が 1 以下なら何もしない */
export function roundDown(n: number, roundTo: number): number {
  const u = Math.max(1, Math.floor(roundTo));
  return Math.floor(n / u) * u;
}

/** セット料金（延長込み）。すべて「1 人あたり × 人数」で出す。
 *  セット料金は伝票が持っている値を使う（店の設定を変えても過去の会計は変わらない） */
export function setUnitPrice(c: Check, _rule?: PosRule): number {
  return Math.floor(c.setPrice) + c.extends.reduce((s, e) => s + Math.floor(e.price), 0);
}

/** 伝票の金額。
 *  セットも延長も「1 人あたりの単価 × 人数」。2 名でセット ¥3,000 なら ¥6,000 になる。
 *  テーブルチャージは％。既定では商品にだけかける（設定でセットにもかけられる）。
 *  税は「単価が税抜きのときに上乗せする額」。税込み運用なら 0 になる（単価に入っているため）。 */
export function checkTotals(c: Check, rule: PosRule): CheckTotals {
  const guests = Math.max(0, Math.floor(c.guests));
  const baseAmount = guests * Math.floor(c.setPrice);
  const extendAmount = guests * c.extends.reduce((s, e) => s + Math.floor(e.price), 0);
  const setAmount = baseAmount + extendAmount;
  const itemAmount = activeLines(c).reduce((s, l) => s + lineAmount(l), 0);
  const subtotal = setAmount + itemAmount;

  const tcBase = rule.tableChargeOnSet ? subtotal : itemAmount;
  const tableCharge = Math.floor((tcBase * rule.tableChargeRate) / 100);

  // 税は部分ごとに足す。税込みで値付けしているところには足さない。
  // テーブルチャージは、商品と同じ扱いにする（商品に乗せる％なので）
  const taxBase = (rule.taxOnSet ? baseAmount : 0)
    + (rule.taxOnExtend ? extendAmount : 0)
    + (rule.taxOnItems ? itemAmount + tableCharge : 0);
  const tax = Math.floor((taxBase * rule.taxRate) / 100);

  // 値引きは請求額を超えない。マイナスの会計を作らせない
  const asked = subtotal + tableCharge + tax;
  const discount = Math.min(Math.max(0, Math.floor(c.discount?.amount ?? 0)), asked);

  // カード手数料は、丸めたあとの請求額に足す（お客様に見せる額をきりのいい数から動かさない）
  const cardFee = Math.max(0, Math.floor(c.cardFee ?? 0));
  return { baseAmount, extendAmount, setAmount, itemAmount, subtotal, tableCharge, tax, taxBase,
           discount, cardFee, total: roundDown(asked - discount, rule.roundTo) + cardFee };
}

/** カード払いのときにお客様からもらう手数料を、伝票に書き込む。
 *  現金のときと、設定で「店がかぶる」にしているときは欄そのものを消す。
 *
 *  率は Shop.cardFeeRate（カード会社に取られる率）を使いまわす。設定を 2 つに
 *  分けると、どちらを直したのか分からなくなるため。
 *  店側の控除（dayTotals.fee・カード未回収）はどちらの設定でも今までどおり効く。
 *  カード会社は誰が負担を決めたかに関わらず取っていくので、そこは事実として変わらない。 */
export function applyCardFee(c: Check, rule: PosRule, shopFeeRate: number, method: "cash" | "card"): void {
  delete c.cardFee;
  if (method !== "card" || !rule.cardFeeOnGuest) return;
  const rate = Number.isFinite(shopFeeRate) ? shopFeeRate : 0;
  if (rate <= 0) return;
  // ここでは cardFee を消してあるので、checkTotals は素の請求額を返す
  const fee = Math.floor((checkTotals(c, rule).total * rate) / 100);
  if (fee > 0) c.cardFee = fee;
}

/** その伝票をカードで会計したときの請求額（画面に「カードなら ¥X」と出すため）。
 *  伝票は書き換えない */
export function cardTotalOf(c: Check, rule: PosRule, shopFeeRate: number): number {
  const copy: Check = { ...c, cardFee: undefined };
  applyCardFee(copy, rule, shopFeeRate, "card");
  return checkTotals(copy, rule).total;
}

/** 受け取った額の合計 */
export function paidTotal(c: Check): number {
  return c.payments.reduce((s, p) => s + Math.floor(p.amount), 0);
}

/** お釣り。預り金が請求額に足りなければ 0 */
export function changeDue(received: number, total: number): number {
  return Math.max(0, Math.floor(received) - total);
}

/* ---------- 伝票を作る ---------- */

export function newCheck(date: string, seatId: string | null, guests: number, plan: SetPlan, at: string, by: string): Check {
  const p = Math.max(0, Math.floor(plan.price));
  const m = Math.max(1, Math.floor(plan.min));
  const n = Math.max(1, Math.floor(guests));
  return {
    id: uid(), date, seatId, guests: n, setPrice: p, setMinutes: m,
    enteredAt: at, extends: [], lines: [], payments: [], status: "open",
    log: [{ at, by, act: "入店", detail: `${n}名 ／ ${planLabel({ min: m, price: p })}／人` }],
  };
}

/** 入店のときに出すセット料金の候補。設定の並びに、既定の料金も必ず入れる */
/** 入店のときに 1 タップで選べるセット。店の既定（setMinutes / setPrice）も必ず入れる。
 *  時間の短い順、同じ時間なら安い順。同じ組み合わせは 1 つにまとめる */
export function setPlanChoices(rule: PosRule): SetPlan[] {
  const seen = new Set<string>();
  const out: SetPlan[] = [];
  const add = (min: number, price: number) => {
    const m = Math.max(1, Math.floor(min)), p = Math.floor(price);
    if (p <= 0) return;
    const key = `${m}:${p}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ min: m, price: p });
  };
  for (const x of rule.setPlans ?? []) add(x.min, x.price);
  add(rule.setMinutes, rule.setPrice);
  return out.sort((a, b) => a.min - b.min || a.price - b.price);
}

/** 「40分 ¥2,000」のような見せ方。1時間ちょうどは「1時間」と書く */
export function planLabel(p: SetPlan): string {
  const h = p.min % 60 === 0 ? `${p.min / 60}時間` : `${p.min}分`;
  return `${h} ¥${p.price.toLocaleString("ja-JP")}`;
}

/** 保存から読んだ伝票をならす。
 *  初期の版は延長を「sets（回数）」で持ち、セット料金は店の設定を見ていた */
export function normalizeCheck(raw: Check & { sets?: number }, rule: PosRule): Check {
  const out = { ...raw };
  if (!Array.isArray(out.extends)) {
    const times = Math.max(0, Math.floor(raw.sets ?? 1) - 1);
    const extendsList: CheckExtend[] = [];
    for (let i = 0; i < times; i++) {
      extendsList.push({ min: rule.extendMinutes, price: rule.extendPrice, at: raw.enteredAt });
    }
    out.extends = extendsList;
  }
  if (typeof out.setPrice !== "number") out.setPrice = rule.setPrice;
  return out;
}

/** 現金の預り金ボタンの候補。請求額のすぐ上のキリのいい額を出す */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) return [1000, 5000, 10000];
  const out = new Set<number>([total]);
  for (const u of [1000, 5000, 10000]) {
    const v = Math.ceil(total / u) * u;
    if (v >= total) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

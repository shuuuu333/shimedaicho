/** レジ（伝票）を日報に反映する。「打った瞬間に締めが埋まる」の実体。
 *
 *  レジが面倒を見るのは 売上・客数・キャストごとのバックの本数（と対象売上）だけ。
 *  経費・控除・日払い・精算・銀行入金・実査現金は今までどおり手入力のまま触らない。
 *  手で直した欄（DayRecord.manual）は上書きしない。 */
import type { Check, DayRecord, Ledger, Shift } from "./types";
import { activeLines, lineAmount } from "./pos";

/** manual に入れる印。ここに載っている欄はレジが触らない */
export const MANUAL_CASH = "cashSales";
export const MANUAL_CARD = "cardSales";
export const MANUAL_GUESTS = "guests";
export const manualShift = (castId: string): string => "shift:" + castId;

const newShift = (): Shift => ({ on: false, in: "", out: "", breakMin: null, backs: {}, deduct: null, paid: null });

/** レジが面倒を見るバック項目。
 *  ①メニューが参照している id ＋ ②その日に実際に打たれた id。
 *  ②を入れておかないと、売ったあとにメニューから商品を消したとき、
 *  反映が止まったうえに前回の値が残り続ける。
 *  ここに載っていない項目（手で入れたボトルバックなど）はレジの反映で消えない */
export function managedBackIds(L: Ledger, checks: Check[] = []): Set<string> {
  const out = new Set<string>();
  for (const m of L.menu ?? []) if (m.backItemId) out.add(m.backItemId);
  for (const c of checks) for (const l of c.lines) if (l.backItemId) out.add(l.backItemId);
  return out;
}

export interface ChecksSummary {
  cash: number;
  card: number;
  guests: number;
  /** castId → backItemId → 数量（count 型は本数、amount 型は対象売上） */
  byCast: Record<string, Record<string, number>>;
  closed: number;
  open: number;
  voided: number;
  discount: number;
}

/** その日の伝票を集計する。会計の済んだ伝票だけが売上になる */
export function summarize(checks: Check[], L: Ledger): ChecksSummary {
  const s: ChecksSummary = { cash: 0, card: 0, guests: 0, byCast: {}, closed: 0, open: 0, voided: 0, discount: 0 };
  const byId = new Map((L.backItems ?? []).map((b) => [b.id, b]));

  for (const c of checks) {
    if (c.status !== "closed") { s.open++; continue; }
    s.closed++;
    s.guests += Math.max(0, Math.floor(c.guests));
    s.discount += Math.max(0, Math.floor(c.discount?.amount ?? 0));
    for (const p of c.payments) {
      if (p.method === "cash") s.cash += Math.floor(p.amount);
      else s.card += Math.floor(p.amount);
    }
    s.voided += c.lines.filter((l) => l.voided).length;

    for (const l of activeLines(c)) {
      if (!l.castId || !l.backItemId) continue;
      const item = byId.get(l.backItemId);
      if (!item) continue;
      // count 型は「本数」、amount 型は「対象売上」を積む（calc.ts が単価と % を掛ける）
      const add = item.type === "count" ? l.qty : lineAmount(l);
      const row = (s.byCast[l.castId] ??= {});
      row[l.backItemId] = (row[l.backItemId] ?? 0) + add;
    }
  }
  return s;
}

/** 集計を日報に書き込む。d は immer の draft を想定していて、その場で書き換える。
 *  返り値は d 自身（テストで扱いやすいように）。 */
export function applyChecksToDay(d: DayRecord, checks: Check[], L: Ledger): DayRecord {
  const s = summarize(checks, L);
  const manual = new Set(d.manual ?? []);
  const managed = managedBackIds(L, checks);

  if (!manual.has(MANUAL_CASH)) d.cashSales = s.cash;
  if (!manual.has(MANUAL_CARD)) d.cardSales = s.card;
  if (!manual.has(MANUAL_GUESTS)) d.guests = s.guests;

  // レジに出てきたキャストは、その日の出勤として扱う
  for (const castId of Object.keys(s.byCast)) {
    if (manual.has(manualShift(castId))) continue;
    const sh = (d.shifts[castId] ??= newShift());
    if (!sh.on) {
      sh.on = true;
      if (!sh.in) sh.in = L.shop.openTime;
      if (!sh.out) sh.out = L.shop.closeTime;
    }
  }

  // レジが面倒を見るバック項目だけを上書きする。手入力のぶんは残す
  for (const [castId, sh] of Object.entries(d.shifts)) {
    if (manual.has(manualShift(castId))) continue;
    const mine = s.byCast[castId] ?? {};
    for (const backId of managed) {
      const v = mine[backId] ?? 0;
      if (v > 0) sh.backs[backId] = v;
      else delete sh.backs[backId];   // 売っていない項目は未入力に戻す（0 を並べない）
    }
  }
  return d;
}

/** 欄を手入力に切り替える／レジに戻す */
export function setManual(d: DayRecord, key: string, on: boolean): void {
  const set = new Set(d.manual ?? []);
  if (on) set.add(key); else set.delete(key);
  if (set.size) d.manual = [...set];
  else delete d.manual;
}

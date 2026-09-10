/** 何時にお客様が入っているかを、伝票の入店時刻から出す。
 *
 *  「早い時間は暇だから 21 時開店にする」「金曜の 23 時に人を厚くする」といった
 *  判断の材料。人の記憶ではなく、打った伝票がそのまま答えになる。
 *
 *  並びは開店時刻から始める。20:00 開店・01:00 閉店の店で 0 時台を先頭に置くと、
 *  一番忙しい時間が左端に来て読めなくなるため。 */
import { activeLines, checkTotals } from "./pos";
import type { Check, PosRule, Shop } from "./types";

export interface ArrivalHour {
  /** 0〜23 の「時」 */
  hour: number;
  /** その時間に入店した組数 */
  groups: number;
  guests: number;
  /** その時間に入った組の会計合計（会計済みのぶんだけ） */
  sales: number;
}

const hourOf = (iso: string): number | null => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).getHours();
};

/** 開店時刻の「時」。読めなければ 0 時から並べる */
export function openHour(shop: Pick<Shop, "openTime">): number {
  const m = /^(\d{1,2}):/.exec(shop.openTime ?? "");
  const h = m ? Number(m[1]) : NaN;
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 0;
}

/** 時間帯ごとの来店。開店時刻から並べ、前後の「ずっと 0 の時間」は落とす。
 *  途中の 0 は残す（「22時だけ空く」が見えなくなるため） */
export function arrivalsByHour(checks: Check[], rule: PosRule, shop: Pick<Shop, "openTime">): ArrivalHour[] {
  const rows: ArrivalHour[] = Array.from({ length: 24 }, (_, hour) => ({ hour, groups: 0, guests: 0, sales: 0 }));
  for (const c of checks) {
    const h = hourOf(c.enteredAt);
    if (h == null) continue;
    const r = rows[h];
    r.groups++;
    r.guests += Math.max(0, Math.floor(c.guests));
    if (c.status === "closed") {
      // 会計済みのぶんだけ。入店中の伝票はまだ額が決まっていない
      r.sales += c.payments.length
        ? c.payments.reduce((s, p) => s + Math.floor(p.amount), 0)
        : checkTotals(c, rule).total;
    }
  }

  const start = openHour(shop);
  const ordered = Array.from({ length: 24 }, (_, i) => rows[(start + i) % 24]);
  let head = 0;
  while (head < ordered.length && ordered[head].groups === 0) head++;
  if (head === ordered.length) return [];
  let tail = ordered.length - 1;
  while (tail > head && ordered[tail].groups === 0) tail--;
  return ordered.slice(head, tail + 1);
}

/** 一番混む時間帯。同数なら早いほうを採る（早い時間に寄せたほうが判断に使いやすい） */
export function busiestHour(rows: ArrivalHour[]): ArrivalHour | null {
  let best: ArrivalHour | null = null;
  for (const r of rows) if (!best || r.groups > best.groups) best = r;
  return best && best.groups > 0 ? best : null;
}

/** その時間に入った組の平均単価。組数 0 なら 0 */
export function avgPerGroup(r: ArrivalHour): number {
  return r.groups > 0 ? Math.round(r.sales / r.groups) : 0;
}

/** 注文がまったく入っていない伝票を除いた数（打ち忘れの目安に使う） */
export function withOrders(checks: Check[]): number {
  return checks.filter((c) => activeLines(c).length > 0).length;
}

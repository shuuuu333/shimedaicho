/** シフト予定（Ledger.plans）を読み書きするためのヘルパー。
 *  予定は「その日に入る子」と「何時から何時まで」を持つ。
 *  時刻が空のときは店の開店・閉店時刻（Shop.openTime / closeTime）を使う。 */
import { minutesOf } from "./calc";
import type { Ledger, PlanEntry } from "./types";

/** その日その子の予定。入っていなければ null */
export function planFor(L: Ledger, date: string, castId: string): PlanEntry | null {
  return (L.plans?.[date] ?? []).find((p) => p.castId === castId) ?? null;
}

/** その日の予定に入っているキャストID */
export function plannedIds(L: Ledger, date: string): string[] {
  return (L.plans?.[date] ?? []).map((p) => p.castId);
}

/** 予定の出退勤時刻。空欄は店の既定で埋める。予定に入っていなければ null */
export function planTimes(L: Ledger, date: string, castId: string): { in: string; out: string } | null {
  const p = planFor(L, date, castId);
  if (!p) return null;
  return { in: p.in || L.shop.openTime, out: p.out || L.shop.closeTime };
}

/** 予定より何分あとに来たか。早ければマイナス。どちらかの時刻が無ければ null。
 *  日付をまたぐ店なので、12時間より大きいずれは「反対側」として扱う */
export function lateMinutes(planTime: string | undefined, actual: string | undefined): number | null {
  const a = minutesOf(planTime), b = minutesOf(actual);
  if (a == null || b == null) return null;
  const d = (b - a + 1440) % 1440;
  return d > 720 ? d - 1440 : d;
}

/** 「30分 遅れ」「15分 早い」。5分以内のずれは言わない（毎日出て邪魔になるため） */
export function lateLabel(min: number | null, tolerance = 5): string {
  if (min == null || Math.abs(min) <= tolerance) return "";
  const n = Math.abs(min);
  const t = n >= 60 && n % 60 === 0 ? `${n / 60}時間` : n > 60 ? `${Math.floor(n / 60)}時間${n % 60}分` : `${n}分`;
  return min > 0 ? `${t} 遅れ` : `${t} 早い`;
}

/** 予定の表示。「20:00-01:00」 */
export function planRange(t: { in: string; out: string } | null): string {
  return t ? `${t.in}-${t.out}` : "";
}

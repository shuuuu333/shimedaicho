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

/** 勤務の長さ（分）。日付をまたぐ店なので、退勤が出勤より小さければ翌日とみなす */
export function spanMinutes(t: { in: string; out: string }): number {
  const a = minutesOf(t.in), b = minutesOf(t.out);
  if (a == null || b == null) return 0;
  return b > a ? b - a : b + 1440 - a;
}

/** 「5時間」「5時間30分」。0 は空文字（無いものを書かない） */
export function spanLabel(min: number): string {
  if (min <= 0) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h}時間` : h === 0 ? `${m}分` : `${h}時間${m}分`;
}

export interface ShiftPattern { in: string; out: string; used: number }

/** その店がよく使っている出退勤の組み合わせ。
 *
 *  決め打ちの候補を並べても、店によって時間帯が違うので当たらない。
 *  すでに入れた予定から多い順に拾えば、その店のパターンがそのまま出る。
 *  店の既定（開店-閉店）は必ず先頭に入れる。まだ予定が 1 件も無い店でも
 *  1 タップで決められるように。 */
export function commonShifts(L: Ledger, limit = 4): ShiftPattern[] {
  const count = new Map<string, ShiftPattern>();
  const bump = (i: string, o: string) => {
    const k = `${i}-${o}`;
    const hit = count.get(k);
    if (hit) hit.used += 1;
    else count.set(k, { in: i, out: o, used: 1 });
  };
  const def = { in: L.shop.openTime, out: L.shop.closeTime };
  for (const rows of Object.values(L.plans ?? {})) {
    for (const p of rows) bump(p.in || def.in, p.out || def.out);
  }
  const rest = [...count.values()]
    .filter((p) => !(p.in === def.in && p.out === def.out))
    .sort((a, b) => b.used - a.used || a.in.localeCompare(b.in));
  return [{ ...def, used: count.get(`${def.in}-${def.out}`)?.used ?? 0 }, ...rest].slice(0, limit);
}

/** その日に入っている子の名前。カレンダーの升に出すぶんだけ返す。
 *  実績があれば実績、無ければ予定を見る（「この日は誰が入るのか」が知りたいので） */
export function whoOn(L: Ledger, date: string): { names: string[]; total: number } {
  const worked = Object.keys(L.days[date]?.shifts ?? {}).filter((cid) => L.days[date].shifts[cid]?.on);
  const ids = worked.length ? worked : plannedIds(L, date);
  const names = ids.map((cid) => L.casts.find((c) => c.id === cid)?.name ?? "").filter(Boolean);
  return { names, total: ids.length };
}

/** その日が本人にとって何なのか（キャスト手帳のカレンダー）。
 *
 *  過ぎた日は「入りました」、まだの日（今日を含む）は「入ります」。
 *  過ぎた日に予定だけあって店の記録がまだ無いことがあるが、
 *  本人から見れば入った日なので同じ扱いにする。記録待ちなのは開いた所に書く。
 *
 *  from は「何時から」。実績があればその時刻、無ければ予定の時刻。
 *  開かなくても月を見渡せるように、升にも出している。 */
export function myDayState(L: Ledger, castId: string, date: string, today: string):
  { kind: "done" | "next" | ""; from: string; worked: boolean } {
  const sh = L.days[date]?.shifts?.[castId];
  const worked = !!sh?.on;
  const plan = planTimes(L, date, castId);
  if (!worked && !plan) return { kind: "", from: "", worked: false };
  const from = (worked && sh?.in) || plan?.in || "";
  return { kind: date < today ? "done" : "next", from, worked };
}

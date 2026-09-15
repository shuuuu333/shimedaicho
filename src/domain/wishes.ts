/** シフト希望（Ledger.wishes）。
 *
 *  いまの予定（Ledger.plans）は、オーナーが 1 人ずつ入れて組む。
 *  実際の店では、先に「来月ここ入れます」をキャストから集めてから組む。
 *  その集める所が LINE とメモ帳でやられていて、写し間違いが起きる。
 *
 *  希望と予定は別物として持つ。同じ所に入れると
 *  「本人が出しただけのもの」と「店が決めたもの」の区別が消え、
 *  出しただけの日に出勤したことにされる事故が起きる。
 *
 *  ■ 「まだ出していない」と「入れない」を分ける
 *  日ごとの希望が無いことには 2 つの意味がある。まだ答えていないのか、
 *  その日は無理なのか。オーナーが知りたいのは前者（催促する相手）なので、
 *  「出し終えた月」を castId ごとに持つ（wishDone）。
 *  出し終えていて希望が無い日は、はっきり「入れない日」になる。 */
import type { Cast, Ledger, Wish } from "./types";

/** その日に「入れます」と出ている希望 */
export function wishesOn(L: Ledger, date: string): Wish[] {
  return L.wishes?.[date] ?? [];
}

/** その日その子の希望。出していなければ null */
export function wishOf(L: Ledger, date: string, castId: string): Wish | null {
  return wishesOn(L, date).find((w) => w.castId === castId) ?? null;
}

/** その月にその子が出している日（古い順） */
export function wishDays(L: Ledger, month: string, castId: string): string[] {
  return Object.keys(L.wishes ?? {})
    .filter((k) => k.startsWith(month) && wishesOn(L, k).some((w) => w.castId === castId && isWant(w)))
    .sort();
}

/** その月ぶんを出し終えたと押したか */
export function isWishDone(L: Ledger, castId: string, month: string): boolean {
  return (L.wishDone?.[castId] ?? []).includes(month);
}

export interface WishRow {
  castId: string;
  name: string;
  /** 出している日（古い順） */
  days: string[];
  /** 「出し終えた」を押したか */
  done: boolean;
}

/** 月の希望を、キャストごとにまとめる。
 *  並びは「出し終えた人 → 出しかけの人 → まだの人」ではなく、
 *  **まだの人を上**にする。オーナーがこの画面を開く理由は催促だから。 */
export function wishRows(L: Ledger, month: string): WishRow[] {
  const active = L.casts.filter((c) => c.active !== false);
  const rows = active.map((c) => ({
    castId: c.id,
    name: c.name,
    days: wishDays(L, month, c.id),
    done: isWishDone(L, c.id, month),
  }));
  const rank = (r: WishRow) => (r.done ? 2 : r.days.length ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b) || b.days.length - a.days.length || a.name.localeCompare(b.name, "ja"));
}

/** まだ 1 日も出していない在籍キャスト。催促する相手 */
export function pendingCasts(L: Ledger, month: string): Cast[] {
  return L.casts.filter((c) => c.active !== false && !isWishDone(L, c.id, month) && wishDays(L, month, c.id).length === 0);
}

/** その日に入れると言っている人数。カレンダーの升に出す */
export function wishCountOn(L: Ledger, date: string): number {
  return wishesOn(L, date).filter(isWant).length;
}

export interface WishDiff {
  date: string;
  /** その日、予定にまだ入っていない希望 */
  adds: Wish[];
}

/** 希望のうち、まだ予定に入っていないもの。
 *
 *  **予定を消さない。足すだけ。** 店が希望と関係なく入れた子を消してしまうと、
 *  取り返しがつかない（誰を消したかが残らない）。
 *  同じ月に 2 回押しても 2 回目は何も足さない（空が返る）。 */
export function planDiff(L: Ledger, month: string): WishDiff[] {
  const ids = new Set(L.casts.filter((c) => c.active !== false).map((c) => c.id));
  const out: WishDiff[] = [];
  for (const date of Object.keys(L.wishes ?? {}).filter((k) => k.startsWith(month)).sort()) {
    const planned = new Set((L.plans?.[date] ?? []).map((p) => p.castId));
    // 変更のお願い（change / off）は混ぜない。まとめて入れるボタンに巻き込むと、
    // 「休みたい」と言っている日を出勤日にしてしまう
    const adds = wishesOn(L, date).filter((w) => isWant(w) && ids.has(w.castId) && !planned.has(w.castId));
    if (adds.length) out.push({ date, adds });
  }
  return out;
}

/** ふつうの希望か（変更のお願いではないか）。kind 無しは希望 */
export const isWant = (w: Wish): boolean => !w.kind || w.kind === "want";

/** 足される延べ人数。「12 人ぶんを予定に入れる」と出すため */
export function diffTotal(diff: readonly WishDiff[]): number {
  return diff.reduce((n, d) => n + d.adds.length, 0);
}

/* ---------- 書き込み（immer の下書きに対して使う） ---------- */

/** その日の希望を入れる／取り消す。
 *  空になった日と空になった欄は消す。持ち歩く JSON が太るのを避ける */
export function toggleWish(L: Ledger, date: string, castId: string): void {
  if (!L.wishes) L.wishes = {};
  const cur = L.wishes[date] ?? [];
  L.wishes[date] = cur.some((w) => w.castId === castId)
    ? cur.filter((w) => w.castId !== castId)
    : [...cur, { castId }];
  if (!L.wishes[date].length) delete L.wishes[date];
  if (!Object.keys(L.wishes).length) delete L.wishes;
}

/** 希望の時刻を直す。空文字を渡すと「店の時間でいい」に戻る */
export function setWishTime(L: Ledger, date: string, castId: string, key: "in" | "out", v: string): void {
  const row = L.wishes?.[date]?.find((w) => w.castId === castId);
  if (!row) return;
  if (v) row[key] = v; else delete row[key];
}

/** その月ぶんを「出し終えた」にする／戻す */
export function markWishDone(L: Ledger, castId: string, month: string, done: boolean): void {
  if (!L.wishDone) L.wishDone = {};
  const cur = L.wishDone[castId] ?? [];
  const next = done ? [...new Set([...cur, month])].sort() : cur.filter((m) => m !== month);
  if (next.length) L.wishDone[castId] = next;
  else delete L.wishDone[castId];
  if (!Object.keys(L.wishDone).length) delete L.wishDone;
}

/** 希望を予定に写す。足した延べ人数を返す。
 *  **足すだけで、予定は消さない**（planDiff と同じ約束）。
 *  希望の時刻もそのまま持っていく。本人が「21時から」と出しているのに
 *  店の既定に戻ると、写した意味が半分無くなる */
export function applyWishes(L: Ledger, month: string): number {
  const diff = planDiff(L, month);
  if (!diff.length) return 0;
  if (!L.plans) L.plans = {};
  for (const d of diff) {
    L.plans[d.date] = [...(L.plans[d.date] ?? []), ...d.adds.map((w) => ({ ...w }))];
  }
  return diffTotal(diff);
}

/* ---------- サーバーの行との突き合わせ ---------- */

/** サーバー（shift_wishes）の 1 行。domain はデータ層を知らないので、形だけ受ける */
export interface WishRowIn { castId: string; date: string; in?: string; out?: string; kind?: Wish["kind"] }

/** 台帳に入っている希望と、サーバーの行を合わせる。
 *
 *  **決まり: サーバーに行を持っている子は、その子ぶんをサーバーで置き換える。**
 *  行を持っていない子は、台帳のものをそのまま残す。
 *
 *  なぜこの決まりか。希望を出せる場所が 2 つある。
 *  ・キャスト本人のアプリ → サーバー（台帳は書けないので、ここしかない）
 *  ・店が代わりに書き留める → 台帳（クラウドを使っていない店でも動く）
 *  本人が出しているなら本人が正しい。取り消した日が台帳側に残っていると
 *  「消したのに復活する」ことになるので、その子ぶんは丸ごと入れ替える。
 *
 *  「出し終えた」を出しただけで 1 日も入れない子も、本人が触った子として扱う
 *  （そうしないと、店が書いた古い希望が残る）。 */
export function mergeWishRows(
  local: Ledger["wishes"],
  localDone: Ledger["wishDone"],
  rows: readonly WishRowIn[],
  done: readonly { castId: string; month: string }[],
): { wishes: Ledger["wishes"]; wishDone: Ledger["wishDone"] } {
  const owned = new Set([...rows.map((r) => r.castId), ...done.map((d) => d.castId)]);

  const wishes: Record<string, Wish[]> = {};
  for (const [date, list] of Object.entries(local ?? {})) {
    const keep = list.filter((w) => !owned.has(w.castId));
    if (keep.length) wishes[date] = keep;
  }
  for (const r of rows) {
    const w: Wish = { castId: r.castId };
    if (r.in) w.in = r.in;
    if (r.out) w.out = r.out;
    if (r.kind === "change" || r.kind === "off") w.kind = r.kind;
    wishes[r.date] = [...(wishes[r.date] ?? []), w];
  }

  const wishDone: Record<string, string[]> = {};
  for (const [castId, months] of Object.entries(localDone ?? {})) {
    if (!owned.has(castId) && months.length) wishDone[castId] = [...months];
  }
  for (const d of done) {
    wishDone[d.castId] = [...new Set([...(wishDone[d.castId] ?? []), d.month])].sort();
  }

  return {
    wishes: Object.keys(wishes).length ? wishes : undefined,
    wishDone: Object.keys(wishDone).length ? wishDone : undefined,
  };
}

/* ---------- 変更のお願い ---------- */

/** 決まったシフトを変えてほしい、という申し出。
 *
 *  入れ物は希望（wishes）と同じ。予定がある日に出された希望は、
 *  意味として変更のお願いそのもので、別に持つと同じことを 2 か所で持つことになる。
 *  見分けは `Wish.kind`。出すときに書くので、あとから当てにいかない。 */
export interface ChangeRequest {
  date: string;
  castId: string;
  name: string;
  kind: "change" | "off";
  /** 変えてほしい時刻（off のときは空） */
  from: string;
  to: string;
  /** いま決まっている時刻 */
  planFrom: string;
  planTo: string;
}

/** その月の変更のお願い。日付順。
 *  予定から外れた日のぶんは出さない（店がもう外していれば、お願いは済んでいる） */
export function changeRequests(L: Ledger, month: string): ChangeRequest[] {
  const out: ChangeRequest[] = [];
  for (const date of Object.keys(L.wishes ?? {}).filter((k) => k.startsWith(month)).sort()) {
    for (const w of wishesOn(L, date)) {
      if (isWant(w)) continue;
      const plan = (L.plans?.[date] ?? []).find((p) => p.castId === w.castId);
      if (!plan) continue;
      const c = L.casts.find((x) => x.id === w.castId);
      out.push({
        date, castId: w.castId, name: c?.name ?? "",
        kind: w.kind === "off" ? "off" : "change",
        from: w.in ?? "", to: w.out ?? "",
        planFrom: plan.in || L.shop.openTime, planTo: plan.out || L.shop.closeTime,
      });
    }
  }
  return out;
}

/** 承認する。休みたいなら予定から外し、時間なら予定の時刻を希望の時刻にする。
 *  通したお願いは消す（残すと、何度でも承認できる一覧になる） */
export function applyRequest(L: Ledger, date: string, castId: string): void {
  const w = wishOf(L, date, castId);
  if (!w || isWant(w)) return;
  const rows = L.plans?.[date];
  if (rows) {
    if (w.kind === "off") {
      L.plans![date] = rows.filter((p) => p.castId !== castId);
      if (!L.plans![date].length) delete L.plans![date];
      if (!Object.keys(L.plans!).length) delete L.plans;
    } else {
      const p = rows.find((x) => x.castId === castId);
      if (p) {
        if (w.in) p.in = w.in; else delete p.in;
        if (w.out) p.out = w.out; else delete p.out;
      }
    }
  }
  toggleWish(L, date, castId);   // お願いを下ろす
}

/** 却下する。予定は動かさず、お願いだけ下ろす */
export function dropRequest(L: Ledger, date: string, castId: string): void {
  const w = wishOf(L, date, castId);
  if (!w || isWant(w)) return;
  toggleWish(L, date, castId);
}

/** お願いを出す（キャスト側）。すでに出ていれば上書きする */
export function putRequest(L: Ledger, date: string, castId: string, kind: "change" | "off",
                           t: { in?: string; out?: string } = {}): void {
  if (!L.wishes) L.wishes = {};
  const cur = (L.wishes[date] ?? []).filter((w) => w.castId !== castId);
  const w: Wish = { castId, kind };
  if (kind === "change") { if (t.in) w.in = t.in; if (t.out) w.out = t.out; }
  L.wishes[date] = [...cur, w];
}

/** 現金が合わないときに、原因の候補を出す。
 *
 *  締めは「足りない ¥3,000」で止まると、夜中の 2 時に一番つらい。
 *  ここで諦めると人は紙に戻るので、差の向きと台帳の中身から候補を絞って見せる。
 *
 *  差額 = 実際に数えた現金 − この日の残り（＝現金売上 − 現金経費 − 給料の現金払い − 銀行入金）
 *
 *  足りない（数えたほうが少ない）… 現金が出ていったのに記録が無い、または売上を多く記録している
 *    日払いの入れ忘れ／現金経費の入れ忘れ／釣り銭の渡し過ぎ／カードでもらったのに現金で打った
 *
 *  多い（数えたほうが多い）… 現金が入ったのに記録が無い、または払った額を多く記録している
 *    売上の打ち忘れ／現金でもらったのに カードで打った／釣り銭の渡し忘れ
 *
 *  ぜんぶ台帳にあるデータで解ける（LLM は要らない）。 */
import { dayCashFlow, dayTotals, dispatchPay, num, payOf } from "./calc";
import { jp, yen } from "./format";
import { activeLines, allowedMin } from "./pos";
import { defaultPosRule } from "./migrate";
import type { Check, Ledger } from "./types";

/** 候補ひとつ。strong は「金額が一致した」手がかりで、一番上に出す */
export interface CashHint { id: string; text: string; strong?: boolean }

export interface CashDiagnosis {
  /** 数えた現金 − この日の残り。マイナスなら足りない */
  diff: number;
  /** 強い順。多くても 3 件（夜中に 6 件並べても読まれない） */
  hints: CashHint[];
}

/** 金額が「近い」と言える差。現金は ¥500・¥1,000 刻みで動くので、固定でよい */
const NEAR = 1000;
const near = (a: number, b: number): boolean => b > 0 && Math.abs(a - b) <= NEAR;

/** 出せる候補の数。多いと読まれない */
const MAX_HINTS = 3;

/** その日その月の平均客単価。今日ぶんは当てにならないので、同じ月の他の日から出す */
export function avgSpend(L: Ledger, dk: string): number {
  const m = dk.slice(0, 7);
  let sales = 0, guests = 0;
  for (const k of Object.keys(L.days)) {
    if (!k.startsWith(m) || k === dk) continue;
    const t = dayTotals(L, k);
    if (t.guests > 0 && t.sales > 0) { sales += t.sales; guests += t.guests; }
  }
  if (guests > 0) return Math.round(sales / guests);
  // 他の日がまだ無ければ、今日ぶんで見る
  const t = dayTotals(L, dk);
  return t.guests > 0 ? Math.round(t.sales / t.guests) : 0;
}

/** その日に働いた人と、渡すはずだった額（すでに日払いした分を引いたあと） */
function owedToday(L: Ledger, dk: string): { name: string; rest: number }[] {
  const d = L.days[dk];
  if (!d) return [];
  const out: { name: string; rest: number }[] = [];
  for (const cid of Object.keys(d.shifts ?? {})) {
    const sh = d.shifts[cid];
    if (!sh?.on) continue;
    const p = payOf(L, cid, sh, dk);
    const c = L.casts.find((x) => x.id === cid);
    out.push({ name: (c?.name ?? "").trim() || "（名前なし）", rest: p.gross - p.paid });
  }
  for (const row of d.dispatch ?? []) {
    const p = dispatchPay(L, row);
    out.push({ name: ((row.name ?? "").trim() || "（名前なし）") + "（派遣）", rest: p.gross - p.paid });
  }
  return out.filter((x) => x.rest > 0).sort((a, b) => b.rest - a.rest);
}

/** 現金の差額から、原因の候補を出す。実査現金が未入力なら null（言うことが無い） */
export function diagnoseCash(L: Ledger, dk: string): CashDiagnosis | null {
  const d = L.days[dk];
  if (!d || d.cashCounted == null || !Number.isFinite(d.cashCounted)) return null;
  const t = dayTotals(L, dk);
  const diff = Math.round(num(d.cashCounted) - dayCashFlow(L, dk).net);
  if (diff === 0) return { diff: 0, hints: [] };

  const hints: CashHint[] = [];
  const push = (id: string, text: string, strong = false) => { hints.push({ id, text, strong }); };

  if (diff < 0) {
    /* ---------- 足りない ---------- */
    const short = -diff;
    const owed = owedToday(L, dk);

    // 一番強い手がかり。差額が誰か 1 人に渡す額とぴったりなら、その人の日払いを疑う
    const one = owed.find((x) => near(short, x.rest));
    if (one) push("paidOne", `${one.name} さんへの日払い ${yen(one.rest)} が、入っていないのかもしれません。`, true);

    // 全員ぶんの合計と一致することもある（まとめて渡したのに入れ忘れ）
    const all = owed.reduce((s, x) => s + x.rest, 0);
    if (!one && owed.length > 1 && near(short, all)) {
      push("paidAll", `その日に働いた ${owed.length}名ぶんの日払い ${yen(all)} が、まとめて入っていないのかもしれません。`, true);
    }

    // 誰も日払いを受け取っていない記録になっている
    if (!one && t.workers > 0 && t.paidCash === 0) {
      push("paidNone", `${t.workers}名が出勤していますが、日払いが 1 件も入っていません。現金で渡していないか確かめてください。`);
    }

    // 現金で払った経費が 1 件も無い
    if (t.expCash === 0) push("expNone", "現金で払った経費が 1 件も入っていません。買い出しやタクシー代がないか確かめてください。");

    if (t.card > 0) push("cardAsCash", "カードでもらった会計を、現金で打っていないか確かめてください。");
    push("change", "お客様に釣り銭を渡し過ぎたのかもしれません。");
  } else {
    /* ---------- 多い ---------- */
    const extra = diff;
    const avg = avgSpend(L, dk);

    // 差額が客単価の倍数に近いなら、伝票ぶんの打ち忘れ
    if (avg > 0) {
      for (let n = 1; n <= 4; n++) {
        if (near(extra, avg * n)) {
          push("guestsMissing", `お客様 ${n}人ぶん（1人あたり平均 ${yen(avg)}）の売上を、打ち忘れているのかもしれません。`, true);
          break;
        }
      }
    }

    if (t.sales === 0) push("noSales", "売上が 0 のままです。伝票を打ち忘れていないか確かめてください。");
    if (t.card > 0) push("cashAsCard", "現金でもらった会計を、カードで打っていないか確かめてください。");
    push("changeKept", `お客様にお釣り ${jp(extra)} 円を渡し忘れていないか確かめてください。`);
  }

  return { diff, hints: hints.slice(0, MAX_HINTS) };
}


/* ==================== 打ち忘れの検知 ==================== */

/** レジは「打てば正しい」が前提だが、忙しいと打ち忘れる。締めのときに聞く。
 *  現金の差額（diagnoseCash）が「何かおかしい」と教え、こちらが「何が」を教える。 */
export interface Miss {
  id: string;
  text: string;
  /** 一番あやしいもの。上に太字で出す */
  strong?: boolean;
  /** 営業中のレジ画面にも出してよいもの。
   *  締めのときだけ意味がある指摘（本数が 0、客数が 0）は営業中に出すと毎回鳴って無視される */
  live?: boolean;
}

/** open のままの伝票を「会計の打ち忘れ」と見なすまでの猶予（終了予定から何分）。
 *  営業中の席を毎回警告すると、すぐ無視されるようになる */
const OPEN_STALE_MIN = 60;

/** 名前を並べる。多いときは 3 つまでで「ほか n件」 */
function names(list: string[]): string {
  if (list.length <= 3) return list.join("・");
  return list.slice(0, 3).join("・") + ` ほか${list.length - 3}件`;
}

/** その営業日の打ち忘れらしいところ。伝票は呼ぶ側から渡す（Dexie に依存しないため） */
export function detectMisses(L: Ledger, dk: string, checks: Check[], now = Date.now()): Miss[] {
  const rule = L.posRule ?? defaultPosRule();
  const d = L.days[dk];
  const t = dayTotals(L, dk);
  const mine = checks.filter((c) => c.date === dk);
  const seatName = (c: Check) => (L.seats ?? []).find((s) => s.id === c.seatId)?.name ?? "席なし";
  const out: Miss[] = [];

  // ① 終了予定を大きく過ぎて入店中のまま。会計そのものが抜けるので一番お金が消える
  const stale = mine.filter((c) => c.status === "open"
    && now - (Date.parse(c.enteredAt) + allowedMin(c, rule) * 60000) > OPEN_STALE_MIN * 60000);
  if (stale.length) {
    out.push({
      id: "openStale",
      text: `${names(stale.map(seatName))} が入店中のままです。会計を打ち忘れていないか確かめてください。`,
      strong: true,
      live: true,
    });
  }

  // ② 会計済みなのに商品が 1 件も無い（セットだけ）。ドリンクの打ち忘れ
  const bare = mine.filter((c) => c.status === "closed" && activeLines(c).length === 0);
  if (bare.length) {
    out.push({
      id: "noItems",
      text: `${names(bare.map(seatName))} の伝票に商品が 1 件も入っていません。ドリンクは本当に出ていませんか？`,
    });
  }

  // ③ 出勤しているのに本数が全部 0 の子。
  //    本数を使っていない店では毎日出てしまうので、誰か 1 人でも入っている日だけ言う
  if (d) {
    const on = Object.keys(d.shifts ?? {}).filter((cid) => d.shifts[cid]?.on);
    const total = (cid: string) => Object.values(d.shifts[cid].backs ?? {}).reduce((a: number, b) => a + num(b), 0);
    const zero = on.filter((cid) => total(cid) === 0);
    if (zero.length && zero.length < on.length) {
      const who = zero.map((cid) => (L.casts.find((x) => x.id === cid)?.name ?? "").trim() || "（名前なし）");
      out.push({
        id: "zeroBacks",
        text: `${names(who)} の本数が全部 0 のままです。ドリンクを付け忘れていないか確かめてください。`,
      });
    }
  }

  // ④ 客数が入っていない。客単価が出ないので、あとの予測も効かなくなる
  if (t.sales > 0 && t.guests === 0) {
    out.push({ id: "noGuests", text: "客数が 0 のままです。人数を入れると、客単価と打ち忘れの見当がつきます。" });
  }

  return out;
}

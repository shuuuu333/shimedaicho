/** 伝票を「操作の記録（ops）」から組み立てる。P3（複数端末で席を共有する）の土台。
 *
 *  なぜ伝票まるごとを送らないか:
 *  2 台が同時に同じ卓を触ったとき、伝票を上書きで送ると
 *  「後から送った方が相手の注文を消す」。
 *  「ビールを 1 本足した」という操作を送れば、両方の注文が残る。
 *
 *  Check.log はもともとこの形に近い。ログを「記録」から「真実」に格上げする。
 *
 *  畳む順番は at（押した時刻）。同時刻は op の id で決めて、どの端末で畳んでも
 *  同じ結果になるようにする。競合の決まりは、順に畳めばそのまま出てくる:
 *  - 注文・延長は全部残る
 *  - 会計は開いているときだけ効く → 先に押した方が通り、後は無視される
 *  - 同じ行の数量を同時に変えたら、後に押した方が残る
 *
 *  ここは純粋関数だけ。台帳も保存層も見ない（金額はすべて op に写してある）。 */
import type { Check, CheckLine, CheckLog, PayKind, SetPlan } from "./types";

export type OpKind =
  | "seed" | "open" | "addLine" | "setQty" | "void" | "setPlan" | "setGuests"
  | "extend" | "discount" | "pay" | "reopen" | "addLate" | "collectTab"
  | "remove" | "restore";

interface OpBase {
  /** 端末が作る id。同じ op を二度畳んでも結果が変わらない（冪等） */
  id: string;
  checkId: string;
  /** 押した時刻。並べ替えの基準 */
  at: string;
  by: string;
  /** 履歴に出す行。押した時点で文言を決めて写す。
   *  こうしておくと、畳む側がキャスト名や店の設定を見に行かなくて済む */
  log?: { act: string; detail?: string }[];
}

export type CheckOp =
  /** 端末の中にある伝票を、そのまま 1 件の操作として置き直す。
   *  端末内から共有へ切り替えるときの種。中身は伝票まるごとなので無損失 */
  | (OpBase & { op: "seed"; check: Check })
  /** enteredAt を渡すと、伝票の入店時刻をそこにする。
   *  閉店後に紙から写すとき、at（押した時刻）と入店時刻は別ものになるため。
   *  並べ替えは at のままなので、畳む順は変わらない */
  | (OpBase & { op: "open"; date: string; seatId: string | null; guests: number; plan: SetPlan; enteredAt?: string })
  | (OpBase & { op: "addLine"; line: CheckLine })
  | (OpBase & { op: "setQty"; lineId: string; qty: number })
  | (OpBase & { op: "void"; lineId: string; reason: string })
  | (OpBase & { op: "setPlan"; plan: SetPlan })
  | (OpBase & { op: "setGuests"; guests: number })
  | (OpBase & { op: "extend"; min: number; price: number })
  | (OpBase & { op: "discount"; name: string; amount: number })
  | (OpBase & { op: "pay"; method: PayKind; amount: number; received?: number; tabName?: string; cardFee?: number })
  | (OpBase & { op: "reopen" })
  | (OpBase & { op: "addLate"; lines: CheckLine[]; collect: boolean; amount?: number; cardFee?: number })
  | (OpBase & { op: "collectTab"; date: string })
  | (OpBase & { op: "remove" })
  | (OpBase & { op: "restore" });

/** 履歴の既定の見出し。op が自分で log を持っていればそちらを使う */
const ACT: Record<OpKind, string> = {
  seed: "引き継ぎ", open: "入店", addLine: "追加", setQty: "数量", void: "取消",
  setPlan: "セットを変える", setGuests: "人数", extend: "延長", discount: "値引き",
  pay: "会計", reopen: "会計を戻す", addLate: "あとから追加", collectTab: "ツケを回収",
  remove: "伝票を消す", restore: "伝票を戻す",
};

/** 畳む順を決める。どの端末でも同じ並びになるよう、同時刻は id で決める */
export function sortOps(ops: CheckOp[]): CheckOp[] {
  return [...ops].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

const int = (v: number): number => Math.floor(Number.isFinite(v) ? v : 0);

/** 操作を順に畳んで、伝票の今の姿を作る。
 *  open がまだ届いていない、または消されているときは null */
export function foldCheck(ops: CheckOp[]): Check | null {
  let c: Check | null = null;
  let removed = false;
  const done = new Set<string>();

  for (const o of sortOps(ops)) {
    if (done.has(o.id)) continue;   // 二度送られても結果は変わらない
    done.add(o.id);

    if (o.op === "seed") {
      // 種は履歴も持っているので、ここでは足さない（二重に出さない）
      if (c) continue;
      c = { ...o.check, extends: [...o.check.extends], lines: o.check.lines.map((l) => ({ ...l })),
            payments: [...o.check.payments], log: [...o.check.log] };
      continue;
    }
    if (o.op === "open") {
      if (c) continue;              // 2 回目の入店は捨てる（同じ伝票は 1 度しか開かない）
      c = {
        id: o.checkId, date: o.date, seatId: o.seatId,
        guests: Math.max(1, int(o.guests)),
        setPrice: Math.max(0, int(o.plan.price)),
        setMinutes: Math.max(1, int(o.plan.min)),
        enteredAt: o.enteredAt || o.at, extends: [], lines: [], payments: [], status: "open", log: [],
      };
      pushLog(c, o);
      continue;
    }
    if (!c) continue;               // 入店がまだ届いていない操作は、届くまで捨てる

    switch (o.op) {
      case "addLine":
        if (!c.lines.some((l) => l.id === o.line.id)) c.lines.push({ ...o.line });
        break;
      case "setQty": {
        const l = c.lines.find((x) => x.id === o.lineId);
        if (l) l.qty = Math.max(1, int(o.qty));
        break;
      }
      case "void": {
        const l = c.lines.find((x) => x.id === o.lineId);
        if (l && !l.voided) l.voided = { at: o.at, by: o.by, reason: o.reason };
        break;
      }
      case "setPlan":
        c.setPrice = Math.max(0, int(o.plan.price));
        c.setMinutes = Math.max(1, int(o.plan.min));
        break;
      case "setGuests":
        c.guests = Math.max(1, int(o.guests));
        break;
      case "extend":
        c.extends.push({ min: int(o.min), price: int(o.price), at: o.at });
        break;
      case "discount":
        if (int(o.amount) <= 0) delete c.discount;
        else c.discount = { name: o.name, amount: int(o.amount) };
        break;
      case "pay":
        // 開いているときだけ効く。だから同時に 2 台が押しても、先の 1 回しか通らない
        if (c.status !== "open") break;
        c.payments = [{ method: o.method, amount: int(o.amount) }];
        if (o.method === "cash" && o.received != null) c.received = int(o.received);
        else delete c.received;
        if (o.method === "tab" && o.tabName) c.tabName = o.tabName;
        else delete c.tabName;
        if (o.cardFee) c.cardFee = int(o.cardFee); else delete c.cardFee;
        c.status = "closed";
        c.closedAt = o.at;
        break;
      case "reopen":
        if (c.status !== "closed") break;
        c.status = "open";
        c.payments = [];
        delete c.received;
        delete c.closedAt;
        delete c.cardFee;
        delete c.tabName;
        break;
      case "addLate":
        if (c.status !== "closed") break;
        for (const l of o.lines) if (!c.lines.some((x) => x.id === l.id)) c.lines.push({ ...l });
        if (o.collect && o.amount != null) {
          c.payments = [{ method: c.payments[0]?.method ?? "cash", amount: int(o.amount) }];
          if (o.cardFee) c.cardFee = int(o.cardFee); else delete c.cardFee;
        }
        break;
      case "collectTab":
        if (!c.tabPaid) c.tabPaid = { at: o.at, date: o.date, by: o.by };
        break;
      case "remove":
        removed = true;
        break;
      case "restore":
        removed = false;
        break;
    }
    pushLog(c, o);
  }

  return removed ? null : c;
}

function pushLog(c: Check, o: CheckOp): void {
  const rows: CheckLog[] = (o.log ?? [{ act: ACT[o.op] }]).map((x) => ({
    at: o.at, by: o.by, act: x.act, ...(x.detail ? { detail: x.detail } : {}),
  }));
  c.log.push(...rows);
}

/* ---------- データベースの行との行き来 ---------- */

/** check_ops の 1 行ぶん。id / checkId / at / by / op は列に、残りは payload にまとめる。
 *  date は列に出す（1 日ぶんを引くため）。持っているのは open と seed だけ */
export interface OpRow {
  id: string;
  check_id: string;
  date: string;
  at: string;
  op: string;
  by_name: string;
  payload: Record<string, unknown>;
}

/** その操作がどの営業日のものか。open と seed だけが自分で持っている */
export function dateOfOp(o: CheckOp): string {
  if (o.op === "open") return o.date;
  if (o.op === "seed") return o.check.date;
  return "";
}

/** 操作を行の形にする */
export function opToRow(o: CheckOp): OpRow {
  const { id, checkId, at, by, op, ...rest } = o as CheckOp & Record<string, unknown>;
  return { id, check_id: checkId, date: dateOfOp(o), at, op, by_name: by, payload: rest };
}

/** 行を操作に戻す。opToRow と往復して中身が落ちないことをテストで固定している */
export function opFromRow(r: OpRow): CheckOp {
  return { id: r.id, checkId: r.check_id, at: r.at, by: r.by_name, op: r.op, ...(r.payload ?? {}) } as unknown as CheckOp;
}

/** 端末の中にある伝票を、共有へ移すための種にする。
 *
 *  営業中には切り替えられないので、閉店後に一度だけ通す想定。
 *  伝票まるごとを 1 件の操作として置くので、履歴も含めて何も落ちない。
 *  これより後の変更は、ふつうの操作として上に積まれる。 */
export function seedOps(checks: Check[], by: string): CheckOp[] {
  return checks.map((check) => ({
    id: `seed:${check.id}`,          // 二度流しても増えない
    checkId: check.id,
    at: check.enteredAt,             // 以降の操作より必ず前に来る
    by,
    op: "seed" as const,
    check,
  }));
}

/** たくさんの伝票ぶんの ops をまとめて畳む。消された伝票は落とす */
export function foldChecks(ops: CheckOp[]): Check[] {
  const byCheck = new Map<string, CheckOp[]>();
  for (const o of ops) {
    const list = byCheck.get(o.checkId);
    if (list) list.push(o); else byCheck.set(o.checkId, [o]);
  }
  const out: Check[] = [];
  for (const list of byCheck.values()) {
    const c = foldCheck(list);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
}

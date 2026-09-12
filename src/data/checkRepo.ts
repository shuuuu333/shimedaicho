/** 伝票の保存層。台帳（Repository）とは別に持つ。
 *  Phase 3 で Supabase 実装に差し替えられるよう、UI からはこのインターフェースだけを見る。 */
import { ShimeDB, type CheckRow, type OpRow } from "./db";
import { dateOfOp, foldCheck, seedOps, sortOps, type CheckOp } from "../domain/checkOps";
import type { Check } from "../domain/types";

export interface CheckRepository {
  /** 操作を 1 つ足して、その伝票を畳み直す。返るのは畳んだあとの姿（消えていれば null）。
   *  同じ op を二度足しても結果は変わらない（id で見分ける） */
  apply(op: CheckOp): Promise<Check | null>;
  /** その伝票に押された操作。まだ送っていないものを拾うのにも使う */
  opsOf(checkId: string): Promise<CheckOp[]>;
  /** まだクラウドへ送っていない操作。押した順に返す */
  pending(): Promise<CheckOp[]>;
  /** 送り終えた印を付ける */
  markSent(ids: string[]): Promise<void>;
  /** 端末の中にある伝票を、操作の記録へ移す。すでに操作がある伝票は触らない */
  seedFromChecks(by?: string): Promise<number>;
  /** その操作をもう持っているか。自分が送った操作が返ってきたときに弾く */
  hasOp(id: string): Promise<boolean>;
  /** 送信待ちの件数 */
  pendingCount(): Promise<number>;
  /** その営業日の伝票を全部（開いているもの・会計済みの両方） */
  byDate(date: string): Promise<Check[]>;
  /** 開いている伝票だけ。日付をまたいで残っていても拾えるようにする */
  open(): Promise<Check[]>;
  /** まだ回収していないツケ。日をまたいで残るので、日付では引けない */
  openTabs(): Promise<Check[]>;
  /** その月（YYYY-MM）の伝票。来店時刻の分析に使う */
  byMonth(month: string): Promise<Check[]>;
  get(id: string): Promise<Check | null>;
  put(c: Check): Promise<void>;
  remove(id: string): Promise<void>;
  /** 書き出し・取り込み用 */
  all(): Promise<Check[]>;
  replaceAll(list: Check[]): Promise<void>;
}

function parse(row: CheckRow): Check | null {
  try { return JSON.parse(row.json) as Check; } catch { return null; }
}
const ok = (list: (Check | null)[]): Check[] => list.filter((x): x is Check => !!x);
const byEntered = (a: Check, b: Check): number => a.enteredAt.localeCompare(b.enteredAt);

function toRow(c: Check): CheckRow {
  return { id: c.id, date: c.date, status: c.status, json: JSON.stringify(c), at: new Date().toISOString() };
}

function toOpRow(o: CheckOp, sent = 0): OpRow {
  return { id: o.id, checkId: o.checkId, date: dateOfOp(o), at: o.at, sent, json: JSON.stringify(o) };
}
function parseOp(row: OpRow): CheckOp | null {
  try { return JSON.parse(row.json) as CheckOp; } catch { return null; }
}

export class LocalCheckRepository implements CheckRepository {
  private db: ShimeDB;
  constructor(db = new ShimeDB()) { this.db = db; }

  async byDate(date: string): Promise<Check[]> {
    return ok((await this.db.checks.where("date").equals(date).toArray()).map(parse)).sort(byEntered);
  }
  async open(): Promise<Check[]> {
    return ok((await this.db.checks.where("status").equals("open").toArray()).map(parse)).sort(byEntered);
  }
  async byMonth(month: string): Promise<Check[]> {
    return ok((await this.db.checks.where("date").startsWith(month).toArray()).map(parse)).sort(byEntered);
  }
  async openTabs(): Promise<Check[]> {
    // 件数が少ない（ツケは例外的な会計）ので、全部読んで絞る。
    // クラウド化するときはここをサーバー側の条件に置き換える
    const all = ok((await this.db.checks.toArray()).map(parse));
    return all.filter((c) => c.status === "closed" && !c.tabPaid
      && c.payments.some((p) => p.method === "tab")).sort(byEntered);
  }
  async get(id: string): Promise<Check | null> {
    const row = await this.db.checks.get(id);
    return row ? parse(row) : null;
  }
  async put(c: Check): Promise<void> {
    await this.db.checks.put(toRow(c));
  }
  async remove(id: string): Promise<void> {
    await this.db.checks.delete(id);
  }

  /* ---------- 操作（ops） ---------- */

  /** 操作を足して、その伝票を畳み直す。
   *  checks に置くのは畳んだ結果で、読み出しを速くするためだけのもの。
   *  真実は ops の方にある（だから ops を送れば、どの端末でも同じ伝票になる） */
  async apply(op: CheckOp): Promise<Check | null> {
    let out: Check | null = null;
    await this.db.transaction("rw", this.db.ops, this.db.checks, async () => {
      const already = await this.db.ops.get(op.id);
      if (!already) await this.db.ops.put(toOpRow(op));
      const rows = await this.db.ops.where("checkId").equals(op.checkId).toArray();
      const ops = rows.map(parseOp).filter((x): x is CheckOp => !!x);
      out = foldCheck(ops);
      if (out) await this.db.checks.put(toRow(out));
      else await this.db.checks.delete(op.checkId);
    });
    return out;
  }

  async opsOf(checkId: string): Promise<CheckOp[]> {
    const rows = await this.db.ops.where("checkId").equals(checkId).toArray();
    return sortOps(rows.map(parseOp).filter((x): x is CheckOp => !!x));
  }

  async pending(): Promise<CheckOp[]> {
    const rows = await this.db.ops.where("sent").equals(0).toArray();
    return sortOps(rows.map(parseOp).filter((x): x is CheckOp => !!x));
  }

  async hasOp(id: string): Promise<boolean> {
    return !!(await this.db.ops.get(id));
  }

  async pendingCount(): Promise<number> {
    return this.db.ops.where("sent").equals(0).count();
  }

  async markSent(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.db.transaction("rw", this.db.ops, async () => {
      for (const id of ids) {
        const row = await this.db.ops.get(id);
        if (row) await this.db.ops.put({ ...row, sent: 1 });
      }
    });
  }
  async all(): Promise<Check[]> {
    return ok((await this.db.checks.toArray()).map(parse)).sort(byEntered);
  }
  /** 取り込み（バックアップの読み込み）。伝票を丸ごと入れ替える。
   *  操作の履歴は作り直せないので、1 件を「引き継ぎ（seed）」の操作として置き直す */
  async replaceAll(list: Check[]): Promise<void> {
    await this.db.transaction("rw", this.db.checks, this.db.ops, async () => {
      await this.db.checks.clear();
      await this.db.ops.clear();
      await this.db.checks.bulkPut(list.map(toRow));
      await this.db.ops.bulkPut(seedOps(list, "取り込み").map((o) => toOpRow(o)));
    });
  }

  /** 端末の中にある伝票を、操作の記録へ移す。
   *  レジを使い始めたのが ops より前だった端末のための引き継ぎ。
   *  すでに操作がある伝票は触らない（二度通しても増えない） */
  async seedFromChecks(by = "引き継ぎ"): Promise<number> {
    let n = 0;
    await this.db.transaction("rw", this.db.checks, this.db.ops, async () => {
      const checks = ok((await this.db.checks.toArray()).map(parse));
      for (const c of checks) {
        const has = await this.db.ops.where("checkId").equals(c.id).count();
        if (has > 0) continue;
        await this.db.ops.put(toOpRow(seedOps([c], by)[0]));
        n++;
      }
    });
    return n;
  }
}

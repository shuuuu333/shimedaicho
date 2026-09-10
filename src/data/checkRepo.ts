/** 伝票の保存層。台帳（Repository）とは別に持つ。
 *  Phase 3 で Supabase 実装に差し替えられるよう、UI からはこのインターフェースだけを見る。 */
import { ShimeDB, type CheckRow } from "./db";
import type { Check } from "../domain/types";

export interface CheckRepository {
  /** その営業日の伝票を全部（開いているもの・会計済みの両方） */
  byDate(date: string): Promise<Check[]>;
  /** 開いている伝票だけ。日付をまたいで残っていても拾えるようにする */
  open(): Promise<Check[]>;
  /** まだ回収していないツケ。日をまたいで残るので、日付では引けない */
  openTabs(): Promise<Check[]>;
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

export class LocalCheckRepository implements CheckRepository {
  private db: ShimeDB;
  constructor(db = new ShimeDB()) { this.db = db; }

  async byDate(date: string): Promise<Check[]> {
    return ok((await this.db.checks.where("date").equals(date).toArray()).map(parse)).sort(byEntered);
  }
  async open(): Promise<Check[]> {
    return ok((await this.db.checks.where("status").equals("open").toArray()).map(parse)).sort(byEntered);
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
  async all(): Promise<Check[]> {
    return ok((await this.db.checks.toArray()).map(parse)).sort(byEntered);
  }
  async replaceAll(list: Check[]): Promise<void> {
    await this.db.transaction("rw", this.db.checks, async () => {
      await this.db.checks.clear();
      await this.db.checks.bulkPut(list.map(toRow));
    });
  }
}

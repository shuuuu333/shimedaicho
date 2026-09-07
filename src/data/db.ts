import Dexie, { type EntityTable } from "dexie";

export interface DocRow { key: string; json: string; at: string }
export interface SnapshotRow { id: number; at: string; size: number; reason: string; days: number; json: string }
export interface MetaRow { key: string; value: string | null }
/** 伝票。台帳(docs)とは別に持つ。
 *  台帳は丸ごと 1 つの JSON としてクラウドに載るので、そこに明細を入れると肥大化して同期が重くなる。
 *  日報に落ちるのは集計値だけで、明細はここに残る（date で 1 日ぶんを引く）。 */
export interface CheckRow { id: string; date: string; status: string; json: string; at: string }

export class ShimeDB extends Dexie {
  docs!: EntityTable<DocRow, "key">;
  snapshots!: EntityTable<SnapshotRow, "id">;
  meta!: EntityTable<MetaRow, "key">;
  checks!: EntityTable<CheckRow, "id">;
  constructor(name = "shimedaicho") {
    super(name);
    this.version(1).stores({
      docs: "key",
      snapshots: "++id, at",
      meta: "key",
    });
    // v2: レジの伝票を足す。既存のストアはそのまま（Dexie が差分だけ適用する）
    this.version(2).stores({
      checks: "id, date, status, [date+status]",
    });
  }
}

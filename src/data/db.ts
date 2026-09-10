import Dexie, { type EntityTable } from "dexie";

export interface DocRow { key: string; json: string; at: string }
export interface SnapshotRow { id: number; at: string; size: number; reason: string; days: number; json: string }
export interface MetaRow { key: string; value: string | null }
/** 伝票。台帳(docs)とは別に持つ。
 *  台帳は丸ごと 1 つの JSON としてクラウドに載るので、そこに明細を入れると肥大化して同期が重くなる。
 *  日報に落ちるのは集計値だけで、明細はここに残る（date で 1 日ぶんを引く）。 */
export interface CheckRow { id: string; date: string; status: string; json: string; at: string }
/** 伝票に対して押された操作。追記だけで、書き換えない。
 *  伝票（checks）は、この操作を順に畳んだ結果を置いてあるだけ（読み出しを速くするため）。
 *  クラウドと同期するのはこちらで、checks は端末ごとに作り直せる。
 *  sent が 0 のあいだは「まだ送っていない」＝送信待ちの列 */
export interface OpRow { id: string; checkId: string; date: string; at: string; sent: number; json: string }

export class ShimeDB extends Dexie {
  docs!: EntityTable<DocRow, "key">;
  snapshots!: EntityTable<SnapshotRow, "id">;
  meta!: EntityTable<MetaRow, "key">;
  checks!: EntityTable<CheckRow, "id">;
  ops!: EntityTable<OpRow, "id">;
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
    // v3: 伝票に押した操作。複数端末で同じ卓を触っても消し合わないようにするため、
    //     送るのは伝票まるごとではなく操作にする（domain/checkOps.ts で畳む）
    this.version(3).stores({
      ops: "id, checkId, date, sent, [checkId+at]",
    });
  }
}

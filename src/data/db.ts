import Dexie, { type EntityTable } from "dexie";

export interface DocRow { key: string; json: string; at: string }
export interface SnapshotRow { id: number; at: string; size: number; reason: string; days: number; json: string }
export interface MetaRow { key: string; value: string | null }

export class ShimeDB extends Dexie {
  docs!: EntityTable<DocRow, "key">;
  snapshots!: EntityTable<SnapshotRow, "id">;
  meta!: EntityTable<MetaRow, "key">;
  constructor(name = "shimedaicho") {
    super(name);
    this.version(1).stores({
      docs: "key",
      snapshots: "++id, at",
      meta: "key",
    });
  }
}

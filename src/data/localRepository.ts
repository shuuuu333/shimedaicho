/** IndexedDB（Dexie）への保存。単一ドキュメント + 直近 30 世代のスナップショット。 */
import { ShimeDB } from "./db";
import type { Meta, Repository, SnapshotInfo } from "./repository";
import type { Ledger } from "../domain/types";
import { migrate } from "../domain/migrate";

const MAX_SNAPSHOTS = 30;
/** 自動スナップショットの最短間隔（ms） */
const AUTO_SNAPSHOT_GAP = 10 * 60 * 1000;

export class LocalRepository implements Repository {
  private db: ShimeDB;
  private lastAutoSnapshotAt = 0;
  constructor(db = new ShimeDB()) { this.db = db; }

  async load(): Promise<Ledger | null> {
    const row = await this.db.docs.get("ledger");
    if (!row) return null;
    try { return migrate(JSON.parse(row.json)); } catch { return null; }
  }

  async save(ledger: Ledger, reason = "auto"): Promise<void> {
    const json = JSON.stringify(ledger);
    const at = new Date().toISOString();
    await this.db.transaction("rw", this.db.docs, this.db.meta, async () => {
      await this.db.docs.put({ key: "ledger", json, at });
      await this.db.meta.put({ key: "lastSavedAt", value: at });
    });
    const now = Date.now();
    if (reason !== "auto" || now - this.lastAutoSnapshotAt > AUTO_SNAPSHOT_GAP) {
      this.lastAutoSnapshotAt = now;
      await this.addSnapshot(json, at, reason, Object.keys(ledger.days).length);
    }
  }

  async snapshot(ledger: Ledger, reason: string): Promise<void> {
    await this.addSnapshot(JSON.stringify(ledger), new Date().toISOString(), reason, Object.keys(ledger.days).length);
  }

  private async addSnapshot(json: string, at: string, reason: string, days: number): Promise<void> {
    await this.db.transaction("rw", this.db.snapshots, async () => {
      await this.db.snapshots.add({ at, size: json.length, reason, days, json } as never);
      const n = await this.db.snapshots.count();
      if (n > MAX_SNAPSHOTS) {
        const old = await this.db.snapshots.orderBy("id").limit(n - MAX_SNAPSHOTS).primaryKeys();
        await this.db.snapshots.bulkDelete(old);
      }
    });
  }

  async meta(): Promise<Meta> {
    const rows = await this.db.meta.toArray();
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
    return { lastSavedAt: get("lastSavedAt"), lastBackupAt: get("lastBackupAt") };
  }
  async setMeta(patch: Partial<Meta>): Promise<void> {
    const rows = Object.entries(patch).map(([key, value]) => ({ key, value: value ?? null }));
    await this.db.meta.bulkPut(rows);
  }

  async snapshots(): Promise<SnapshotInfo[]> {
    const rows = await this.db.snapshots.orderBy("id").reverse().toArray();
    return rows.map(({ id, at, size, reason, days }) => ({ id, at, size, reason, days }));
  }
  async loadSnapshot(id: number): Promise<Ledger | null> {
    const row = await this.db.snapshots.get(id);
    if (!row) return null;
    try { return migrate(JSON.parse(row.json)); } catch { return null; }
  }
}

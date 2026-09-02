/** 保存層のインターフェース。Phase2 で Supabase 実装を差し込めるように、UI はこの型だけを見る。 */
import type { Ledger } from "../domain/types";

export interface SnapshotInfo {
  id: number;
  /** ISO 日時 */
  at: string;
  /** JSON のバイト数 */
  size: number;
  /** 記録された理由: auto / import / restore / manual */
  reason: string;
  days: number;
}

export interface Meta {
  lastSavedAt: string | null;
  lastBackupAt: string | null;
}

export interface Repository {
  load(): Promise<Ledger | null>;
  save(ledger: Ledger, reason?: string): Promise<void>;
  meta(): Promise<Meta>;
  setMeta(patch: Partial<Meta>): Promise<void>;
  snapshots(): Promise<SnapshotInfo[]>;
  loadSnapshot(id: number): Promise<Ledger | null>;
  /** 手動スナップショット（取り込み前など） */
  snapshot(ledger: Ledger, reason: string): Promise<void>;
}

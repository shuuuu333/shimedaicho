/** 伝票の操作をクラウドと行き来させる。P3 の同期の司令塔。
 *
 *  守っていること
 *  - 送れなくてもレジは止めない。操作は端末（Dexie）に必ず先に書き、
 *    送信待ちの列に積むだけ。つながった瞬間に追いつく
 *  - 同じ操作を二度送っても増えない。id は端末で作り、サーバー側は
 *    その id で 1 つにまとめる（check_ops は追記だけ）
 *  - 自分が送った操作が Realtime で返ってきても、id で見分けて捨てる
 *  - 「黙って遅れている」のが一番怖いので、未送信の件数を画面に出す
 *
 *  オフラインで他端末へ届けることは原理的にできない。できるのは
 *  「切れていても自分の端末では打ち続けられ、つながった瞬間に追いつく」まで。 */
import * as api from "../data/cloud";
import type { CheckRepository } from "../data/checkRepo";
import type { CheckOp } from "../domain/checkOps";
import { useCloud } from "./cloud";

/** 送り直しを試みる間隔。短すぎると電波が悪いときに叩き続ける */
const RETRY_MS = 20000;

export interface SyncDeps {
  repo: CheckRepository;
  /** 受け取った操作を畳んで画面に出す */
  onRemote: (op: CheckOp) => Promise<void>;
  /** 未送信の件数が変わったとき */
  onPending: (n: number) => void;
  /** 送れなかった理由（画面に出す。null で消す） */
  onError: (msg: string | null) => void;
}

export class OpsSync {
  private d: SyncDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;
  private shopId: string | null = null;
  /** 送信中は重ねて走らせない */
  private busy = false;
  private bound = false;

  constructor(deps: SyncDeps) { this.d = deps; }

  /** いま同期できるか。店が決まっていて、キャストでないとき（サーバー側でも弾く） */
  private can(): boolean {
    try {
      const c = useCloud.getState();
      return api.cloudConfigured && !!c.shopId && !!c.session && c.role() !== "cast";
    } catch { return false; }
  }

  /** 店が決まったら呼ぶ。購読と送り直しを始める */
  start(): void {
    const shopId = this.can() ? useCloud.getState().shopId : null;
    if (shopId === this.shopId) { void this.flush(); return; }
    this.stop();
    this.shopId = shopId;
    if (!shopId) { void this.report(); return; }

    try {
      this.unsub = api.subscribeOps(shopId, (op) => { void this.receive(op); });
    } catch { /* 購読できなくても送信はできる */ }
    this.timer = setInterval(() => { void this.flush(); }, RETRY_MS);
    if (!this.bound) {
      this.bound = true;
      window.addEventListener("online", () => { void this.flush(); });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void this.flush();
      });
    }
    void this.flush();
  }

  stop(): void {
    if (this.unsub) { this.unsub(); this.unsub = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.shopId = null;
  }

  /** 送信待ちを送る。失敗したら列に残したままにして、次の機会に送る */
  async flush(): Promise<void> {
    if (this.busy) return;
    const shopId = this.shopId;
    if (!shopId || !this.can()) { await this.report(); return; }
    this.busy = true;
    try {
      const pending = await this.d.repo.pending();
      if (pending.length) {
        await api.pushOps(shopId, pending);
        await this.d.repo.markSent(pending.map((o) => o.id));
      }
      this.d.onError(null);
    } catch (e) {
      this.d.onError(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy = false;
      await this.report();
    }
  }

  /** ほかの端末が押した操作を取り込む。自分のぶんは id で弾く */
  private async receive(op: CheckOp): Promise<void> {
    try {
      if (await this.d.repo.hasOp(op.id)) return;
      await this.d.onRemote(op);
    } catch { /* 1 件取り込めなくても、次の追いつきで拾える */ }
  }

  /** つながり直したときの追いつき。その営業日ぶんと、開いている伝票を読み直す */
  async catchUp(date: string, openIds: string[]): Promise<void> {
    const shopId = this.shopId;
    if (!shopId || !this.can()) return;
    try {
      const ops = [
        ...(await api.pullOpsByDate(shopId, date)),
        ...(openIds.length ? await api.pullOpsByChecks(shopId, openIds) : []),
      ];
      for (const op of ops) await this.receive(op);
      this.d.onError(null);
    } catch (e) {
      this.d.onError(e instanceof Error ? e.message : String(e));
    }
  }

  private async report(): Promise<void> {
    try { this.d.onPending(await this.d.repo.pendingCount()); } catch { /* ignore */ }
  }
}

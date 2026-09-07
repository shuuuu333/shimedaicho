/** レジ（伝票）の状態。台帳のストア（useApp）とは別に持つ。
 *  伝票は Dexie の checks に直接書き、会計が済んだ時点で日報へ反映する。 */
import { create } from "zustand";
import { produce } from "immer";
import type { Check, Ledger, MenuItem } from "../domain/types";
import { businessDate, lineFromMenu, newCheck, normalizeCheck } from "../domain/pos";
import { defaultPosRule } from "../domain/migrate";
import { applyChecksToDay } from "../domain/close";
import { LocalCheckRepository, type CheckRepository } from "../data/checkRepo";
import { useApp } from "./store";
import { useCloud } from "./cloud";

/** 記録に残す「誰が」。ログインしていればメール、していなければ端末 */
function whoAmI(): string {
  try {
    const c = useCloud.getState();
    return c.email || (c.session ? "ログイン中" : "端末");
  } catch { return "端末"; }
}
const nowISO = (): string => new Date().toISOString();

export interface PosStore {
  loaded: boolean;
  /** 今の営業日 */
  date: string;
  /** その営業日の伝票（開いているもの・会計済みの両方）と、日をまたいで開いたままの伝票 */
  checks: Check[];
  /** 伝票画面で開いている伝票 */
  activeId: string | null;
  error: string | null;

  init(): Promise<void>;
  reload(): Promise<void>;
  /** 指定した営業日の伝票を、もう一度日報へ反映する。
   *  日報で「レジに戻す」を押したときに使う（その日の伝票を読み直す） */
  reapply(date: string): Promise<void>;
  setActive(id: string | null): void;

  /** 入店。セット料金はその場で選んだ値を伝票に写す */
  openSeat(seatId: string | null, guests: number, setPrice: number): Promise<string>;
  addItem(id: string, item: MenuItem, castId?: string): Promise<void>;
  setQty(id: string, lineId: string, qty: number): Promise<void>;
  voidLine(id: string, lineId: string, reason: string): Promise<void>;
  setSetPrice(id: string, price: number): Promise<void>;
  setGuests(id: string, guests: number): Promise<void>;
  /** 延長。分数と 1 人あたりの料金を、押した時点の値で記録する */
  extend(id: string, min: number, price: number): Promise<void>;
  setDiscount(id: string, name: string, amount: number): Promise<void>;
  pay(id: string, method: "cash" | "card", total: number, received?: number): Promise<void>;
  reopen(id: string): Promise<void>;
  removeCheck(id: string): Promise<void>;
}

export function createPosStore(repo: CheckRepository) {
  return create<PosStore>()((set, get) => {
    /** 伝票を 1 枚書き換えて保存し、必要なら日報に反映する */
    async function write(id: string, mut: (c: Check) => void): Promise<void> {
      const before = get().checks.find((c) => c.id === id);
      if (!before) return;
      const after = produce(before, mut);
      set({ checks: get().checks.map((c) => (c.id === id ? after : c)) });
      try {
        await repo.put(after);
        reflect();
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    }

    /** その営業日の伝票を日報に反映する。
     *  会計の済んだ伝票が 1 枚も無いうちは日報を作らない（「入力済み ○日」を実態と合わせるため） */
    function reflect(): void {
      const { date, checks } = get();
      const mine = checks.filter((c) => c.date === date);
      const app = useApp.getState();
      if (!mine.some((c) => c.status === "closed") && !app.ledger.days[date]) return;
      app.editDay(date, (d, L: Ledger) => { applyChecksToDay(d, mine, L); });
    }

    return {
      loaded: false,
      date: "",
      checks: [],
      activeId: null,
      error: null,

      async init() {
        if (get().loaded) return;
        await get().reload();
        set({ loaded: true });
      },

      async reload() {
        const L = useApp.getState().ledger;
        const date = businessDate(new Date(), L.shop);
        const rule = L.posRule ?? defaultPosRule();
        try {
          const [today, open] = await Promise.all([repo.byDate(date), repo.open()]);
          // 日をまたいで開いたままの伝票も拾う（閉め忘れをレジ画面に出す）
          const byId = new Map(today.map((c) => [c.id, normalizeCheck(c, rule)]));
          for (const c of open) if (!byId.has(c.id)) byId.set(c.id, normalizeCheck(c, rule));
          set({ date, checks: [...byId.values()], error: null });
        } catch (e) {
          set({ date, error: e instanceof Error ? e.message : String(e) });
        }
      },

      async reapply(date) {
        try {
          const rule = useApp.getState().ledger.posRule ?? defaultPosRule();
          const list = (await repo.byDate(date)).map((c) => normalizeCheck(c, rule));
          useApp.getState().editDay(date, (d, L: Ledger) => { applyChecksToDay(d, list, L); });
          // 今の営業日なら、画面が持っている伝票も更新しておく
          if (date === get().date) set({ checks: list });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
        }
      },

      setActive(id) { set({ activeId: id }); },

      async openSeat(seatId, guests, setPrice) {
        const c = newCheck(get().date, seatId, guests, setPrice, nowISO(), whoAmI());
        set({ checks: [...get().checks, c], activeId: c.id });
        await repo.put(c);
        return c.id;
      },

      async addItem(id, item, castId) {
        // 履歴は人が読むものなので、キャストは id ではなく名前で残す
        const name = castId ? useApp.getState().ledger.casts.find((c) => c.id === castId)?.name : undefined;
        await write(id, (c) => {
          c.lines.push(lineFromMenu(item, nowISO(), castId));
          c.log.push({ at: nowISO(), by: whoAmI(), act: "追加", detail: item.name + (name ? `／${name}` : "") });
        });
      },

      async setQty(id, lineId, qty) {
        await write(id, (c) => {
          const l = c.lines.find((x) => x.id === lineId);
          if (!l) return;
          const n = Math.max(1, Math.floor(qty));
          if (n === l.qty) return;
          c.log.push({ at: nowISO(), by: whoAmI(), act: "数量", detail: `${l.name} ${l.qty} → ${n}` });
          l.qty = n;
        });
      },

      async voidLine(id, lineId, reason) {
        await write(id, (c) => {
          const l = c.lines.find((x) => x.id === lineId);
          if (!l || l.voided) return;
          l.voided = { at: nowISO(), by: whoAmI(), reason };
          c.log.push({ at: nowISO(), by: whoAmI(), act: "取消", detail: `${l.name}×${l.qty}／${reason}` });
        });
      },

      async setSetPrice(id, price) {
        await write(id, (c) => {
          const p = Math.max(0, Math.floor(price));
          if (p === c.setPrice) return;
          c.log.push({ at: nowISO(), by: whoAmI(), act: "セット料金", detail: `¥${c.setPrice} → ¥${p}／人` });
          c.setPrice = p;
        });
      },

      async setGuests(id, guests) {
        await write(id, (c) => {
          const n = Math.max(1, Math.floor(guests));
          if (n === c.guests) return;
          c.log.push({ at: nowISO(), by: whoAmI(), act: "人数", detail: `${c.guests} → ${n}` });
          c.guests = n;
        });
      },

      async extend(id, min, price) {
        await write(id, (c) => {
          c.extends.push({ min, price, at: nowISO() });
          c.log.push({ at: nowISO(), by: whoAmI(), act: "延長", detail: `＋${min}分 ¥${price}／人` });
        });
      },

      async setDiscount(id, name, amount) {
        await write(id, (c) => {
          const a = Math.max(0, Math.floor(amount));
          if (a <= 0) { delete c.discount; c.log.push({ at: nowISO(), by: whoAmI(), act: "値引き取消" }); return; }
          c.discount = { name, amount: a };
          c.log.push({ at: nowISO(), by: whoAmI(), act: "値引き", detail: `${name} ¥${a}` });
        });
      },

      async pay(id, method, total, received) {
        await write(id, (c) => {
          if (c.status === "closed") return;
          c.payments = [{ method, amount: total }];
          if (method === "cash" && received != null) c.received = Math.floor(received);
          c.status = "closed";
          c.closedAt = nowISO();
          c.log.push({ at: nowISO(), by: whoAmI(), act: "会計", detail: `${method === "cash" ? "現金" : "カード"} ¥${total}` });
        });
        set({ activeId: null });
      },

      async reopen(id) {
        await write(id, (c) => {
          if (c.status !== "closed") return;
          c.status = "open";
          c.payments = [];
          delete c.received;
          delete c.closedAt;
          c.log.push({ at: nowISO(), by: whoAmI(), act: "会計を戻す" });
        });
        set({ activeId: id });
      },

      async removeCheck(id) {
        set({ checks: get().checks.filter((c) => c.id !== id), activeId: null });
        await repo.remove(id);
        reflect();
      },
    };
  });
}

export const usePos = createPosStore(new LocalCheckRepository());

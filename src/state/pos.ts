/** レジ（伝票）の状態。台帳のストア（useApp）とは別に持つ。
 *  伝票は Dexie の checks に直接書き、会計が済んだ時点で日報へ反映する。 */
import { create } from "zustand";
import type { Check, Ledger, MenuItem, PayKind, SetPlan } from "../domain/types";
import { applyCardFee, businessDate, checkTotals, lineFromMenu, normalizeCheck, planLabel } from "../domain/pos";
import { defaultPosRule } from "../domain/migrate";
import { uid } from "../domain/format";
import { MANUAL_TAB_COLLECTED, applyChecksToDay, setManual } from "../domain/close";
import { LocalCheckRepository, type CheckRepository } from "../data/checkRepo";
import type { CheckOp } from "../domain/checkOps";
import { useApp } from "./store";
import { useCloud } from "./cloud";
import { bindPosStore, notifyPos } from "./notify";

/** 記録に残す「誰が」。招待のときに入れた名前を先に見る。
 *  メールだけを見ていると、LINE でログインしたキャストが全員「ログイン中」になり、
 *  誰が会計したのか分からなくなる（不正防止は記録が残ることが土台なので、ここが空だと成立しない） */
function whoAmI(): string {
  try {
    return useCloud.getState().myName();
  } catch { return "端末"; }
}
const nowISO = (): string => new Date().toISOString();

/** 通知に出す席の名前 */
function seatNameOf(c: Check): string {
  const L = useApp.getState().ledger;
  return (L.seats ?? []).find((s) => s.id === c.seatId)?.name ?? "席なし";
}

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
  /** まだ回収していないツケを読む。日をまたいで残るので日付では引けない */
  openTabs(): Promise<Check[]>;
  /** その月の伝票を読むだけ（画面の状態は変えない）。来店時刻の分析に使う */
  checksOfMonth(month: string): Promise<Check[]>;
  /** ツケを回収したことにする。その伝票に印を付け、回収した営業日の日報に額を足す */
  collectTab(id: string, date: string): Promise<void>;
  /** 指定した営業日の伝票を読むだけ（画面の状態は変えない）。
   *  日報は今の営業日以外も開けるので、打ち忘れの検知と削除の確認はこれで引く */
  checksOf(date: string): Promise<Check[]>;
  setActive(id: string | null): void;

  /** 入店。セット料金はその場で選んだ値を伝票に写す */
  /** 入店。選んだセット（時間と料金）をその場で伝票に写す */
  openSeat(seatId: string | null, guests: number, plan: SetPlan): Promise<string>;
  addItem(id: string, item: MenuItem, castId?: string): Promise<void>;
  setQty(id: string, lineId: string, qty: number): Promise<void>;
  voidLine(id: string, lineId: string, reason: string): Promise<void>;
  /** セットを変える。時間も一緒に変えられる（40分コースへの入れ替えなど） */
  setSetPlan(id: string, plan: SetPlan): Promise<void>;
  setGuests(id: string, guests: number): Promise<void>;
  /** 延長。分数と 1 人あたりの料金を、押した時点の値で記録する */
  extend(id: string, min: number, price: number): Promise<void>;
  setDiscount(id: string, name: string, amount: number): Promise<void>;
  /** 会計する。合計はここで伝票から出し直すので、呼び出し側の total は画面の確認用 */
  pay(id: string, method: PayKind, total: number, received?: number, tabName?: string): Promise<void>;
  reopen(id: string): Promise<void>;
  /** 会計済みの伝票に、あとから注文を足す（「戻す → 追加 → 会計」の 3 手を 1 手にする）。
   *  合計が変わるので collect で「実際に受け取ったか」を分ける。
   *  false なら受け取った額は元のまま＝その差は取り損ね。
   *  黙って売上を増やすと、現金が合わなくなる */
  addLate(id: string, items: { item: MenuItem; castId?: string }[], collect: boolean): Promise<void>;
  removeCheck(id: string): Promise<void>;
  /** その営業日の伝票をまとめて消す。消した伝票を返すので、取り消しで戻せる */
  removeByDate(date: string): Promise<Check[]>;
  /** 消した伝票を戻す（取り消し用） */
  restore(list: Check[]): Promise<void>;
}

export function createPosStore(repo: CheckRepository) {
  return create<PosStore>()((set, get) => {
    /** 操作を 1 つ足して、畳んだ結果を画面と保存層に反映する。
     *
     *  伝票まるごとを書かずに操作を足すのは、複数端末で同じ卓を触ったときに
     *  消し合わないため（domain/checkOps.ts）。ここが「押したこと」の入口になる。 */
    async function apply(op: CheckOp): Promise<Check | null> {
      try {
        const after = await repo.apply(op);
        const list = get().checks;
        const has = list.some((c) => c.id === op.checkId);
        if (!after) set({ checks: list.filter((c) => c.id !== op.checkId) });
        else set({ checks: has ? list.map((c) => (c.id === op.checkId ? after : c)) : [...list, after] });
        reflect();
        return after;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    }

    /** 操作の共通部分。id は端末で作るので、送り直しても二重にならない */
    const base = (checkId: string) => ({ id: uid(), checkId, at: nowISO(), by: whoAmI() });

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
        // レジを使い始めたのが「操作の記録」より前だった端末のための引き継ぎ。
        // 伝票を 1 件ずつ seed の操作として置き直す（何度通しても増えない）
        try { await repo.seedFromChecks(); } catch { /* 引き継げなくてもレジは動く */ }
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

      async checksOfMonth(month) {
        const rule = useApp.getState().ledger.posRule ?? defaultPosRule();
        try {
          return (await repo.byMonth(month)).map((c) => normalizeCheck(c, rule));
        } catch {
          return [];
        }
      },

      async openTabs() {
        const rule = useApp.getState().ledger.posRule ?? defaultPosRule();
        try {
          return (await repo.openTabs()).map((c) => normalizeCheck(c, rule));
        } catch {
          return [];
        }
      },

      async collectTab(id, date) {
        const c = await repo.get(id);
        if (!c || c.tabPaid) return;
        const amount = c.payments.reduce((s2, p) => s2 + (p.method === "tab" ? Math.floor(p.amount) : 0), 0);
        if (amount <= 0) return;
        const after = await repo.apply({
          ...base(id), op: "collectTab", date,
          log: [{ act: "ツケを回収", detail: `${c.tabName ?? "（名前なし）"} ¥${amount}` }],
        });
        if (!after) return;
        // 回収した日の現金として足す。レジの反映では触らない欄なので、直接足す
        useApp.getState().editDay(date, (d) => {
          d.tabCollected = (d.tabCollected ?? 0) + amount;
          setManual(d, MANUAL_TAB_COLLECTED, true);
        });
        if (after.date === get().date) {
          set({ checks: get().checks.map((x) => (x.id === id ? after : x)) });
        }
      },

      async checksOf(date) {
        const rule = useApp.getState().ledger.posRule ?? defaultPosRule();
        try {
          return (await repo.byDate(date)).map((c) => normalizeCheck(c, rule));
        } catch {
          return [];
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

      async openSeat(seatId, guests, plan) {
        const at = nowISO();
        const by = whoAmI();
        const checkId = uid();
        const n = Math.max(1, Math.floor(guests));
        await apply({
          id: uid(), checkId, at, by, op: "open",
          date: get().date, seatId, guests: n, plan,
          log: [{ act: "入店", detail: `${n}名 ／ ${planLabel(plan)}／人` }],
        });
        // お通し・チャージのように「入店したら人数ぶん」の商品を、その場で入れておく。
        // 毎回手で押していたぶんを消す（消したいときは行をタップして取り消せる）
        const auto = (useApp.getState().ledger.menu ?? []).filter((m) => m.active && m.autoOnEntry && m.kind === "normal");
        for (const m of auto) {
          await apply({
            id: uid(), checkId, at, by, op: "addLine",
            line: lineFromMenu(m, at, undefined, n),
            log: [{ act: "自動で追加", detail: `${m.name} × ${n}名` }],
          });
        }
        set({ activeId: checkId });
        const c = get().checks.find((x) => x.id === checkId);
        if (c) notifyPos({ kind: "enter", at, seat: seatNameOf(c), guests: c.guests });
        return checkId;
      },

      async addItem(id, item, castId) {
        // 履歴は人が読むものなので、キャストは id ではなく名前で残す
        const name = castId ? useApp.getState().ledger.casts.find((c) => c.id === castId)?.name : undefined;
        const b = base(id);
        await apply({
          ...b, op: "addLine", line: lineFromMenu(item, b.at, castId),
          log: [{ act: "追加", detail: item.name + (name ? `／${name}` : "") }],
        });
      },

      async setQty(id, lineId, qty) {
        const l = get().checks.find((c) => c.id === id)?.lines.find((x) => x.id === lineId);
        if (!l) return;
        const n = Math.max(1, Math.floor(qty));
        if (n === l.qty) return;
        await apply({
          ...base(id), op: "setQty", lineId, qty: n,
          log: [{ act: "数量", detail: `${l.name} ${l.qty} → ${n}` }],
        });
      },

      async voidLine(id, lineId, reason) {
        const before = get().checks.find((x) => x.id === id)?.lines.find((x) => x.id === lineId);
        if (!before || before.voided) return;
        await apply({
          ...base(id), op: "void", lineId, reason,
          log: [{ act: "取消", detail: `${before.name}×${before.qty}／${reason}` }],
        });
        const c = get().checks.find((x) => x.id === id);
        // 取消は「現金の抜き取り」の入口なので、オーナーにその場で知らせる
        if (c) {
          notifyPos({ kind: "void", at: nowISO(), seat: seatNameOf(c), name: `${before.name}×${before.qty}`, reason, by: whoAmI() });
        }
      },

      async setSetPlan(id, plan) {
        const rule = useApp.getState().ledger.posRule ?? defaultPosRule();
        const c = get().checks.find((x) => x.id === id);
        if (!c) return;
        const p = Math.max(0, Math.floor(plan.price));
        const m = Math.max(1, Math.floor(plan.min));
        const wasM = c.setMinutes != null && c.setMinutes > 0 ? c.setMinutes : rule.setMinutes;
        if (p === c.setPrice && m === wasM) return;
        await apply({
          ...base(id), op: "setPlan", plan: { min: m, price: p },
          log: [{ act: "セットを変える",
                  detail: `${planLabel({ min: wasM, price: c.setPrice })} → ${planLabel({ min: m, price: p })}／人` }],
        });
      },

      async setGuests(id, guests) {
        const c = get().checks.find((x) => x.id === id);
        if (!c) return;
        const n = Math.max(1, Math.floor(guests));
        if (n === c.guests) return;
        await apply({
          ...base(id), op: "setGuests", guests: n,
          log: [{ act: "人数", detail: `${c.guests} → ${n}` }],
        });
      },

      async extend(id, min, price) {
        const b = base(id);
        await apply({
          ...b, op: "extend", min, price,
          log: [{ act: "延長", detail: `＋${min}分 ¥${price}／人` }],
        });
        const c = get().checks.find((x) => x.id === id);
        if (c) notifyPos({ kind: "extend", at: b.at, seat: seatNameOf(c), min });
      },

      async setDiscount(id, name, amount) {
        const b = base(id);
        const a = Math.max(0, Math.floor(amount));
        await apply({
          ...b, op: "discount", name, amount: a,
          log: a <= 0 ? [{ act: "値引き取消" }] : [{ act: "値引き", detail: `${name} ¥${a}` }],
        });
        const c = get().checks.find((x) => x.id === id);
        if (c && a > 0) notifyPos({ kind: "discount", at: b.at, seat: seatNameOf(c), amount: a, by: b.by });
      },

      async pay(id, method, _total, received, tabName) {
        const L = useApp.getState().ledger;
        const rule = L.posRule ?? defaultPosRule();
        const c = get().checks.find((x) => x.id === id);
        if (!c || c.status === "closed") return;
        // 金額は押した時点で確定させ、操作に写す。あとから店の設定が変わっても動かない
        const draft: Check = { ...c, cardFee: undefined };
        applyCardFee(draft, rule, L.shop.cardFeeRate, method === "card" ? "card" : "cash");
        const amount = checkTotals(draft, rule).total;
        const who = method === "tab" ? (tabName ?? "").trim() : "";
        const fee = draft.cardFee ? `（うちカード手数料 ¥${draft.cardFee}）` : "";
        const how = method === "cash" ? "現金" : method === "card" ? "カード" : `ツケ${who ? `／${who}` : ""}`;
        await apply({
          ...base(id), op: "pay", method, amount,
          ...(method === "cash" && received != null ? { received: Math.floor(received) } : {}),
          ...(who ? { tabName: who } : {}),
          ...(draft.cardFee ? { cardFee: draft.cardFee } : {}),
          log: [{ act: "会計", detail: `${how} ¥${amount}${fee}` }],
        });
        set({ activeId: null });
        const done = get().checks.find((x) => x.id === id);
        if (done?.status === "closed") {
          notifyPos({
            kind: "pay", at: done.closedAt ?? nowISO(), seat: seatNameOf(done), guests: done.guests,
            amount: done.payments[0]?.amount ?? 0, method: done.payments[0]?.method ?? "cash", tabName: done.tabName,
          });
        }
      },

      async addLate(id, items, collect) {
        if (!items.length) return;
        const L = useApp.getState().ledger;
        const rule = L.posRule ?? defaultPosRule();
        const label = items
          .map(({ item, castId }) => {
            const n = castId ? L.casts.find((c) => c.id === castId)?.name : undefined;
            return item.name + (n ? `／${n}` : "");
          })
          .join("・");
        const c = get().checks.find((x) => x.id === id);
        if (!c || c.status !== "closed") return;
        const b = base(id);
        // 比べるのは「実際に受け取った額」。計算上の合計と比べると、
        // 前に足して受け取らなかったぶんがあるときに、画面と記録が食い違う
        const before = c.payments[0]?.amount ?? checkTotals(c, rule).total;
        const lines = items.map(({ item, castId }) => lineFromMenu(item, b.at, castId));
        const method = c.payments[0]?.method ?? "cash";
        // 足したぶんにもカード手数料を掛け直す（受け取る場合だけ）
        const draft: Check = { ...c, lines: [...c.lines, ...lines], cardFee: undefined };
        if (collect) applyCardFee(draft, rule, L.shop.cardFeeRate, method === "card" ? "card" : "cash");
        const after = checkTotals(draft, rule).total;
        await apply({
          ...b, op: "addLate", lines, collect,
          ...(collect ? { amount: after } : {}),
          ...(collect && draft.cardFee ? { cardFee: draft.cardFee } : {}),
          log: [
            { act: "あとから追加", detail: label },
            collect
              ? { act: "追加分を受け取った", detail: `¥${before} → ¥${after}` }
              // 受け取った額は動かさない。バックの本数だけ増える（実際に出しているので）
              : { act: "追加分は受け取っていない", detail: `取り損ね ¥${after - before}` },
          ],
        });
      },

      async reopen(id) {
        // 支払い方法が決まっていない状態に戻す（畳む側が cardFee・tabName も落とす）
        await apply({ ...base(id), op: "reopen", log: [{ act: "会計を戻す" }] });
        set({ activeId: id });
      },

      async removeByDate(date) {
        const all = await repo.byDate(date);
        for (const c of all) await apply({ ...base(c.id), op: "remove", log: [{ act: "伝票を消す" }] });
        set({ activeId: null });
        return all;
      },

      async restore(list) {
        // 消したのを取り消す。操作は消さずに「戻した」を足す（履歴が途切れない）
        for (const c of list) await apply({ ...base(c.id), op: "restore", log: [{ act: "伝票を戻す" }] });
        await get().reload();
        reflect();
      },

      async removeCheck(id) {
        set({ activeId: null });
        await apply({ ...base(id), op: "remove", log: [{ act: "伝票を消す" }] });
      },
    };
  });
}

export const usePos = createPosStore(new LocalCheckRepository());

// 通知に「いま何組入っているか」を添えるために、伝票を読む口を渡しておく。
// notify → pos の import を作ると循環するので、こちらから渡す
bindPosStore(usePos);

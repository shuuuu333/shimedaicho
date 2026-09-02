/** アプリの状態。台帳（Ledger）と画面状態（UI）を 1 つの zustand ストアに持つ。
 *  台帳の変更は update() 経由（immer で不変更新）→ 300ms 後に保存層へ書き込む。 */
import { create } from "zustand";
import { produce } from "immer";
import type { DayRecord, Ledger } from "../domain/types";
import { defaultLedger, emptyDay } from "../domain/migrate";
import { todayISO } from "../domain/format";
import type { Repository } from "../data/repository";
import { LocalRepository } from "../data/localRepository";

export type SaveState = "loading" | "saving" | "saved" | "error";
export type Tab = "month" | "day" | "cast" | "set";
export type Sheet = { kind: "cast"; id: string } | { kind: "disp"; id: string } | null;

export interface UIState {
  tab: Tab;
  month: string;
  day: string;
  /** 日報ウィザードのステップ 0..4 */
  step: number;
  monthMode: "chart" | "cal";
  calDay: string | null;
  castDetail: string | null;
  /** 設定画面で強調するセクション id */
  setFocus: string | null;
  sheet: Sheet;
}

export interface ToastState { key: number; msg: string; undo: (() => void) | null }

export interface AppStore {
  ledger: Ledger;
  loaded: boolean;
  save: SaveState;
  lastSavedAt: string | null;
  lastBackupAt: string | null;
  ui: UIState;
  toast: ToastState | null;

  init(): Promise<void>;
  setUI(patch: Partial<UIState>): void;
  /** 台帳を変更する。mut は draft を直接書き換えてよい */
  update(mut: (L: Ledger) => void): void;
  /** 変更して、6 秒間「元に戻す」を出す */
  updateWithUndo(msg: string, mut: (L: Ledger) => void): void;
  /** 取り込み・復元など台帳を丸ごと置き換える */
  replaceLedger(L: Ledger, reason: string): Promise<void>;
  showToast(msg: string): void;
  hideToast(): void;
  undo(): void;
  markBackedUp(): Promise<void>;
  flush(): Promise<void>;
  /** 日報を開く（レコードは最初の入力時に作る） */
  openDay(dk: string, step?: number): void;
  /** その日の日報を変更する。無ければ作る */
  editDay(dk: string, mut: (d: DayRecord, L: Ledger) => void): void;
  goSettings(section: string | null): void;
}

const SAVE_DELAY = 300;
const UNDO_MS = 6000;

export function createAppStore(repo: Repository) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let toastKey = 0;

  const store = create<AppStore>()((set, get) => {
    async function persist() {
      timer = null;
      if (!dirty) return;
      dirty = false;
      const L = get().ledger;
      try {
        await repo.save(L);
        if (!dirty) set({ save: "saved", lastSavedAt: new Date().toISOString() });
      } catch (e) {
        console.error("save failed", e);
        dirty = true;
        set({ save: "error" });
        timer = setTimeout(persist, 5000);
      }
    }
    function schedule() {
      dirty = true;
      set({ save: "saving" });
      if (timer) clearTimeout(timer);
      timer = setTimeout(persist, SAVE_DELAY);
    }
    function toast(msg: string, undo: (() => void) | null, ms: number) {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: { key: ++toastKey, msg, undo } });
      toastTimer = setTimeout(() => set({ toast: null }), ms);
    }

    const t = todayISO();
    return {
      ledger: defaultLedger(),
      loaded: false,
      save: "loading",
      lastSavedAt: null,
      lastBackupAt: null,
      ui: { tab: "month", month: t.slice(0, 7), day: t, step: 0, monthMode: "chart", calDay: null, castDetail: null, setFocus: null, sheet: null },
      toast: null,

      async init() {
        try {
          const [L, meta] = await Promise.all([repo.load(), repo.meta()]);
          let mode: "chart" | "cal" = "chart";
          try { if (localStorage.getItem("shimedaicho.mode") === "cal") mode = "cal"; } catch { /* ignore */ }
          set({
            ledger: L ?? defaultLedger(), loaded: true, save: "saved",
            lastSavedAt: meta.lastSavedAt, lastBackupAt: meta.lastBackupAt,
            ui: { ...get().ui, monthMode: mode },
          });
        } catch (e) {
          console.error("load failed", e);
          set({ loaded: true, save: "error" });
        }
      },
      setUI(patch) { set({ ui: { ...get().ui, ...patch } }); },
      update(mut) {
        set({ ledger: produce(get().ledger, mut) });
        schedule();
      },
      updateWithUndo(msg, mut) {
        const prev = get().ledger;
        set({ ledger: produce(prev, mut) });
        schedule();
        toast(msg, () => { set({ ledger: prev }); schedule(); }, UNDO_MS);
      },
      async replaceLedger(L, reason) {
        try { await repo.snapshot(get().ledger, "before-" + reason); } catch { /* ignore */ }
        set({ ledger: L });
        dirty = true;
        set({ save: "saving" });
        if (timer) clearTimeout(timer);
        timer = null;
        dirty = false;
        try {
          await repo.save(L, reason);
          set({ save: "saved", lastSavedAt: new Date().toISOString() });
        } catch (e) {
          console.error(e);
          set({ save: "error" });
        }
      },
      showToast(msg) { toast(msg, null, 2200); },
      hideToast() { if (toastTimer) clearTimeout(toastTimer); set({ toast: null }); },
      undo() {
        const tt = get().toast;
        get().hideToast();
        if (tt?.undo) { tt.undo(); toast("元に戻しました", null, 2000); }
      },
      async markBackedUp() {
        const at = new Date().toISOString();
        set({ lastBackupAt: at });
        try { await repo.setMeta({ lastBackupAt: at }); } catch { /* ignore */ }
      },
      async flush() {
        if (timer) { clearTimeout(timer); timer = null; }
        await persist();
      },
      openDay(dk, step) {
        set({ ui: { ...get().ui, tab: "day", day: dk, step: step ?? get().ui.step, sheet: null } });
        window.scrollTo(0, 0);
      },
      editDay(dk, mut) {
        get().update((L) => {
          if (!L.days[dk]) L.days[dk] = emptyDay();
          mut(L.days[dk], L);
        });
      },
      goSettings(section) {
        set({ ui: { ...get().ui, tab: "set", setFocus: section } });
      },
    };
  });
  return store;
}

export const useApp = createAppStore(new LocalRepository());

if (typeof window !== "undefined") {
  const flush = () => { void useApp.getState().flush(); };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

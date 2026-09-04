/** クラウド同期の状態と同期エンジン。useApp の台帳変更を監視して Supabase へ送り、他端末の変更を取り込む。 */
import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Ledger } from "../domain/types";
import { migrate } from "../domain/migrate";
import * as api from "../data/cloud";
import { diffDirty, emptyDirty, mergeLedger, parseDirty, serializeDirty, type Dirty } from "../data/merge";
import { useApp } from "./store";
import { LocalRepository } from "../data/localRepository";

export type CloudStatus = "off" | "signedout" | "noshop" | "syncing" | "synced" | "offline" | "error";

export interface CloudState {
  configured: boolean;
  session: Session | null;
  email: string | null;
  shops: api.ShopRow[];
  shopId: string | null;
  members: api.MemberRow[];
  status: CloudStatus;
  lastSyncAt: string | null;
  error: string | null;
  linkSent: boolean;
  busy: boolean;

  init(): Promise<void>;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  refreshShops(): Promise<void>;
  createShop(name: string): Promise<void>;
  selectShop(id: string | null): Promise<void>;
  renameShop(name: string): Promise<void>;
  addMember(email: string): Promise<void>;
  removeMember(email: string): Promise<void>;
  syncNow(): Promise<void>;
  isOwner(): boolean;
}

const LS_SHOP = "shimedaicho.shopId";
const LS_VERSION = "shimedaicho.cloudVersion";
const LS_DIRTY = "shimedaicho.dirty";
const PUSH_DELAY = 1500;

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

const snapshotRepo = new LocalRepository();

export const useCloud = create<CloudState>()((set, get) => {
  let dirty: Dirty = parseDirty(lsGet(LS_DIRTY));
  let version: number | null = lsGet(LS_VERSION) ? Number(lsGet(LS_VERSION)) : null;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let applying = false;
  let unsubRealtime: (() => void) | null = null;
  let pushing = false;

  const saveDirty = () => lsSet(LS_DIRTY, serializeDirty(dirty));
  const setVersion = (v: number | null) => { version = v; lsSet(LS_VERSION, v == null ? null : String(v)); };
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  function applyLedger(L: Ledger) {
    applying = true;
    try { useApp.getState().applyExternal(L); } finally { applying = false; }
  }

  /** 端末の台帳をクラウドへ。衝突したら取り込み直してマージして再送 */
  async function push(): Promise<void> {
    const { shopId, session } = get();
    if (!shopId || !session || pushing) return;
    if (!navigator.onLine) { set({ status: "offline" }); return; }
    pushing = true;
    set({ status: "syncing", error: null });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const L = useApp.getState().ledger;
        const sentDirty: Dirty = { days: new Set(dirty.days), meta: dirty.meta };
        const r = await api.pushLedger(shopId, L, version);
        if (r.ok) {
          setVersion(r.version);
          // 送信中に増えた分だけ残す
          for (const k of sentDirty.days) dirty.days.delete(k);
          if (sentDirty.meta) dirty.meta = false;
          saveDirty();
          set({ status: "synced", lastSyncAt: new Date().toISOString() });
          return;
        }
        const remote = await api.pullLedger(shopId);
        if (!remote) { setVersion(null); continue; }
        const merged = mergeLedger(migrate(remote.data), useApp.getState().ledger, dirty);
        setVersion(remote.version);
        applyLedger(merged);
      }
      set({ status: "error", error: "他の端末と同時に変更されました。もう一度お試しください" });
    } catch (e) {
      set({ status: navigator.onLine ? "error" : "offline", error: msg(e) });
    } finally {
      pushing = false;
      if (dirty.days.size || dirty.meta) schedulePush();
    }
  }
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; void push(); }, PUSH_DELAY);
  }

  /** 店を選んだとき・起動時：クラウドを取り込む（無ければ端末の台帳を上げる） */
  async function pull(): Promise<void> {
    const { shopId } = get();
    if (!shopId) return;
    if (!navigator.onLine) { set({ status: "offline" }); return; }
    set({ status: "syncing", error: null });
    try {
      const remote = await api.pullLedger(shopId);
      const local = useApp.getState().ledger;
      if (!remote) {
        setVersion(null);
        dirty = { days: new Set(Object.keys(local.days)), meta: true }; saveDirty();
        await push();
        return;
      }
      const remoteL = migrate(remote.data);
      // この端末で初めて同期するときは、端末にある日報をクラウドに足す（消さない）
      if (version == null) {
        for (const k of Object.keys(local.days)) dirty.days.add(k);
        if ((local.casts.length || Object.keys(local.days).length) && !remoteL.casts.length && !Object.keys(remoteL.days).length) dirty.meta = true;
        saveDirty();
      }
      if (remote.version !== version || dirty.days.size || dirty.meta) {
        try { await snapshotRepo.snapshot(local, "before-sync"); } catch { /* ignore */ }
        const merged = mergeLedger(remoteL, local, dirty);
        setVersion(remote.version);
        applyLedger(merged);
        if (dirty.days.size || dirty.meta) { await push(); return; }
      }
      set({ status: "synced", lastSyncAt: new Date().toISOString() });
    } catch (e) {
      set({ status: navigator.onLine ? "error" : "offline", error: msg(e) });
    }
  }

  function watchRealtime() {
    unsubRealtime?.(); unsubRealtime = null;
    const { shopId } = get();
    if (!shopId) return;
    unsubRealtime = api.subscribeLedger(shopId, (row) => {
      if (version != null && row.version <= version) return;
      const merged = mergeLedger(migrate(row.data), useApp.getState().ledger, dirty);
      setVersion(row.version);
      applyLedger(merged);
      set({ status: dirty.days.size || dirty.meta ? get().status : "synced", lastSyncAt: new Date().toISOString() });
      if (dirty.days.size || dirty.meta) schedulePush();
    });
  }

  async function afterSession(session: Session | null) {
    set({ session, email: session?.user.email ?? null });
    if (!session) {
      unsubRealtime?.(); unsubRealtime = null;
      set({ status: api.cloudConfigured ? "signedout" : "off", shops: [], members: [] });
      return;
    }
    await get().refreshShops();
    const saved = lsGet(LS_SHOP);
    const shops = get().shops;
    const id = saved && shops.some((s) => s.id === saved) ? saved : shops.length === 1 ? shops[0].id : null;
    await get().selectShop(id);
  }

  // 台帳の変更を監視（クラウドからの反映中は無視）
  useApp.subscribe((s, prev) => {
    if (applying || s.ledger === prev.ledger) return;
    diffDirty(prev.ledger, s.ledger, dirty);
    saveDirty();
    if (get().shopId && get().session) schedulePush();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { if (get().shopId) void pull(); });
    window.addEventListener("offline", () => { if (get().shopId) set({ status: "offline" }); });
  }

  return {
    configured: api.cloudConfigured,
    session: null, email: null, shops: [], shopId: null, members: [],
    status: api.cloudConfigured ? "signedout" : "off", lastSyncAt: null, error: null, linkSent: false, busy: false,

    async init() {
      if (!api.cloudConfigured) return;
      try {
        const s = await api.getSession();
        await afterSession(s);
        api.onAuth((s2) => {
          const cur = get().session;
          if ((s2?.user.id ?? null) !== (cur?.user.id ?? null)) void afterSession(s2);
          else set({ session: s2 });
        });
      } catch (e) { set({ status: "error", error: msg(e) }); }
    },
    async signIn(email) {
      set({ busy: true, error: null });
      try { await api.signInWithEmail(email.trim()); set({ linkSent: true }); }
      catch (e) { set({ error: msg(e) }); }
      finally { set({ busy: false }); }
    },
    async signOut() {
      set({ busy: true });
      try { await api.signOut(); } catch (e) { set({ error: msg(e) }); }
      finally { set({ busy: false, linkSent: false }); }
    },
    async refreshShops() {
      try { set({ shops: await api.listShops() }); } catch (e) { set({ error: msg(e) }); }
    },
    async createShop(name) {
      const { email } = get();
      if (!email) return;
      set({ busy: true, error: null });
      try {
        const shop = await api.createShop(name.trim() || "店", email);
        await get().refreshShops();
        await get().selectShop(shop.id);
        const L = useApp.getState().ledger;
        if (!L.shop.name && name.trim()) useApp.getState().update((d) => { d.shop.name = name.trim(); });
      } catch (e) { console.error("createShop", e); set({ error: msg(e) }); }
      finally { set({ busy: false }); }
    },
    async selectShop(id) {
      unsubRealtime?.(); unsubRealtime = null;
      if (id !== get().shopId) { setVersion(null); dirty = emptyDirty(); saveDirty(); }
      lsSet(LS_SHOP, id);
      set({ shopId: id, members: [] });
      if (!id) { set({ status: "noshop" }); return; }
      try { set({ members: await api.listMembers(id) }); } catch { /* staff は見えない場合がある */ }
      await pull();
      watchRealtime();
    },
    async renameShop(name) {
      const { shopId } = get();
      if (!shopId) return;
      try { await api.renameShop(shopId, name); await get().refreshShops(); } catch (e) { set({ error: msg(e) }); }
    },
    async addMember(email) {
      const { shopId } = get();
      if (!shopId) return;
      set({ busy: true, error: null });
      try { await api.addMember(shopId, email); set({ members: await api.listMembers(shopId) }); }
      catch (e) { set({ error: msg(e) }); }
      finally { set({ busy: false }); }
    },
    async removeMember(email) {
      const { shopId } = get();
      if (!shopId) return;
      set({ busy: true, error: null });
      try { await api.removeMember(shopId, email); set({ members: await api.listMembers(shopId) }); }
      catch (e) { set({ error: msg(e) }); }
      finally { set({ busy: false }); }
    },
    async syncNow() {
      if (dirty.days.size || dirty.meta) await push(); else await pull();
    },
    isOwner() {
      const { session, shops, shopId } = get();
      const shop = shops.find((s) => s.id === shopId);
      return !!(session && shop && shop.owner === session.user.id);
    },
  };
});

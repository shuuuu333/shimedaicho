/** Supabase との通信（認証・店・メンバー・台帳）。環境変数が無ければ supabase は null で、同期機能は出ない。 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Ledger } from "../domain/types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
export const cloudConfigured = !!supabase;

export interface ShopRow { id: string; name: string; owner: string; created_at: string }
export interface MemberRow { shop_id: string; email: string; role: "owner" | "staff"; created_at: string }
export interface RemoteLedger { data: unknown; version: number; updated_at: string; updated_by: string | null }

function sb(): SupabaseClient {
  if (!supabase) throw new Error("クラウド同期が設定されていません");
  return supabase;
}
function fail(e: { message?: string } | null, what: string): never {
  throw new Error(`${what}: ${e?.message ?? "不明なエラー"}`);
}

/* ---------- 認証 ---------- */
export async function getSession(): Promise<Session | null> {
  const { data } = await sb().auth.getSession();
  return data.session;
}
export function onAuth(cb: (s: Session | null) => void): () => void {
  const { data } = sb().auth.onAuthStateChange((_e, s) => cb(s));
  return () => data.subscription.unsubscribe();
}
export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await sb().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
  if (error) fail(error, "ログインメールを送れませんでした");
}
export async function signOut(): Promise<void> {
  const { error } = await sb().auth.signOut();
  if (error) fail(error, "ログアウトできませんでした");
}

/* ---------- 店・メンバー ---------- */
export async function listShops(): Promise<ShopRow[]> {
  const { data, error } = await sb().from("shops").select("*").order("created_at");
  if (error) fail(error, "店の一覧を取れませんでした");
  return (data ?? []) as ShopRow[];
}
export async function createShop(name: string, ownerEmail: string): Promise<ShopRow> {
  const { data: u } = await sb().auth.getUser();
  const owner = u.user?.id;
  if (!owner) throw new Error("ログインしていません");
  const { data, error } = await sb().from("shops").insert({ name, owner }).select("*").single();
  if (error) fail(error, "店を作れませんでした");
  const shop = data as ShopRow;
  await sb().from("shop_members").insert({ shop_id: shop.id, email: ownerEmail.toLowerCase(), role: "owner" });
  return shop;
}
export async function renameShop(shopId: string, name: string): Promise<void> {
  const { error } = await sb().from("shops").update({ name }).eq("id", shopId);
  if (error) fail(error, "店名を変えられませんでした");
}
export async function listMembers(shopId: string): Promise<MemberRow[]> {
  const { data, error } = await sb().from("shop_members").select("*").eq("shop_id", shopId).order("created_at");
  if (error) fail(error, "メンバーを取れませんでした");
  return (data ?? []) as MemberRow[];
}
export async function addMember(shopId: string, email: string): Promise<void> {
  const { error } = await sb().from("shop_members").insert({ shop_id: shopId, email: email.trim().toLowerCase(), role: "staff" });
  if (error) fail(error, "メンバーを追加できませんでした");
}
export async function removeMember(shopId: string, email: string): Promise<void> {
  const { error } = await sb().from("shop_members").delete().eq("shop_id", shopId).eq("email", email);
  if (error) fail(error, "メンバーを外せませんでした");
}

/* ---------- 台帳 ---------- */
export async function pullLedger(shopId: string): Promise<RemoteLedger | null> {
  const { data, error } = await sb().from("ledgers").select("data, version, updated_at, updated_by").eq("shop_id", shopId).maybeSingle();
  if (error) fail(error, "台帳を取れませんでした");
  return (data as RemoteLedger | null) ?? null;
}

export type PushResult = { ok: true; version: number } | { ok: false; conflict: true };

/** expectVersion が null なら新規作成。version が合わなければ conflict */
export async function pushLedger(shopId: string, ledger: Ledger, expectVersion: number | null): Promise<PushResult> {
  const c = sb();
  if (expectVersion == null) {
    const { data, error } = await c.from("ledgers").insert({ shop_id: shopId, data: ledger }).select("version").single();
    if (error) {
      if (error.code === "23505") return { ok: false, conflict: true };
      fail(error, "台帳を保存できませんでした");
    }
    return { ok: true, version: (data as { version: number }).version };
  }
  const { data, error } = await c.from("ledgers").update({ data: ledger }).eq("shop_id", shopId).eq("version", expectVersion).select("version");
  if (error) fail(error, "台帳を保存できませんでした");
  const rows = (data ?? []) as { version: number }[];
  if (!rows.length) return { ok: false, conflict: true };
  return { ok: true, version: rows[0].version };
}

/** 他端末の変更を受け取る */
export function subscribeLedger(shopId: string, cb: (row: RemoteLedger) => void): () => void {
  const ch = sb()
    .channel("ledger:" + shopId)
    .on("postgres_changes", { event: "*", schema: "public", table: "ledgers", filter: `shop_id=eq.${shopId}` }, (payload) => {
      const row = payload.new as Partial<RemoteLedger> | undefined;
      if (row && typeof row.version === "number") cb(row as RemoteLedger);
    })
    .subscribe();
  return () => { void sb().removeChannel(ch); };
}

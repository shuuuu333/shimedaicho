/** Supabase との通信（認証・店・メンバー・台帳）。環境変数が無ければ supabase は null で、同期機能は出ない。 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Ledger } from "../domain/types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
export const cloudConfigured = !!supabase;

export interface ShopRow { id: string; name: string; owner: string; created_at: string }
export type MemberRole = "owner" | "staff" | "cast";
export interface MemberRow { shop_id: string; email: string; role: MemberRole; created_at: string; name?: string | null; user_id?: string | null }
export interface InviteRow { token: string; shop_id: string; role: "staff" | "cast"; name: string; cast_id: string | null; expires_at: string; used_at: string | null }
export interface Redeemed { shop_id: string; shop_name: string; role: string; cast_id: string | null }
export interface RemoteLedger { data: unknown; version: number; updated_at: string; updated_by: string | null }

function sb(): SupabaseClient {
  if (!supabase) throw new Error("クラウド同期が設定されていません");
  return supabase;
}
/** Supabase のエラーを日本語にする */
function authMessage(e: { message?: string; code?: string; status?: number } | null, what: string): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "over_email_send_rate_limit" || /rate limit|too many/i.test(msg))
    return "メールを送りすぎです。1 分ほど待ってから、もう一度お試しください。";
  if (code === "otp_expired" || /expired/i.test(msg))
    return "コードの期限が切れています。もう一度メールを送ってください。";
  if (code === "invalid_credentials" || /invalid|token/i.test(msg))
    return "コードが違います。メールの数字をもう一度確かめてください。";
  if (code === "email_address_invalid" || /invalid.*email/i.test(msg))
    return "メールアドレスの形が正しくないようです。";
  if (code === "signup_disabled" || /signups? not allowed/i.test(msg))
    return "新しいアカウントを作れない設定になっています。オーナーに伝えてください。";
  if (e?.status === 0 || /fetch|network/i.test(msg))
    return "通信できませんでした。電波を確かめて、もう一度お試しください。";
  return `${what}: ${msg || "不明なエラー"}`;
}
function fail(e: { message?: string; code?: string; status?: number } | null, what: string): never {
  throw new Error(authMessage(e, what));
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
  const { error } = await sb().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) fail(error, "ログインメールを送れませんでした");
}
/** メールに書かれた 6 桁のコードでログイン */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await sb().auth.verifyOtp({ email, token: code.replace(/\D/g, ""), type: "email" });
  if (error) fail(error, "コードが違うか、期限切れです");
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
export async function addMember(shopId: string, email: string, role: "staff" | "cast" = "staff"): Promise<void> {
  const { error } = await sb().from("shop_members").insert({ shop_id: shopId, email: email.trim().toLowerCase(), role });
  if (error) fail(error, "メンバーを追加できませんでした");
}
export async function removeMember(shopId: string, email: string): Promise<void> {
  const { error } = await sb().from("shop_members").delete().eq("shop_id", shopId).eq("email", email);
  if (error) fail(error, "メンバーを外せませんでした");
}

/* ---------- QR での招待 ---------- */

/** 期限つき・1回だけの招待を作る。token を QR に入れる */
export async function createInvite(shopId: string, role: "staff" | "cast", name: string, castId: string | null, minutes = 30): Promise<InviteRow> {
  const expires = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const { data, error } = await sb().from("shop_invites")
    .insert({ shop_id: shopId, role, name: name.trim(), cast_id: castId, expires_at: expires })
    .select("*").single();
  if (error) fail(error, "招待を作れませんでした");
  return data as InviteRow;
}
export async function cancelInvite(token: string): Promise<void> {
  await sb().from("shop_invites").delete().eq("token", token);
}
/** 名前を持たない匿名のログイン。QR を読んだ人に使う */
export async function signInAnonymously(): Promise<void> {
  const { error } = await sb().auth.signInAnonymously();
  if (error) fail(error, "ログインできませんでした");
}
/** QR の token を使って、自分をその店のメンバーにする */
export async function redeemInvite(token: string): Promise<Redeemed> {
  const { data, error } = await sb().rpc("redeem_invite", { t: token });
  if (error) fail(error, "招待を使えませんでした");
  const row = (Array.isArray(data) ? data[0] : data) as Redeemed | null;
  if (!row || !row.shop_id) throw new Error("この招待は使えませんでした");
  return row;
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

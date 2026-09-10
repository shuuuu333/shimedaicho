// 日報を LINE に送るための中継。
//
// なぜ中継が要るか: LINE のチャネルアクセストークンは、持っていれば誰でもその
// 公式アカウントとして送信できる鍵。ブラウザに置くと配ってしまうことになるので、
// Supabase の Secrets に置いて、ここからだけ使う。
//
// 呼べるのは「その店のオーナーとスタッフ」。文面はアプリ側（calc.ts を持っている方）が
// 作って渡す。ここは中身を組み立てない。
//
// スタッフも通せるようにしてあるのは、営業中の通知のため。
// 通知の値打ちは「オーナーが店にいないとき」に出るので、カウンターに立っている
// スタッフの端末から送れないと意味がない。キャストは通さない。
//
// 必要な Secrets:
//   LINE_CHANNEL_TOKEN  … Messaging API のチャネルアクセストークン（長期）
//   LINE_TO             … 送信先の LINE ユーザーID（省略すると友だち全員へ broadcast）
//
// ダッシュボードの Edge Functions からこのファイルを貼って Deploy する。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** LINE のテキストは 5000 文字まで。余裕を見て切る */
const MAX_TEXT = 2000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST してください" }, 405);

  const token = Deno.env.get("LINE_CHANNEL_TOKEN");
  if (!token) return json({ error: "LINE_CHANNEL_TOKEN が設定されていません" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "ログインが必要です" }, 401);

  let shopId = "";
  let text = "";
  try {
    const body = await req.json();
    shopId = String(body?.shopId ?? "");
    text = String(body?.text ?? "").slice(0, MAX_TEXT);
  } catch {
    return json({ error: "リクエストの形が正しくありません" }, 400);
  }
  if (!shopId || !text.trim()) return json({ error: "shopId と text が要ります" }, 400);

  // 呼んだ人の権限で読む。オーナーでなければ、この先へ進ませない
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return json({ error: "ログインが確認できません" }, 401);

  // my_role() は security definer で、その店での役割（owner / staff / cast）を返す。
  // ここで判定を 1 か所に寄せておくと、招待の仕組みが変わっても付いてくる
  const { data: role, error } = await supabase.rpc("my_role", { sid: shopId });
  if (error) return json({ error: "店を確認できませんでした" }, 500);
  if (role !== "owner" && role !== "staff") {
    return json({ error: "この店のオーナーとスタッフだけが送れます" }, 403);
  }

  // 送信先が決まっていれば その人へ、無ければ 友だち全員へ
  const to = Deno.env.get("LINE_TO");
  const url = to
    ? "https://api.line.me/v2/bot/message/push"
    : "https://api.line.me/v2/bot/message/broadcast";
  const payload = to
    ? { to, messages: [{ type: "text", text }] }
    : { messages: [{ type: "text", text }] };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: "LINE に送れませんでした", status: res.status, detail: detail.slice(0, 500) }, 502);
  }
  return json({ ok: true, sentTo: to ? "指定の相手" : "友だち全員" });
});

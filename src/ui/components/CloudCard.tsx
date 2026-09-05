import { useState } from "react";
import { useCloud } from "../../state/cloud";
import { Notice } from "./Notice";
import { Trash } from "../icons";
import { useApp } from "../../state/store";
import { LoginForm } from "./LoginForm";

const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** 設定画面の「クラウド同期」カード */
export function CloudCard() {
  const c = useCloud();
  const [shopName, setShopName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"staff" | "cast">("staff");
  const L = useApp((s) => s.ledger);
  const update = useApp((s) => s.update);
  const shop = c.shops.find((s) => s.id === c.shopId) ?? null;
  const showToast = useApp((s) => s.showToast);

  /** LINE などで送る案内文。コードはメールで本人に届くので、ここではリンクと手順を渡す */
  const inviteText = (email: string, role: string) => {
    const url = window.location.origin + window.location.pathname;
    const what = role === "cast" ? "自分のシフトと給料が見られます。" : "日報の入力とシフトが見られます。";
    return [
      `${L.shop.name || "お店"}の「締め台帳」に招待しました。`,
      what,
      "",
      "▼はじめかた",
      `1. このリンクを開く\n${url}`,
      `2. 「ログインして始める」を押して、${email} を入れる`,
      "3. そのアドレスに届く6桁のコードを入れる",
      "",
      "※コードはメールに届きます。迷惑メールもご確認ください。",
      "※ホーム画面に追加すると、アプリのように使えます。",
    ].join("\n");
  };
  const sendInvite = async (email: string, role: string) => {
    const text = inviteText(email, role);
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      showToast("案内をコピーしました。LINEなどに貼ってください");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      try { await navigator.clipboard.writeText(text); showToast("案内をコピーしました"); }
      catch { showToast("コピーできませんでした"); }
    }
  };
  const owner = c.isOwner();

  if (!c.configured) {
    return (
      <div className="card" id="set-cloud">
        <h2>クラウド同期</h2>
        <p className="sub">いまは端末内保存だけです。複数の端末やスタッフと同じデータを使うには Supabase を設定します。</p>
        <div className="hint">手順は <code>docs/Supabase設定手順.md</code>。設定すると、ここにログイン欄が出ます。</div>
      </div>
    );
  }

  const statusText: Record<string, string> = {
    signedout: "ログインしていません", noshop: "店を選んでください", syncing: "同期中…",
    synced: `同期済み ${fmtAt(c.lastSyncAt)}`, offline: "オフライン（端末に保存中。つながると同期します）", error: "同期エラー", off: "",
  };

  return (
    <div className="card" id="set-cloud">
      <h2>クラウド同期</h2>
      <p className="sub">ログインして店を選ぶと、スマホ・PC・スタッフの端末で同じデータになります。オフラインでも入力でき、つながったときに同期します。</p>

      {!c.session ? (
        <LoginForm />
      ) : (
        <>
          <div className="lrow"><div className="g"><div className="t">{c.email}</div><div className="s">{statusText[c.status] || "ログイン済み"}</div></div>
            <button type="button" className="btn sm ghost" disabled={c.busy} onClick={() => c.signOut()}>ログアウト</button></div>
          {c.error && <div style={{ marginTop: 8 }}><Notice bad>{c.error}</Notice></div>}

          <div className="sec">
            <span className="lbl" style={{ display: "block", fontSize: 11.5, color: "var(--ink-2)", marginBottom: 4 }}>店</span>
            {c.shops.length > 0 && (
              <select className="inp" value={c.shopId ?? ""} onChange={(e) => c.selectShop(e.target.value || null)}>
                <option value="">— 選んでください —</option>
                {c.shops.map((s) => <option key={s.id} value={s.id}>{s.name || "（名前なし）"}{s.owner === c.session?.user.id ? "" : "（スタッフ）"}</option>)}
              </select>
            )}
            <div className="backrow" style={{ gap: 8, border: 0, padding: "8px 0 0" }}>
              <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} placeholder="新しい店の名前" value={shopName} onChange={(e) => setShopName(e.target.value)} />
              <button type="button" className="btn sm" disabled={c.busy || !shopName.trim()} onClick={() => { void c.createShop(shopName); setShopName(""); }}>店を作る</button>
            </div>
            {!c.shops.length && <div className="hint">まだ店がありません。店を作ると、この端末のデータがその店にアップロードされます。スタッフとして招待されている場合は、オーナーが登録したメールでログインすると店が出ます。</div>}
          </div>

          {shop && (
            <div className="sec">
              <div className="lrow"><div className="g"><div className="t">同期</div><div className="s">{statusText[c.status]}</div></div>
                <button type="button" className="btn sm" disabled={c.status === "syncing"} onClick={() => c.syncNow()}>今すぐ同期</button></div>
            </div>
          )}

          {shop && owner && (
            <div className="sec">
              <span className="lbl" style={{ display: "block", fontSize: 11.5, color: "var(--ink-2)", marginBottom: 4 }}>メンバー（この店のデータを見て入力できる人）</span>
              {c.members.map((mb) => {
                const linked = L.casts.find((x) => (x.email ?? "").toLowerCase() === mb.email.toLowerCase());
                return (
                  <div key={mb.email} className="lrow" style={{ padding: "9px 0" }}>
                    <div className="g"><div className="t" style={{ fontSize: 13.5 }}>{mb.email}</div>
                      <div className="s">{mb.role === "owner" ? "オーナー" : mb.role === "cast" ? `キャスト${linked ? ` ・ ${linked.name}` : "（結び付け待ち）"}` : "スタッフ"}</div></div>
                    {mb.role === "cast" && (
                      <select className="inp" style={{ width: 116, padding: "8px 6px", fontSize: 12.5, minHeight: 38 }}
                        aria-label="どのキャストか" value={linked?.id ?? ""}
                        onChange={(e) => update((LL) => {
                          for (const x of LL.casts) if ((x.email ?? "").toLowerCase() === mb.email.toLowerCase()) delete x.email;
                          const t = LL.casts.find((x) => x.id === e.target.value);
                          if (t) t.email = mb.email.toLowerCase();
                        })}>
                        <option value="">— 選ぶ —</option>
                        {L.casts.map((x) => <option key={x.id} value={x.id}>{x.name || "（名前なし）"}</option>)}
                      </select>
                    )}
                    {mb.role !== "owner" && (
                      <>
                        <button type="button" className="btn sm" aria-label={`${mb.email} に案内を送る`}
                          onClick={() => void sendInvite(mb.email, mb.role)}>案内を送る</button>
                        <button type="button" className="iconbtn" aria-label={`${mb.email} を外す`} disabled={c.busy}
                          onClick={() => { if (window.confirm(`${mb.email} を外しますか？`)) void c.removeMember(mb.email); }}><Trash /></button>
                      </>
                    )}
                  </div>
                );
              })}
              <div className="backrow" style={{ gap: 8, border: 0, padding: "8px 0 0" }}>
                <input className="inp" style={{ flex: 1, minWidth: 0, padding: "9px 10px", minHeight: 42 }} type="email" inputMode="email"
                  placeholder="メールアドレス" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
                <select className="inp" style={{ width: 104, flex: "none", padding: "9px 6px", minHeight: 42 }} value={memberRole}
                  aria-label="役割" onChange={(e) => setMemberRole(e.target.value as "staff" | "cast")}>
                  <option value="staff">スタッフ</option>
                  <option value="cast">キャスト</option>
                </select>
                <button type="button" className="btn sm" disabled={c.busy || !memberEmail.includes("@")}
                  onClick={() => { void c.addMember(memberEmail, memberRole); setMemberEmail(""); }}>追加</button>
              </div>
              <div className="hint">追加した人は、そのメールでログインするとこの店が見えます。スタッフは日報の入力とシフト、キャストは自分のシフトだけが見られます。</div>
            </div>
          )}
          {shop && !owner && <div className="hint" style={{ marginTop: 10 }}>あなたはこの店の<b>スタッフ</b>です。日報の入力ができます。給料・売上の集計と設定はオーナーのみが見られます。</div>}
        </>
      )}
    </div>
  );
}

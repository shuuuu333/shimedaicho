import { useState } from "react";
import { useCloud } from "../../state/cloud";

const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** 設定画面の「クラウド同期」カード */
export function CloudCard() {
  const c = useCloud();
  const [email, setEmail] = useState("");
  const [shopName, setShopName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const shop = c.shops.find((s) => s.id === c.shopId) ?? null;
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
        <>
          <label className="field"><span className="lbl">メールアドレス</span>
            <input className="inp" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <div className="btnrow" style={{ alignItems: "center" }}>
            <button type="button" className="btn sm primary" disabled={c.busy || !email.includes("@")} onClick={() => c.signIn(email)}>ログイン用のリンクを送る</button>
            {c.linkSent && <span className="hint" style={{ margin: 0 }}>メールを送りました。届いたリンクをこの端末で開いてください</span>}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>パスワードはありません。メールのリンクを開くだけでログインできます。</div>
        </>
      ) : (
        <>
          <div className="lrow"><div className="g"><div className="t">{c.email}</div><div className="s">{statusText[c.status] || "ログイン済み"}</div></div>
            <button type="button" className="btn sm ghost" disabled={c.busy} onClick={() => c.signOut()}>ログアウト</button></div>
          {c.error && <div className="banner" style={{ marginTop: 8 }}>{c.error}</div>}

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
              {c.members.map((m) => (
                <div key={m.email} className="lrow" style={{ padding: "7px 2px" }}>
                  <div className="g"><div className="t" style={{ fontSize: 13.5 }}>{m.email}</div><div className="s">{m.role === "owner" ? "オーナー" : "スタッフ"}</div></div>
                  {m.role !== "owner" && <button type="button" className="btn sm ghost" disabled={c.busy} onClick={() => { if (window.confirm(`${m.email} を外しますか？`)) void c.removeMember(m.email); }}>外す</button>}
                </div>
              ))}
              <div className="backrow" style={{ gap: 8, border: 0, padding: "8px 0 0" }}>
                <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} type="email" inputMode="email" placeholder="スタッフのメール" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
                <button type="button" className="btn sm" disabled={c.busy || !memberEmail.includes("@")} onClick={() => { void c.addMember(memberEmail); setMemberEmail(""); }}>追加</button>
              </div>
              <div className="hint">追加した人は、そのメールでログインするとこの店が見えます。</div>
            </div>
          )}
          {shop && !owner && <div className="hint" style={{ marginTop: 10 }}>この店のオーナーは別の人です。メンバーの管理はオーナーが行います。</div>}
        </>
      )}
    </div>
  );
}

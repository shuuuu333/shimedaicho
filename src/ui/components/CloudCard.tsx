import { useEffect, useState } from "react";
import { useCloud } from "../../state/cloud";
import { useApp } from "../../state/store";

const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** メールが届かないときの案内 */
function HelpDetails() {
  return (
    <details className="help">
      <summary>メールが届かないときは</summary>
      <ul>
        <li>迷惑メールのフォルダを見てください。Gmail なら「プロモーション」タブにも入ることがあります。</li>
        <li>件名は「締め台帳 ログインコード」です。同じ件名は 1 つの会話にまとまるので、開いて一番下の新しいものを見てください。</li>
        <li>数分たっても来なければ「もう一度送る」を押してください。</li>
        <li>コードは 1 時間で切れます。切れたら送り直してください。</li>
        <li>それでも来ないときは、別のメールアドレスで試すか、オーナーに伝えてください。</li>
      </ul>
    </details>
  );
}

/** 設定画面の「クラウド同期」カード */
export function CloudCard() {
  const c = useCloud();
  const [email, setEmail] = useState("");
  const [shopName, setShopName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"staff" | "cast">("staff");
  const L = useApp((s) => s.ledger);
  const update = useApp((s) => s.update);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
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
        c.linkSent && c.pendingEmail ? (
          <>
            <div className="steprow"><span className="stepno done">1</span><div className="g"><div className="t">{c.pendingEmail}</div><div className="s">にメールを送りました</div></div>
              <button type="button" className="btn sm ghost" disabled={c.busy} onClick={() => { useCloud.setState({ linkSent: false, pendingEmail: null, error: null }); setCode(""); }}>直す</button></div>
            <div className="steprow"><span className="stepno now">2</span><div className="g"><div className="t">届いた 6 桁を入れる</div><div className="s">件名は「締め台帳 ログインコード」</div></div></div>

            <label className="field" style={{ marginTop: 12 }}>
              <input className="inp num big" style={{ textAlign: "center", letterSpacing: ".38em", fontSize: 30 }} type="text"
                inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="000000" value={code} autoFocus
                aria-label="メールに書かれたコード"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={(e) => { if (e.key === "Enter" && code.length >= 6) void c.verifyCode(code); }} /></label>
            <button type="button" className="btn primary wide" style={{ minHeight: 50 }} disabled={c.busy || code.length < 6} onClick={() => c.verifyCode(code)}>ログイン</button>
            {c.error && <div className="banner" style={{ marginTop: 10 }}>{c.error}</div>}

            <div className="btnrow" style={{ marginTop: 10, alignItems: "center" }}>
              <button type="button" className="btn sm" disabled={c.busy || wait > 0} onClick={() => { void c.signIn(c.pendingEmail!); setWait(60); }}>
                {wait > 0 ? `もう一度送る（${wait}秒）` : "もう一度送る"}
              </button>
            </div>
            <HelpDetails />
          </>
        ) : (
          <>
            <div className="steprow"><span className="stepno now">1</span><div className="g"><div className="t">メールアドレスを入れる</div><div className="s">パスワードはありません</div></div></div>
            <label className="field" style={{ marginTop: 10 }}>
              <input className="inp" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
                aria-label="メールアドレス"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) { void c.signIn(email); setWait(60); } }} /></label>
            <button type="button" className="btn primary wide" style={{ minHeight: 50 }} disabled={c.busy || !email.includes("@")}
              onClick={() => { void c.signIn(email); setWait(60); }}>ログイン用のメールを送る</button>
            {c.error && <div className="banner" style={{ marginTop: 10 }}>{c.error}</div>}
            <div className="steprow" style={{ marginTop: 10 }}><span className="stepno">2</span><div className="g"><div className="t">届いた 6 桁を入れる</div><div className="s">それだけでログインできます</div></div></div>
            <HelpDetails />
          </>
        )
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
                    {mb.role !== "owner" && <button type="button" className="btn sm ghost" disabled={c.busy}
                      onClick={() => { if (window.confirm(`${mb.email} を外しますか？`)) void c.removeMember(mb.email); }}>外す</button>}
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

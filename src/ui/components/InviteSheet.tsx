import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useCloud } from "../../state/cloud";
import { useApp } from "../../state/store";
import { BottomSheet } from "./BottomSheet";
import { Notice } from "./Notice";
import { INVITE_MINUTES, type InviteRow } from "../../data/cloud";


/** 招待。リンクを送るか、その場で QR を見せるかを選べる。
 *  相手はメールもパスワードもいらない（LINE でログインするか、そのまま入る） */
export function InviteSheet({ onClose }: { onClose: () => void }) {
  const c = useCloud();
  const L = useApp((s) => s.ledger);
  const showToast = useApp((s) => s.showToast);
  const [role, setRole] = useState<"staff" | "cast">("staff");
  const [castId, setCastId] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [png, setPng] = useState("");
  const [left, setLeft] = useState(0);

  const url = useMemo(() => {
    if (!invite) return "";
    const base = window.location.origin + window.location.pathname;
    return `${base}?join=${invite.token}`;
  }, [invite]);

  useEffect(() => {
    if (!url) { setPng(""); return; }
    let alive = true;
    void QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } })
      .then((d) => { if (alive) setPng(d); })
      .catch(() => { if (alive) setPng(""); });
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    if (!invite) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(invite.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [invite]);

  const make = async () => {
    const cast = role === "cast" ? L.casts.find((x) => x.id === castId) : null;
    const label = role === "cast" ? cast?.name ?? "" : name.trim();
    const r = await c.makeInvite(role, label, role === "cast" ? castId || null : null);
    if (r) setInvite(r);
  };
  const expired = invite != null && left <= 0;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); showToast("リンクをコピーしました"); }
    catch { showToast("コピーできませんでした"); }
  };
  /** 端末の共有シートを開く。LINE を選べばそのまま送れる。無い端末ではコピーに落とす */
  const share = async () => {
    const text = `${L.shop.name || "お店"}の${invite?.role === "cast" ? "キャスト" : "スタッフ"}として招待します。\nこのリンクを開いてください（${INVITE_MINUTES}分で切れます）\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "お店への招待", text }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    await copy();
  };

  return (
    <BottomSheet open title="お店に招待する" onClose={onClose}>
      {!invite ? (
        <>
          <p className="hint" style={{ margin: "0 0 14px" }}>
            招待のリンクを LINE などで送るか、その場で QR を見せてください。
            相手はメールもパスワードもいりません。
          </p>

          <label className="field"><span className="lbl">役割</span>
            <div className="seg wide" role="group" aria-label="役割">
              <button type="button" aria-pressed={role === "staff"} onClick={() => setRole("staff")}>スタッフ</button>
              <button type="button" aria-pressed={role === "cast"} onClick={() => setRole("cast")}>キャスト</button>
            </div>
          </label>
          <div className="hint" style={{ margin: "-6px 0 14px" }}>
            {role === "staff" ? "日報の入力とシフトが使えます。売上の集計と設定は見られません。" : "自分のシフトと給料だけが見られます。"}
          </div>

          {role === "cast" ? (
            <label className="field"><span className="lbl">どのキャストか</span>
              <select className="inp" value={castId} onChange={(e) => setCastId(e.target.value)}>
                <option value="">— 選んでください —</option>
                {L.casts.filter((x) => x.active !== false).map((x) => <option key={x.id} value={x.id}>{x.name || "（名前なし）"}</option>)}
              </select></label>
          ) : (
            <label className="field"><span className="lbl">名前（あとで見分けるため・任意）</span>
              <input className="inp" value={name} placeholder="例：ホール 田中" onChange={(e) => setName(e.target.value)} /></label>
          )}

          <button type="button" className="btn primary wide" style={{ minHeight: 52 }}
            disabled={c.busy || (role === "cast" && !castId)} onClick={make}>招待を作る</button>
          {c.error && <div style={{ marginTop: 10 }}><Notice bad>{c.error}</Notice></div>}
          <div className="hint" style={{ marginTop: 12 }}>
            招待は {INVITE_MINUTES} 分で切れ、<b>1 人が 1 回だけ</b>使えます。誰かが使うと、その場で無効になります。
          </div>
        </>
      ) : (
        <>
          <div className="qrmeta" style={{ marginTop: 0 }}>
            <div className="t">{invite.role === "cast" ? "キャスト" : "スタッフ"}{invite.name ? ` ・ ${invite.name}` : ""}</div>
            <div className={`s num ${expired ? "neg" : ""}`}>
              {expired ? "期限切れです" : `のこり ${Math.floor(left / 60)}分${String(left % 60).padStart(2, "0")}秒`}
            </div>
          </div>

          {expired ? (
            <Notice bad title="期限が切れました">下の「作り直す」でもう一度出してください。</Notice>
          ) : (
            <>
              <button type="button" className="btn primary wide" style={{ minHeight: 52 }} onClick={() => void share()}>
                招待のリンクを送る
              </button>
              <div className="hint" style={{ marginTop: 6 }}>
                LINE やメールで相手に送れます。相手はリンクを開いて「LINE でログイン」を選ぶだけです。
              </div>
              <button type="button" className="btn wide" style={{ marginTop: 8 }} onClick={() => void copy()}>リンクをコピー</button>

              <details className="help" style={{ marginTop: 12 }}>
                <summary>その場で QR を見せる</summary>
                <div className="qrbox">
                  {png ? <img src={png} alt="招待のQRコード" /> : <div className="empty">作っています…</div>}
                </div>
                <div className="hint">相手のスマホのカメラで読み取ってもらいます。画面を他の人に見られないよう気をつけてください。</div>
              </details>
            </>
          )}

          <Notice title="1 回使うと無効になります">
            誰かが使うと、その時点でこの招待は使えなくなります。入った人は
            設定の「メンバー」に出るので、見覚えがなければそこから外してください。
          </Notice>

          <div className="btnrow" style={{ marginTop: 4 }}>
            <button type="button" className="btn sm ghost" onClick={() => { void c.makeInvite(invite.role, invite.name, invite.cast_id).then((r) => r && setInvite(r)); }}>作り直す</button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

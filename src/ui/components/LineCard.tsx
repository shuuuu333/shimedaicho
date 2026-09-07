import { useState } from "react";
import { useCloud } from "../../state/cloud";
import { useApp } from "../../state/store";
import { Notice } from "./Notice";

/** LINE への日報通知。オーナーで、クラウド同期の店を選んでいるときだけ出す。
 *  チャネルアクセストークンは Supabase の Secrets にあり、アプリ側は一切持たない */
export function LineCard() {
  const shopId = useCloud((s) => s.shopId);
  const isOwner = useCloud((s) => s.isOwner);
  const sendLine = useCloud((s) => s.sendLine);
  const shopName = useApp((s) => s.ledger.shop.name);
  const showToast = useApp((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // 何も出さないと「機能が無い」と思われるので、使えない理由は書いておく
  if (!shopId) {
    return (
      <div className="card" id="set-line">
        <h2>LINE に日報を送る</h2>
        <p className="sub">閉店後の売上・人件費・現金の差を、オーナーの LINE に送れます。</p>
        <div className="hint">
          使うには、上の<b>クラウド同期</b>でログインしてお店を作ってください。
          LINE のトークンはお店ごとにサーバー側で預かる作りなので、端末内だけで使っているあいだは送れません。
        </div>
      </div>
    );
  }
  if (!isOwner()) return null;

  const test = async () => {
    setBusy(true); setErr(null); setOk(false);
    try {
      await sendLine(`${shopName || "お店"}\nLINE への通知のテストです。これが届いていれば設定は終わりです。`);
      setOk(true);
      showToast("LINE に送りました");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" id="set-line">
      <h2>LINE に日報を送る</h2>
      <p className="sub">閉店後、日報の「5 締め」から売上・人件費・現金の差をまとめて送れます。</p>
      <div className="hint" style={{ marginBottom: 10 }}>
        使うには <b>LINE公式アカウント</b>を 1 つ作り、チャネルアクセストークンを Supabase に登録します。
        トークンはこのアプリには入りません（持っていると誰でもそのアカウントとして送れてしまうため）。
      </div>
      <button type="button" className="btn wide" disabled={busy} onClick={() => void test()}>
        {busy ? "送っています…" : "今すぐテスト送信"}
      </button>
      {ok && <Notice title="届きましたか？">LINE に届いていれば設定は完了です。あとは日報の「5 締め」から送れます。</Notice>}
      {err && <Notice bad title="送れませんでした">{err}</Notice>}
    </div>
  );
}

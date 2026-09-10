import { useState } from "react";
import { useCloud } from "../../state/cloud";
import { useApp } from "../../state/store";
import { Notice } from "./Notice";
import { FREE_LIMIT, defaultNotify, monthlyEstimate } from "../../domain/notify";
import { sentThisMonth } from "../../state/notify";
import type { NotifyRule } from "../../domain/types";

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

      <LiveNotifyCard />
    </div>
  );
}

/** 営業中の通知。店にいなくても、いま何組入っていて いくら上がっているかが届く。
 *
 *  LINE の無料枠は月 200 通しかないので、ためて 1 通にまとめるのを既定にしてある。
 *  1 件ずつ送ると 1 日 10 組の店で月 600 通を超え、月の途中で送れなくなる。 */
function LiveNotifyCard() {
  const L = useApp((s) => s.ledger);
  const update = useApp((s) => s.update);
  const r = L.shop.notify ?? defaultNotify();
  const set = (patch: Partial<NotifyRule>) =>
    update((D) => { D.shop.notify = { ...(D.shop.notify ?? defaultNotify()), ...patch }; });

  const sent = sentThisMonth();
  const est = monthlyEstimate(r, 10);
  const over = est > FREE_LIMIT;

  return (
    <>
      <div className="sechead" style={{ marginTop: 16 }}><div className="t">営業中の通知</div><div className="l" /></div>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        入店と会計を、その場で LINE に流します。店にいなくても様子が分かります。
      </p>

      <label className="lrow" style={{ cursor: "pointer" }}>
        <div className="g"><div className="t">営業中も知らせる</div>
          <div className="s">{r.on ? `${r.batchMin > 0 ? `${r.batchMin}分ぶんをまとめて 1 通` : "1 件ずつすぐ送る"}` : "いまは締めの日報だけ"}</div></div>
        <input type="checkbox" checked={r.on} onChange={(e) => set({ on: e.target.checked })} />
      </label>

      {r.on && (
        <>
          {([["enter", "入店", "「カウンター2 に 2名」"],
             ["pay", "会計", "「¥10,500 現金」"],
             ["alert", "取消・値引き・延長", "現金の抜き取りの見張りにもなります"]] as const).map(([k, name, sub]) => (
            <label className="lrow" key={k} style={{ cursor: "pointer" }}>
              <div className="g"><div className="t">{name}</div><div className="s">{sub}</div></div>
              <input type="checkbox" checked={r[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<NotifyRule>)} />
            </label>
          ))}

          <label className="field" style={{ marginTop: 10 }}><span className="lbl">まとめて送る間隔</span>
            <select className="inp" value={String(r.batchMin)} onChange={(e) => set({ batchMin: Number(e.target.value) })}>
              <option value="0">ためずにすぐ送る</option>
              <option value="15">15分ぶんをまとめる</option>
              <option value="30">30分ぶんをまとめる</option>
              <option value="60">1時間ぶんをまとめる</option>
            </select></label>

          <Notice bad={over} title={over ? "この設定だと無料枠を超えます" : "だいたいの通数"}>
            1 日 10 組の店で、ひと月 <b>およそ {est} 通</b>。
            LINE の無料枠は月 {FREE_LIMIT} 通です。
            {over && <><br />まとめる間隔を長くするか、知らせる出来事を減らしてください。</>}
            <br />この端末から今月 送ったのは <b>{sent} 通</b>（締めの日報を含む）。
          </Notice>
        </>
      )}
    </>
  );
}

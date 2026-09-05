import { useEffect, useRef, useState } from "react";
import { useApp } from "../../state/store";
import { NumberField } from "../components/NumberField";
import { TimeField } from "../components/TimeField";
import { DateField } from "../components/DateField";
import { Moon, Phone, Sun, Trash } from "../icons";
import { CloudCard } from "../components/CloudCard";
import { InstallCard } from "../components/InstallCard";
import { useCloud } from "../../state/cloud";
import { uid } from "../../domain/format";
import { backupFilename, backupJSON, csvFilename, monthCSV, offerFile, parseBackup } from "../../data/backup";
import { LocalRepository } from "../../data/localRepository";
import type { SnapshotInfo } from "../../data/repository";

const repoForSnapshots = new LocalRepository();

const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

export function Settings() {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const update = useApp((s) => s.update);
  const updateWithUndo = useApp((s) => s.updateWithUndo);
  const replaceLedger = useApp((s) => s.replaceLedger);
  const showToast = useApp((s) => s.showToast);
  const markBackedUp = useApp((s) => s.markBackedUp);
  const lastSavedAt = useApp((s) => s.lastSavedAt);
  const lastBackupAt = useApp((s) => s.lastBackupAt);
  const [snaps, setSnaps] = useState<SnapshotInfo[] | null>(null);
  const [showSnaps, setShowSnaps] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  /** 新しい版があれば入れて読み込み直す */
  const checkUpdate = async () => {
    setChecking(true); setUpdateMsg("");
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) { setUpdateMsg("この開き方では更新を確認できません。ブラウザで開き直してください。"); return; }
      await reg.update();
      if (reg.waiting || reg.installing) {
        setUpdateMsg("新しい版が見つかりました。読み込み直します…");
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setUpdateMsg("いまが最新です。");
      }
    } catch {
      setUpdateMsg("確認できませんでした。電波を確かめてください。");
    } finally { setChecking(false); }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const S = L.shop;
  const role = useCloud((s) => s.role());
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);

  const themeCard = (
    <div className="card" id="set-theme">
      <h2>見た目</h2><p className="sub">「端末に合わせる」にすると、スマホの設定が暗いときだけ暗くなります。</p>
      <div className="seg wide" role="group" aria-label="見た目の切替">
        <button type="button" aria-pressed={theme === "auto"} onClick={() => setTheme("auto")}><Phone />端末に合わせる</button>
        <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun />明るい</button>
        <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon />暗い</button>
      </div>
    </div>
  );

  useEffect(() => {
    if (!ui.setFocus) { window.scrollTo(0, 0); return; }
    const el = document.getElementById("set-" + ui.setFocus);
    setUI({ setFocus: null });
    if (el) requestAnimationFrame(() => { el.scrollIntoView({ block: "start", behavior: "smooth" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); });
  }, [ui.setFocus, setUI]);

  const shop = <K extends keyof typeof S>(k: K, v: (typeof S)[K]) => update((LL) => { LL.shop[k] = v; });
  const exportJson = async () => {
    try { await offerFile(backupFilename(), backupJSON(L), "application/json"); await markBackedUp(); showToast("バックアップを書き出しました"); }
    catch (e) { if ((e as Error).name !== "AbortError") showToast("書き出せませんでした"); }
  };
  const exportCsv = async () => {
    try { await offerFile(csvFilename(ui.month), monthCSV(L, ui.month), "text/csv"); showToast("CSVを書き出しました"); }
    catch (e) { if ((e as Error).name !== "AbortError") showToast("書き出せませんでした"); }
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const next = parseBackup(text);
      const n = Object.keys(next.days).length;
      if (!window.confirm(`「${f.name}」を読み込みます。\n日報 ${n}日分・キャスト ${next.casts.length}名。\n今のデータは置き換わります（直前の状態は履歴に残ります）。よろしいですか？`)) return;
      await replaceLedger(next, "import");
      showToast(`読み込みました（日報 ${n}日分）`);
    } catch (e) {
      showToast((e as Error).message || "読み込めませんでした");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const loadSnaps = async () => { setShowSnaps(true); setSnaps(await repoForSnapshots.snapshots()); };
  const restore = async (s: SnapshotInfo) => {
    if (!window.confirm(`${fmtAt(s.at)} の状態（日報 ${s.days}日分）に戻します。よろしいですか？`)) return;
    const Lr = await repoForSnapshots.loadSnapshot(s.id);
    if (!Lr) { showToast("読み込めませんでした"); return; }
    await replaceLedger(Lr, "restore");
    showToast("履歴から戻しました");
    setSnaps(await repoForSnapshots.snapshots());
  };
  const ago = daysAgo(lastBackupAt);

  if (role === "staff" || role === "cast") {
    return (
      <>
        {themeCard}
        <InstallCard />
        <CloudCard />
        <div className="card">
          <h2>使い方（スタッフ）</h2>
          <div className="lrow"><div className="g"><div className="t">1. 日報タブで締めを入力</div><div className="s">売上 → 出勤 → 派遣 → 経費 → 締め の順に入れます</div></div></div>
          <div className="lrow"><div className="g"><div className="t">2. 入力は自動で保存・同期</div><div className="s">右上が「同期済み」なら店の全員に共有されています</div></div></div>
          <div className="lrow"><div className="g"><div className="t">3. 集計と設定はオーナーのみ</div><div className="s">給料や利益の画面は出ません</div></div></div>
        </div>
        <div className="card" id="set-version">
        <h2>アプリの版</h2>
        <div className="lrow">
          <div className="g"><div className="t">締め台帳 v{__APP_VERSION__}</div>
            <div className="s num">{new Date(__BUILD_TIME__).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} の版</div></div>
          <button type="button" className="btn sm" disabled={checking} onClick={checkUpdate}>{checking ? "確認中…" : "更新を確認"}</button>
        </div>
        {updateMsg && <div className="hint">{updateMsg}</div>}
      </div>
      </>
    );
  }

  return (
    <>
      {themeCard}
      <InstallCard />
      <div className="card" id="set-shop">
        <h2>店舗</h2>
        <label className="field"><span className="lbl">店名</span><input className="inp" value={S.name} placeholder="店名" onChange={(e) => shop("name", e.target.value)} /></label>
        <div className="row2">
          <label className="field"><span className="lbl">基本時給</span><NumberField value={S.defaultWage} onChange={(v) => shop("defaultWage", v ?? 0)} /></label>
          <label className="field"><span className="lbl">給与の丸め</span>
            <select className="inp" value={String(S.roundMinutes)} onChange={(e) => shop("roundMinutes", Number(e.target.value))}>
              {[1, 5, 10, 15, 30, 60].map((v) => <option key={v} value={v}>{v}分単位</option>)}
            </select></label>
        </div>
        <div className="row2">
          <label className="field"><span className="lbl">出勤時刻の初期値</span><TimeField value={S.openTime} ariaLabel="出勤時刻の初期値" onChange={(v) => shop("openTime", v)} /></label>
          <label className="field"><span className="lbl">退勤時刻の初期値</span><TimeField value={S.closeTime} ariaLabel="退勤時刻の初期値" onChange={(v) => shop("closeTime", v)} /></label>
        </div>
        <div className="hint" style={{ margin: "-5px 0 11px" }}>日報で出勤にすると、この時刻が自動で入ります。遅刻・早退はその場のボタンで直せます。</div>
        <label className="field"><span className="lbl">派遣の基本日給（保証額）</span><NumberField value={S.dispatchGuarantee} onChange={(v) => shop("dispatchGuarantee", v ?? 0)} /></label>
        <label className="field"><span className="lbl">カード手数料（％）</span><NumberField decimal value={S.cardFeeRate} onChange={(v) => shop("cardFeeRate", v ?? 0)} /></label>
        <div className="hint">カード売上からこの率を引いた額が「カード未回収」に積まれ、入金を記録すると消えます。</div>
      </div>

      <div className="card" id="set-backs">
        <h2>バックの単価</h2><p className="sub">お店のルールをそのまま入れてください。日報の入力欄がここで決まります。</p>
        {L.backItems.map((b, i) => (
          <div key={b.id} className="itemcard">
            <div className="backrow" style={{ gap: 8, border: 0, padding: "0 0 8px" }}>
              <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} placeholder="項目名（例：ドリンク M）" value={b.name} autoFocus={!b.name} onChange={(e) => update((LL) => { LL.backItems[i].name = e.target.value; })} />
              <button type="button" className="iconbtn" aria-label={`${b.name || "項目"}を削除`} onClick={() => updateWithUndo(`${b.name.trim() || "項目"} を消しました`, (LL) => { LL.backItems.splice(i, 1); })}><Trash /></button>
            </div>
            <div className="row3">
              <label className="field" style={{ margin: 0 }}><span className="lbl">計算</span>
                <select className="inp" value={b.type} onChange={(e) => update((LL) => { LL.backItems[i].type = e.target.value as "count" | "amount"; })}>
                  <option value="count">件数</option><option value="amount">売上%</option>
                </select></label>
              <label className="field" style={{ margin: 0 }}><span className="lbl">在籍</span><NumberField decimal value={b.rate} onChange={(v) => update((LL) => { LL.backItems[i].rate = v ?? 0; })} /></label>
              <label className="field" style={{ margin: 0 }}><span className="lbl">派遣</span><NumberField decimal value={b.rateD} onChange={(v) => update((LL) => { LL.backItems[i].rateD = v ?? 0; })} /></label>
            </div>
          </div>
        ))}
        <div className="hint" style={{ marginTop: 8 }}>「件数」は 単価×本数。「売上%」は 対象売上×％（ボトルやシャンパン向け）。ドリンクはサイズごとに行を分けてください。</div>
        <div className="btnrow" style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => update((LL) => { LL.backItems.push({ id: uid(), name: "", type: "count", rate: 0, rateD: 0 }); })}>＋ 項目を足す</button></div>
      </div>

      <div className="card" id="set-cash">
        <h2>現金の起点</h2><p className="sub">ここを基準に、日報から現金残を積み上げます</p>
        <div>
          <label className="field"><span className="lbl">起点の日</span><DateField value={S.openingDate} ariaLabel="起点の日" onChange={(v) => shop("openingDate", v)} /></label>
          <label className="field"><span className="lbl">その日の手元現金</span><NumberField value={S.openingCash} onChange={(v) => shop("openingCash", v ?? 0)} /></label>
        </div>
      </div>

      <div className="card" id="set-fixed">
        <h2>月の固定費</h2><p className="sub">日報に出てこない毎月かかるもの。今月の利益から引かれます。</p>
        <div className="row2">
          <label className="field"><span className="lbl">固定人件費（店長など）</span><NumberField value={S.fixedLabor} onChange={(v) => shop("fixedLabor", v ?? 0)} /></label>
          <label className="field"><span className="lbl">家賃など固定費</span><NumberField value={S.fixedCost} onChange={(v) => shop("fixedCost", v ?? 0)} /></label>
        </div>
      </div>

      <CloudCard />

      <div className="card" id="set-data">
        <h2>データ</h2>
        <p className="sub">入力はこの端末の中（ブラウザのデータベース）にも必ず自動保存されます。クラウド同期を使わない場合は、端末を替えるときにバックアップを書き出して読み込んでください。</p>
        <div className="lrow"><div className="g"><div className="t">最後に保存</div><div className="s">入力のたびに自動で保存</div></div><div className="a num" style={{ fontWeight: 500 }}>{fmtAt(lastSavedAt)}</div></div>
        <div className="lrow"><div className="g"><div className="t">最後のバックアップ</div><div className="s">{ago == null ? "まだ書き出していません" : ago === 0 ? "今日" : `${ago}日前`}{ago != null && ago >= 30 ? " ・ そろそろ書き出しましょう" : ""}</div></div>
          <div className="a num" style={{ fontWeight: 500, color: ago != null && ago >= 30 ? "var(--crit)" : undefined }}>{fmtAt(lastBackupAt)}</div></div>
        <div className="btnrow" style={{ marginTop: 12 }}>
          <button type="button" className="btn sm primary" onClick={exportJson}>全データのバックアップ</button>
          <button type="button" className="btn sm" onClick={exportCsv}>{Number(ui.month.slice(5, 7))}月のCSV</button>
          <label className="btn sm filebtn">読み込む（以前の締め台帳・バックアップ）<input ref={fileRef} type="file" accept=".json,application/json" onChange={(e) => importFile(e.target.files?.[0])} /></label>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>以前の締め台帳（claude.ai 版）の「全データのバックアップ」で書き出した JSON もそのまま読み込めます。</div>
        <div className="btnrow" style={{ marginTop: 12 }}>
          <button type="button" className="btn sm ghost" onClick={showSnaps ? () => setShowSnaps(false) : loadSnaps}>{showSnaps ? "履歴を閉じる" : "保存の履歴から戻す"}</button>
        </div>
        {showSnaps && (
          <div style={{ marginTop: 8 }}>
            {snaps == null ? <div className="empty" style={{ padding: 12 }}>読み込み中…</div>
              : !snaps.length ? <div className="empty" style={{ padding: 12 }}>まだ履歴がありません（10分おき、または取り込み前に自動で残ります）</div>
              : snaps.map((s) => (
                <div key={s.id} className="snap">
                  <div className="g"><div>{fmtAt(s.at)}</div><div className="s">日報 {s.days}日分 ・ {Math.round(s.size / 1024)}KB ・ {s.reason === "auto" ? "自動" : s.reason.startsWith("before-") ? "取り込み前" : s.reason === "import" ? "取り込み" : s.reason === "restore" ? "復元" : s.reason}</div></div>
                  <button type="button" className="btn sm" onClick={() => restore(s)}>この状態に戻す</button>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>使い方</h2>
        <div className="lrow"><div className="g"><div className="t">1. 設定を決める</div><div className="s">時給・バック単価・カード手数料・現金の起点</div></div></div>
        <div className="lrow"><div className="g"><div className="t">2. 在籍キャストを登録</div><div className="s">個別時給がある子だけ時給欄を埋める。派遣は登録不要</div></div></div>
        <div className="lrow"><div className="g"><div className="t">3. 毎日の締めで日報</div><div className="s">売上 → 出勤 → 派遣 → 経費 → 締め の5ステップ。3分で終わります</div></div></div>
        <div className="lrow"><div className="g"><div className="t">4. 今月を見る</div><div className="s">利益・人件費率・未払い・現金残が自動で出ます</div></div></div>
        <div className="lrow"><div className="g"><div className="t">5. 給料日に精算</div><div className="s">キャスト画面の「今日精算」を押すだけ。未払いが消え、現金残からも引かれます</div></div></div>
        <div className="lrow"><div className="g"><div className="t">6. 月に一度バックアップ</div><div className="s">上の「全データのバックアップ」を押して、ファイルを手元に残しておくと安心です</div></div></div>
      </div>
      <div className="card" id="set-version">
        <h2>アプリの版</h2>
        <div className="lrow">
          <div className="g"><div className="t">締め台帳 v{__APP_VERSION__}</div>
            <div className="s num">{new Date(__BUILD_TIME__).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} の版</div></div>
          <button type="button" className="btn sm" disabled={checking} onClick={checkUpdate}>{checking ? "確認中…" : "更新を確認"}</button>
        </div>
        {updateMsg && <div className="hint">{updateMsg}</div>}
      </div>
    </>
  );
}

import { useEffect, useState, type ComponentType } from "react";
import { useApp, type Tab } from "./state/store";
import { APP_NAME, IS_CAST_APP } from "./appMode";
import { useCloud } from "./state/cloud";
import { SaveStatus } from "./ui/components/SaveStatus";
import { Toast } from "./ui/components/Toast";
import { Welcome } from "./ui/components/Welcome";
import { PinPad } from "./ui/components/PinPad";
import { JoinSheet } from "./ui/components/JoinSheet";
import { hasPin, isUnlocked } from "./data/pin";
import { ChevLeft, IcoCast, IcoDay, IcoMonth, IcoReg, IcoSet, IcoShift } from "./ui/icons";
import { TabBar } from "./ui/components/TabBar";
import { Register } from "./ui/screens/Register";
import { Month } from "./ui/screens/Month";
import { DayReport } from "./ui/screens/DayReport";
import { Casts } from "./ui/screens/Casts";
import { Shifts } from "./ui/screens/Shifts";
import { Settings } from "./ui/screens/Settings";

/** 下のタブに並ぶ4つ。設定は右上の歯車から開く */
const TABS: { id: Tab; label: string; Icon: ComponentType; Screen: ComponentType }[] = [
  { id: "reg", label: "レジ", Icon: IcoReg, Screen: Register },
  { id: "month", label: "今月", Icon: IcoMonth, Screen: Month },
  { id: "day", label: "日報", Icon: IcoDay, Screen: DayReport },
  { id: "shift", label: "シフト", Icon: IcoShift, Screen: Shifts },
  { id: "cast", label: "キャスト", Icon: IcoCast, Screen: Casts },
];

/** 暗証番号で隠す画面。給料と利益が見えるところだけ。
 *  レジと日報は現場が止まるので守らない */
const LOCKED: Tab[] = ["set", "cast", "month"];

export default function App() {
  const init = useApp((s) => s.init);
  const loaded = useApp((s) => s.loaded);
  const tab = useApp((s) => s.ui.tab);
  const setUI = useApp((s) => s.setUI);
  const name = useApp((s) => s.ledger.shop.name);
  const cloudInit = useCloud((s) => s.init);
  const role = useCloud((s) => s.role());
  const canRegister = useCloud((s) => s.canRegister());
  const joinByToken = useCloud((s) => s.joinByToken);
  const showToast = useApp((s) => s.showToast);
  useEffect(() => {
    // 招待の引き換えは、ログインの復元（cloudInit）が終わってから
    void init()
      .then(() => cloudInit())
      .then(() => useCloud.getState().redeemPending())
      .then((r) => { if (r) showToast(r.message); });
  }, [init, cloudInit, showToast]);

  // ホーム画面のショートカット（?tab=reg など）から開いたとき、その画面を出す。
  // マニフェストに shortcuts を書いても、ここで読まないと効かない
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (!want) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
    if (TABS.some((t) => t.id === want)) setUI({ tab: want as Tab, setFocus: null, sheet: null });
  }, [setUI]);

  // QR を読んで開いたとき（?join=…）。入り方を選んでもらう。
  // そのまま入る（匿名）と速いが、端末のデータを消すと入り直しになる。
  // LINE で入っておくと、機種を変えても同じ人として戻れる
  const [joinToken, setJoinToken] = useState<string | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("join");
    if (!token) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("join");
    window.history.replaceState(null, "", url.toString());
    try { localStorage.setItem("shimedaicho.welcomed", "1"); } catch { /* ignore */ }
    // すでにログインしているなら、聞かずにそのまま入る
    if (useCloud.getState().session) { void joinByToken(token).then((r) => showToast(r.message)); return; }
    setJoinToken(token);
  }, [joinByToken, showToast]);

  // 見える画面は 3 段階。レジを打つキャストにはレジも出す（給料と売上は自分のぶんだけ）
  const tabs = role === "cast"
    ? TABS.filter((t) => t.id === "shift" || (canRegister && t.id === "reg"))
    : role === "staff" ? TABS.filter((t) => t.id === "reg" || t.id === "day" || t.id === "shift")
    : TABS;
  useEffect(() => {
    if (tab !== "set" && !tabs.some((t) => t.id === tab)) setUI({ tab: tabs[0].id, sheet: null });
  }, [tabs, tab, setUI]);

  const onSettings = tab === "set";
  const Screen = onSettings ? Settings : (tabs.find((t) => t.id === tab) ?? tabs[0]).Screen;

  // 解錠の状態は sessionStorage にあるので、再描画のたびに読み直す
  const [unlockedAt, setUnlockedAt] = useState(0);
  const locked = hasPin() && LOCKED.includes(tab) && !isUnlocked();
  void unlockedAt;
  const back = () => { setUI({ tab: tabs[0].id, setFocus: null, sheet: null }); window.scrollTo(0, 0); };

  // 指で払って隣のタブへ。ボタンを狙わなくても移れる。
  // 設定は別の階層なので、ここでは外す（隣に何も無い）
  const idx = tabs.findIndex((t) => t.id === tab);
  const goTab = (i: number) => {
    const t = tabs[i];
    if (!t) return;
    setUI({ tab: t.id, setFocus: null, sheet: null });
    window.scrollTo(0, 0);
    setSlide(i > idx ? 1 : -1);
  };
  /** 入ってきた向き。切り替えた直後だけ、その向きから滑り込ませる */
  const [slide, setSlide] = useState<0 | 1 | -1>(0);
  useEffect(() => { if (!slide) return; const t = setTimeout(() => setSlide(0), 220); return () => clearTimeout(t); }, [slide]);


  return (
    <div className={`app ${onSettings ? "setpage" : ""}`}>
      <header className="topbar">
        {onSettings ? (
          <>
            <button type="button" className="iconbtn back" aria-label="戻る" onClick={back}><ChevLeft size={20} /></button>
            <div className="brand"><b>設定</b></div>
          </>
        ) : (
          <div className="brand"><b>{name || APP_NAME}</b><span>{name ? (IS_CAST_APP ? "自分のシフトと給料" : "売上・給料・現金の締め") : ""}</span></div>
        )}
        <SaveStatus />
        {!onSettings && (
          <button type="button" className="iconbtn gear" aria-label="設定を開く"
            onClick={() => { setUI({ tab: "set", setFocus: null, sheet: null }); window.scrollTo(0, 0); }}>
            <IcoSet />
          </button>
        )}
      </header>
      {/* 本文を払ってページを移るのはやめた。表・カテゴリ・カレンダーと
          取り合いになって誤って切り替わる。ページの行き来は下のガラスの帯に一本化する */}
      <main className={slide ? (slide > 0 ? "slide-l" : "slide-r") : ""}>
        {!loaded ? <div className="empty">読み込み中…</div>
          : locked
            ? <PinPad title="暗証番号を入れてください"
                note="給料と売上が見える画面です。レジと日報は番号なしで使えます。"
                onOk={() => setUnlockedAt(Date.now())}
                onCancel={() => setUI({ tab: "reg", setFocus: null, sheet: null })} />
            : <Screen />}
      </main>
      {!onSettings && (
        <TabBar tabs={tabs} current={tab}
          onPick={(id) => { goTab(tabs.findIndex((t) => t.id === id)); }} />
      )}
      <JoinSheet token={joinToken} onClose={() => setJoinToken(null)} />
      <Welcome />
      <Toast />
    </div>
  );
}

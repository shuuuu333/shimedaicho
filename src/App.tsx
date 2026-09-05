import { useEffect, type ComponentType } from "react";
import { useApp, type Tab } from "./state/store";
import { useCloud } from "./state/cloud";
import { SaveStatus } from "./ui/components/SaveStatus";
import { Toast } from "./ui/components/Toast";
import { Welcome } from "./ui/components/Welcome";
import { ChevLeft, IcoCast, IcoDay, IcoMonth, IcoSet, IcoShift } from "./ui/icons";
import { Month } from "./ui/screens/Month";
import { DayReport } from "./ui/screens/DayReport";
import { Casts } from "./ui/screens/Casts";
import { Shifts } from "./ui/screens/Shifts";
import { Settings } from "./ui/screens/Settings";

/** 下のタブに並ぶ4つ。設定は右上の歯車から開く */
const TABS: { id: Tab; label: string; Icon: ComponentType; Screen: ComponentType }[] = [
  { id: "month", label: "今月", Icon: IcoMonth, Screen: Month },
  { id: "day", label: "日報", Icon: IcoDay, Screen: DayReport },
  { id: "shift", label: "シフト", Icon: IcoShift, Screen: Shifts },
  { id: "cast", label: "キャスト", Icon: IcoCast, Screen: Casts },
];

export default function App() {
  const init = useApp((s) => s.init);
  const loaded = useApp((s) => s.loaded);
  const tab = useApp((s) => s.ui.tab);
  const setUI = useApp((s) => s.setUI);
  const name = useApp((s) => s.ledger.shop.name);
  const cloudInit = useCloud((s) => s.init);
  const role = useCloud((s) => s.role());
  useEffect(() => { void init().then(() => cloudInit()); }, [init, cloudInit]);
  const tabs = role === "cast" ? TABS.filter((t) => t.id === "shift")
    : role === "staff" ? TABS.filter((t) => t.id === "day" || t.id === "shift")
    : TABS;
  useEffect(() => {
    if (tab !== "set" && !tabs.some((t) => t.id === tab)) setUI({ tab: tabs[0].id, sheet: null });
  }, [tabs, tab, setUI]);

  const onSettings = tab === "set";
  const Screen = onSettings ? Settings : (tabs.find((t) => t.id === tab) ?? tabs[0]).Screen;
  const back = () => { setUI({ tab: tabs[0].id, setFocus: null, sheet: null }); window.scrollTo(0, 0); };

  return (
    <div className={`app ${onSettings ? "setpage" : ""}`}>
      <header className="topbar">
        {onSettings ? (
          <>
            <button type="button" className="iconbtn back" aria-label="戻る" onClick={back}><ChevLeft size={20} /></button>
            <div className="brand"><b>設定</b></div>
          </>
        ) : (
          <div className="brand"><b>{name || "締め台帳"}</b><span>{name ? "売上・給料・現金の締め" : ""}</span></div>
        )}
        <SaveStatus />
        {!onSettings && (
          <button type="button" className="iconbtn gear" aria-label="設定を開く"
            onClick={() => { setUI({ tab: "set", setFocus: null, sheet: null }); window.scrollTo(0, 0); }}>
            <IcoSet />
          </button>
        )}
      </header>
      <main>{loaded ? <Screen /> : <div className="empty">読み込み中…</div>}</main>
      {!onSettings && (
        <nav className="tabs" aria-label="画面切替">
          <div className="in" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
            {tabs.map(({ id, label, Icon }) => (
              <button key={id} type="button" aria-current={tab === id ? "page" : undefined}
                onClick={() => { setUI({ tab: id, setFocus: null, sheet: null }); window.scrollTo(0, 0); }}>
                <Icon />{label}
              </button>
            ))}
          </div>
        </nav>
      )}
      <Welcome />
      <Toast />
    </div>
  );
}

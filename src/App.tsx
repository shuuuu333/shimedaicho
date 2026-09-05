import { useEffect, type ComponentType } from "react";
import { useApp, type Tab } from "./state/store";
import { useCloud } from "./state/cloud";
import { SaveStatus } from "./ui/components/SaveStatus";
import { Toast } from "./ui/components/Toast";
import { IcoCast, IcoDay, IcoMonth, IcoSet, IcoShift } from "./ui/icons";
import { Month } from "./ui/screens/Month";
import { DayReport } from "./ui/screens/DayReport";
import { Casts } from "./ui/screens/Casts";
import { Shifts } from "./ui/screens/Shifts";
import { Settings } from "./ui/screens/Settings";

const TABS: { id: Tab; label: string; Icon: ComponentType; Screen: ComponentType }[] = [
  { id: "month", label: "今月", Icon: IcoMonth, Screen: Month },
  { id: "day", label: "日報", Icon: IcoDay, Screen: DayReport },
  { id: "shift", label: "シフト", Icon: IcoShift, Screen: Shifts },
  { id: "cast", label: "キャスト", Icon: IcoCast, Screen: Casts },
  { id: "set", label: "設定", Icon: IcoSet, Screen: Settings },
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
  const tabs = role === "cast" ? TABS.filter((t) => t.id === "shift" || t.id === "set")
    : role === "staff" ? TABS.filter((t) => t.id === "day" || t.id === "shift" || t.id === "set")
    : TABS;
  useEffect(() => { if (!tabs.some((t) => t.id === tab)) setUI({ tab: "day", sheet: null }); }, [tabs, tab, setUI]);

  const Screen = (tabs.find((t) => t.id === tab) ?? tabs[0]).Screen;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><b>{name || "締め台帳"}</b><span>{name ? "売上・給料・現金の締め" : ""}</span></div>
        <SaveStatus />
      </header>
      <main>{loaded ? <Screen /> : <div className="empty">読み込み中…</div>}</main>
      <nav className="tabs" aria-label="画面切替">
        <div className="in" style={tabs.length < 4 ? { gridTemplateColumns: `repeat(${tabs.length},1fr)` } : undefined}>
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-current={tab === id ? "page" : undefined}
              onClick={() => { setUI({ tab: id, setFocus: null, sheet: null }); window.scrollTo(0, 0); }}>
              <Icon />{label}
            </button>
          ))}
        </div>
      </nav>
      <Toast />
    </div>
  );
}

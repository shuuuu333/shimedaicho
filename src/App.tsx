import { useEffect, type ComponentType } from "react";
import { useApp, type Tab } from "./state/store";
import { SaveStatus } from "./ui/components/SaveStatus";
import { Toast } from "./ui/components/Toast";
import { IcoCast, IcoDay, IcoMonth, IcoSet } from "./ui/icons";
import { Month } from "./ui/screens/Month";
import { DayReport } from "./ui/screens/DayReport";
import { Casts } from "./ui/screens/Casts";
import { Settings } from "./ui/screens/Settings";

const TABS: { id: Tab; label: string; Icon: ComponentType; Screen: ComponentType }[] = [
  { id: "month", label: "今月", Icon: IcoMonth, Screen: Month },
  { id: "day", label: "日報", Icon: IcoDay, Screen: DayReport },
  { id: "cast", label: "キャスト", Icon: IcoCast, Screen: Casts },
  { id: "set", label: "設定", Icon: IcoSet, Screen: Settings },
];

export default function App() {
  const init = useApp((s) => s.init);
  const loaded = useApp((s) => s.loaded);
  const tab = useApp((s) => s.ui.tab);
  const setUI = useApp((s) => s.setUI);
  const name = useApp((s) => s.ledger.shop.name);
  useEffect(() => { void init(); }, [init]);

  const Screen = TABS.find((t) => t.id === tab)!.Screen;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><b>{name || "締め台帳"}</b><span>{name ? "売上・給料・現金の締め" : ""}</span></div>
        <SaveStatus />
      </header>
      <main>{loaded ? <Screen /> : <div className="empty">読み込み中…</div>}</main>
      <nav className="tabs" aria-label="画面切替">
        <div className="in">
          {TABS.map(({ id, label, Icon }) => (
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

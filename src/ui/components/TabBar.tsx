import type { ComponentType } from "react";
import { useLens } from "../useLens";

export interface TabDef { id: string; label: string; Icon: ComponentType }

/** 下のタブ。ガラスの帯の上を、指に付いてくるレンズが滑る。
 *
 *  動きの中身は useLens にある。画面の中の切り替え（Seg）と同じものを使うので、
 *  どこを触っても手応えが揃う。
 *
 *  画面そのものは離したときに 1 回だけ変わる。なぞる途中で変えると、
 *  レジや今月の描き直しが 1 本の指の動きで何度も走る。 */
export function TabBar({ tabs, current, onPick }: {
  tabs: TabDef[]; current: string; onPick: (id: string) => void;
}) {
  const i = Math.max(0, tabs.findIndex((t) => t.id === current));
  const lens = useLens(tabs.length, i, (n) => { const t = tabs[n]; if (t) onPick(t.id); });

  return (
    <nav className="tabs" aria-label="画面切替">
      <div className={`glass ${lens.held ? "held" : ""}`}>
        <div ref={lens.row} className="in"
          style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }} {...lens.bind}>
          <span ref={lens.lens} aria-hidden="true" className={`lens ${lens.held ? "held" : ""}`} />
          {tabs.map(({ id, label, Icon }, n) => (
            <button key={id} type="button" aria-current={current === id ? "page" : undefined}
              className={n === lens.shown ? "on" : ""}
              onClick={() => { if (id !== current) onPick(id); }}>
              <Icon />{label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

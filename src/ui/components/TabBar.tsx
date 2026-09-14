import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";

export interface TabDef { id: string; label: string; Icon: ComponentType }

/** 下のタブ。すりガラスの帯の上を、選んでいる所を示すレンズが動く。
 *
 *  指を置いて横になぞると、レンズが指に付いてきて、名前が先に光る。
 *  離したところに移る。押す前に「どこへ行くか」が見えるので、
 *  狙いを外して打ち直す、が減る。
 *
 *  なぞっているあいだに画面まで切り替えると、レジや今月の描き直しが
 *  1 本の指の動きで何回も走る。見えているのは帯だけなので、
 *  画面は離したときに 1 回だけ変える。 */
export function TabBar({ tabs, current, onPick }: {
  tabs: TabDef[]; current: string; onPick: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const idx = Math.max(0, tabs.findIndex((t) => t.id === current));
  /** なぞっているあいだ、指が指しているタブ。離すまで画面は変えない */
  const [aim, setAim] = useState<number | null>(null);
  const drag = useRef<{ id: number } | null>(null);
  const shown = aim ?? idx;

  /** 指の x から、どのタブを指しているか */
  const hit = useCallback((clientX: number): number => {
    const el = wrap.current;
    if (!el) return idx;
    const r = el.getBoundingClientRect();
    const w = r.width / tabs.length;
    return Math.min(tabs.length - 1, Math.max(0, Math.floor((clientX - r.left) / w)));
  }, [idx, tabs.length]);

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setAim(hit(e.clientX));
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    setAim(hit(e.clientX));
  };
  const up = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) { setAim(null); return; }
    drag.current = null;
    const i = hit(e.clientX);
    setAim(null);
    if (tabs[i] && tabs[i].id !== current) onPick(tabs[i].id);
  };
  const cancel = () => { drag.current = null; setAim(null); };

  // タブの数が変わったら（役割で 2〜5 に増減する）、はみ出した狙いを捨てる
  useEffect(() => { if (aim != null && aim >= tabs.length) setAim(null); }, [aim, tabs.length]);

  return (
    <nav className="tabs" aria-label="画面切替">
      <div className="glass">
        <div ref={wrap} className="in" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
          {/* 選んでいる所を示すレンズ。指に付いてくる */}
          <span className="lens" aria-hidden="true"
            style={{ width: `${100 / tabs.length}%`, transform: `translateX(${shown * 100}%)` }} />
          {tabs.map(({ id, label, Icon }, i) => (
            <button key={id} type="button" aria-current={current === id ? "page" : undefined}
              className={i === shown ? "on" : ""}
              // 押した所へ移るのは今までどおり。なぞったときは up で決まる
              onClick={() => { if (id !== current) onPick(id); }}>
              <Icon />{label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

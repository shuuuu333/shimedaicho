import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";

export interface TabDef { id: string; label: string; Icon: ComponentType }

/** 触ったときにレンズがどれだけ伸びるか（速く動かすほど伸びる）の上限 */
const MAX_STRETCH = 0.16;

/** 下のタブ。ガラスの帯の上を、指に付いてくるレンズが滑る。
 *
 *  レンズは升の真ん中で止まらない。指の下にいて、離したところで
 *  いちばん近い升へ収まる。止まる所が決まっていると、指で運んでいる感じが
 *  出ないし、どこで切り替わるのかも読めない。
 *
 *  なぞっているあいだ、レンズの位置は React を通さずに直に書いている。
 *  1 コマごとに 5 つのボタンを描き直すと、指から遅れて付いてくる。
 *  名前の光り（どの升にいるか）は変わったときだけ React に渡す。
 *
 *  画面そのものは離したときに 1 回だけ変える。なぞる途中で変えると、
 *  レジや今月の描き直しが 1 本の指の動きで何度も走る。 */
export function TabBar({ tabs, current, onPick }: {
  tabs: TabDef[]; current: string; onPick: (id: string) => void;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  const lens = useRef<HTMLSpanElement | null>(null);
  const idx = Math.max(0, tabs.findIndex((t) => t.id === current));

  /** 指が指している升。名前を先に光らせるために使う */
  const [aim, setAim] = useState<number | null>(null);
  /** 触っているあいだ。レンズを一回り大きくして、触れたことを返す */
  const [held, setHeld] = useState(false);
  const shown = aim ?? idx;

  const drag = useRef<{ id: number; x: number; t: number } | null>(null);
  const [w, setW] = useState(0);
  const slot = w / Math.max(1, tabs.length);

  // 幅は端末の向きでも変わるので、見張って測り直す
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const read = () => setW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** レンズを置く。
   *  指に付いてくるあいだは移り変わりを切って直に書く（React を通すと遅れる）。
   *  離したときだけ、ばねで升へ収まる。 */
  const put = useCallback((x: number, stretch = 1, spring = false) => {
    const el = lens.current;
    if (!el) return;
    el.style.transition = spring ? "" : "none";   // "" で CSS の既定（ばね）に戻る
    el.style.transform = `translate3d(${x}px,0,0) scaleX(${stretch})`;
  }, []);

  // 指を離しているあいだは、選んでいる升にぴたりと合わせる
  useEffect(() => { if (!drag.current) put(idx * slot, 1, true); }, [idx, slot, put]);

  const at = (clientX: number) => {
    const r = row.current?.getBoundingClientRect();
    if (!r || !slot) return { i: idx, x: idx * slot };
    // レンズの真ん中が指の下に来るように置く。帯からは出さない
    const x = Math.min(w - slot, Math.max(0, clientX - r.left - slot / 2));
    const i = Math.min(tabs.length - 1, Math.max(0, Math.round(x / slot)));
    return { i, x };
  };

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // 指が帯の外へ出ても追い続けたいので捕まえる。
    // すでに離れている指だと投げるので、失敗しても先へ進む
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 捕まえられなくても動く */ }
    drag.current = { id: e.pointerId, x: e.clientX, t: performance.now() };
    const { i, x } = at(e.clientX);
    setHeld(true);
    setAim(i);
    put(x);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    // 速く動かすほど、進む向きに伸びる（水のような手応え）
    const v = Math.abs(e.clientX - d.x) / Math.max(1, now - d.t);
    d.x = e.clientX; d.t = now;
    const { i, x } = at(e.clientX);
    put(x, 1 + Math.min(MAX_STRETCH, v * 0.09));
    if (i !== aim) setAim(i);          // 升をまたいだときだけ描き直す
  };

  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setHeld(false);
    if (!d || d.id !== e.pointerId) { setAim(null); return; }
    const { i } = at(e.clientX);
    setAim(null);
    put(i * slot, 1, true);             // いちばん近い升へ、ばねで収まる
    if (tabs[i] && tabs[i].id !== current) onPick(tabs[i].id);
  };

  const cancel = () => { drag.current = null; setHeld(false); setAim(null); put(idx * slot, 1, true); };

  // 役割でタブの数が変わったとき、はみ出した狙いを捨てる
  useEffect(() => { if (aim != null && aim >= tabs.length) setAim(null); }, [aim, tabs.length]);

  return (
    <nav className="tabs" aria-label="画面切替">
      <div className={`glass ${held ? "held" : ""}`}>
        <div ref={row} className="in" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
          <span ref={lens} aria-hidden="true"
            className={`lens ${held ? "held" : ""}`}
            style={{ width: slot || undefined }} />
          {tabs.map(({ id, label, Icon }, i) => (
            <button key={id} type="button" aria-current={current === id ? "page" : undefined}
              className={i === shown ? "on" : ""}
              onClick={() => { if (id !== current) onPick(id); }}>
              <Icon />{label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

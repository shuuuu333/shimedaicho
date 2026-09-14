/** 横に並んだ升の上を、指に付いてくるレンズが滑る仕掛け。
 *
 *  下のタブと、画面の中の切り替え（月／年、グラフ／カレンダー、棒／円／…）で
 *  同じ動きにしたいので、ここにまとめてある。触り心地が場所ごとに違うと、
 *  同じアプリを触っている感じがしなくなる。
 *
 *  升の幅は等分とは限らない。「棒／円／キャスト／曜日」のように字数が違うと、
 *  等分にしたぶん全体が広がって、隣の見出しが 1 文字ずつ折り返してしまった。
 *  だから幅は決め打ちせず、並んでいるボタンを実際に測って使う。
 *
 *  決めごとは 3 つ:
 *  ・レンズは升の真ん中で止まらない。指の下にいて、離した所でいちばん近い升へ収まる
 *  ・位置は React を通さず直に書く。1 コマごとに升を全部描き直すと指から遅れる
 *  ・選んだ結果は離したときに 1 回だけ返す。なぞる途中で返すと、中身が何度も描き直される
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** 触ったときにレンズが伸びる量の上限（速く動かすほど伸びる） */
const MAX_STRETCH = 0.16;

interface Slot { x: number; w: number }

export function useLens(count: number, index: number, onPick: (i: number) => void) {
  const row = useRef<HTMLDivElement | null>(null);
  const lens = useRef<HTMLSpanElement | null>(null);
  const drag = useRef<{ id: number; x: number; t: number } | null>(null);
  /** 指が指している升。名前を先に光らせるために使う */
  const [aim, setAim] = useState<number | null>(null);
  /** 触っているあいだ。レンズを一回り育てて、指の下にいることを返す */
  const [held, setHeld] = useState(false);
  /** 升ごとの左端と幅。並びが変わるたびに測り直す */
  const slots = useRef<Slot[]>([]);
  const [ready, setReady] = useState(0);
  const shown = aim ?? index;

  /** 升を測る。字の長さ・端末の向き・文字サイズで変わるので見張る */
  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const base = el.getBoundingClientRect().left;
    const next: Slot[] = [...el.querySelectorAll<HTMLElement>(":scope > button")]
      .map((b) => { const r = b.getBoundingClientRect(); return { x: r.left - base, w: r.width }; });
    slots.current = next;
    setReady((n) => n + 1);
  }, []);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const b of el.querySelectorAll(":scope > button")) ro.observe(b);
    return () => ro.disconnect();
  }, [measure, count]);

  /** レンズを置く。付いてくるあいだは移り変わりを切り、離したときだけばねで収める */
  const put = useCallback((x: number, w: number, stretch = 1, spring = false) => {
    const el = lens.current;
    if (!el || !w) return;
    el.style.transition = spring ? "" : "none";   // "" で CSS の既定（ばね）に戻る
    el.style.width = `${w}px`;
    el.style.transform = `translate3d(${x}px,0,0) scaleX(${stretch})`;
  }, []);

  /** 選んでいる升にぴたりと合わせる */
  useEffect(() => {
    if (drag.current) return;
    const s = slots.current[index];
    if (s) put(s.x, s.w, 1, true);
  }, [index, ready, put]);

  /** 指の位置から、どの升か。升をまたぐたびにレンズの幅も変わる */
  const at = useCallback((clientX: number) => {
    const el = row.current;
    const list = slots.current;
    if (!el || !list.length) return { i: index, x: 0, w: 0 };
    const p = clientX - el.getBoundingClientRect().left;
    let i = 0;
    for (let n = 0; n < list.length; n++) {
      const c = list[n].x + list[n].w / 2;
      if (p >= c) i = Math.min(list.length - 1, n + 1);
    }
    // いちばん近い升の中心が指の下に来るように置く。並びからは出さない
    const s = list[i];
    const last = list[list.length - 1];
    const x = Math.min(last.x + last.w - s.w, Math.max(list[0].x, p - s.w / 2));
    return { i, x, w: s.w };
  }, [index]);

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // 指が並びの外へ出ても追い続けたい。すでに離れている指だと投げるので囲う
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* 捕まえられなくても動く */ }
    drag.current = { id: e.pointerId, x: e.clientX, t: performance.now() };
    const { i, x, w } = at(e.clientX);
    setHeld(true); setAim(i); put(x, w);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    const v = Math.abs(e.clientX - d.x) / Math.max(1, now - d.t);
    d.x = e.clientX; d.t = now;
    const { i, x, w } = at(e.clientX);
    put(x, w, 1 + Math.min(MAX_STRETCH, v * 0.09));
    if (i !== aim) setAim(i);          // 升をまたいだときだけ描き直す
  };

  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setHeld(false);
    if (!d || d.id !== e.pointerId) { setAim(null); return; }
    const { i } = at(e.clientX);
    setAim(null);
    const s = slots.current[i];
    if (s) put(s.x, s.w, 1, true);
    if (i !== index) onPick(i);
  };

  const cancel = () => {
    drag.current = null; setHeld(false); setAim(null);
    const s = slots.current[index];
    if (s) put(s.x, s.w, 1, true);
  };

  // 升の数が減ったとき、はみ出した狙いを捨てる
  useEffect(() => { if (aim != null && aim >= count) setAim(null); }, [aim, count]);

  return {
    row, lens, held, shown,
    bind: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: cancel },
  };
}

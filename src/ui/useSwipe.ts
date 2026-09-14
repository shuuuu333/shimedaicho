/** 横スワイプ。タブの行き来と、日付・月の送りに使う。
 *
 *  レジは接客中に触るので、指が滑っただけで画面が変わると事故になる。
 *  だから「やらない条件」を先に決めてある:
 *
 *  - 横に動かせるもの（商品のカテゴリ・表）の中から始まった指は無視する
 *  - シートや明細が開いているあいだは効かせない（後ろの画面が動くのはおかしい）
 *  - 縦の方が大きい動きは、ページのスクロールとして通す
 *  - 画面の左端から始まった指は無視する（ブラウザの「戻る」と取り合いになる）
 *  - 指が 2 本のときは何もしない（拡大の操作）
 *  - 入力欄の上から始まった指も無視する（文字の選択ができなくなる）
 */
import { useCallback, useRef, useState } from "react";

/** この距離を超えたら「送る」。半分より小さいと、ただの揺れで動いてしまう */
const COMMIT_PX = 64;
/** 速く払ったときは距離が短くても送る（px/ms） */
const FLICK = 0.5;
/** 横か縦かを決めるまでの遊び */
const SLOP = 10;
/** ブラウザの「戻る」と取り合わない幅 */
const EDGE = 24;

/** 横の指か、縦の指か。まだ決まらないうちは "" を返す。
 *  一度決めたら最後まで変えない（途中で持ち替えると、画面とスクロールが同時に動く） */
export function swipeAxis(dx: number, dy: number): "" | "x" | "y" {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return "";
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/** 離したときに送るか。距離が足りていれば送る。
 *  足りなくても、速く払っていれば送る（短く速い動きは「めくった」ということ） */
export function shouldCommit(dx: number, dtMs: number): boolean {
  return Math.abs(dx) > COMMIT_PX || Math.abs(dx) / Math.max(1, dtMs) > FLICK;
}

/** 横に動かせる親がいるか。あるなら、その中身を動かす指として扱う */
function inHScroller(from: EventTarget | null, root: Element | null): boolean {
  let n = from instanceof Element ? from : null;
  while (n && n !== root) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    n = n.parentElement;
  }
  return false;
}

/** 画面の上に何か開いているか。開いていたら後ろでスワイプさせない */
function blocked(): boolean {
  return !!document.querySelector(".sheetwrap, .billwrap");
}

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable], [data-noswipe]");

export interface SwipeOpts {
  /** dir = 1 … 左へ払った（次へ）／ dir = -1 … 右へ払った（前へ） */
  onCommit: (dir: 1 | -1) => void;
  enabled?: boolean;
  /** 指に付いてくる量を返したいとき。false なら dx は always 0 */
  follow?: boolean;
  /** 端まで来ていて、それ以上進めない向き（付いてくる量を減らして「行き止まり」を伝える） */
  atEnd?: (dir: 1 | -1) => boolean;
  /** 外側のスワイプに渡さない。
   *  日付や月の帯はタブの切り替え（main）の中にあるので、止めておかないと
   *  帯を払ったつもりでタブまで動く。内側が受け取ったらそこで終わりにする */
  stop?: boolean;
}

export function useSwipe({ onCommit, enabled = true, follow = false, atEnd, stop = false }: SwipeOpts) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef<{ id: number; x: number; y: number; t: number; axis: "" | "x" | "y" } | null>(null);

  const reset = useCallback(() => { st.current = null; setDx(0); setDragging(false); }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || e.pointerType === "mouse" && e.button !== 0) return;
    if (blocked() || isTyping(e.target)) return;
    if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
    if (inHScroller(e.target, e.currentTarget as Element)) return;
    if (stop) e.stopPropagation();
    st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: "" };
  }, [enabled, stop]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    if (stop) e.stopPropagation();
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
    if (!s.axis) {
      if (!swipeAxis(ddx, ddy)) return;
      // 縦の方が大きければ、ページのスクロールとして手を引く
      s.axis = swipeAxis(ddx, ddy);
      if (s.axis === "y") { st.current = null; return; }
      setDragging(true);
    }
    if (!follow) return;
    const dir: 1 | -1 = ddx < 0 ? 1 : -1;
    // 行き止まりの向きは重くする。動かないのではなく「これ以上ない」と分かる
    setDx(atEnd?.(dir) ? ddx * 0.22 : ddx);
  }, [follow, atEnd, stop]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) { reset(); return; }
    if (stop) e.stopPropagation();
    const ddx = e.clientX - s.x;
    const dir: 1 | -1 = ddx < 0 ? 1 : -1;
    const go = s.axis === "x" && shouldCommit(ddx, performance.now() - s.t) && !atEnd?.(dir);
    reset();
    if (go) onCommit(dir);
  }, [onCommit, atEnd, reset, stop]);

  return {
    dx, dragging,
    bind: {
      onPointerDown, onPointerMove, onPointerUp,
      onPointerCancel: reset,
      // 横は自分で見る。縦のスクロールはブラウザに任せる
      style: { touchAction: "pan-y" as const },
    },
  };
}

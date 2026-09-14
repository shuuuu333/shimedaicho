import type { ReactNode } from "react";
import { useLens } from "../useLens";

/** label は文字だけでなくアイコン付きも入る（見た目の切替など） */
export interface SegItem<T extends string> { id: T; label: ReactNode }

/** 画面の中の切り替え（月／年、グラフ／カレンダー、棒／円／キャスト／曜日…）。
 *
 *  下のタブと同じ触り心地にしてある。押しても移れるし、
 *  指を置いて左右になぞればレンズが付いてきて、離した所に決まる。
 *  値の並びが短いので、なぞる方が押すより速いことが多い。 */
export function Seg<T extends string>({ items, value, onChange, label, wide = false }: {
  items: readonly SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** 幅いっぱいに広げる（設定の中など） */
  wide?: boolean;
}) {
  const i = Math.max(0, items.findIndex((x) => x.id === value));
  const lens = useLens(items.length, i, (n) => { const it = items[n]; if (it) onChange(it.id); });

  return (
    <div ref={lens.row} className={`seg ${wide ? "wide" : ""} ${lens.held ? "held" : ""}`}
      role="group" aria-label={label} {...lens.bind}>
      <span ref={lens.lens} aria-hidden="true" className={`seglens ${lens.held ? "held" : ""}`} />
      {items.map((x, n) => (
        <button key={x.id} type="button" aria-pressed={value === x.id}
          className={n === lens.shown ? "on" : ""}
          onClick={() => { if (x.id !== value) onChange(x.id); }}>{x.label}</button>
      ))}
    </div>
  );
}

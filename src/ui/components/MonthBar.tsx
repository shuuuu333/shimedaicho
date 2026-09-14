import type { ReactNode } from "react";
import { ChevLeft, ChevRight } from "../icons";
import { monthLabel } from "../../domain/format";
import { useSwipe } from "../useSwipe";

interface Props { month: string; onChange: (m: string) => void; right?: ReactNode; yearMode?: boolean }

/** 月送り（yearMode なら年送り）のバー */
export function MonthBar({ month, onChange, right, yearMode = false }: Props) {
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7));
  const shift = (d: number) => { const dt = new Date(y, mo - 1 + d * (yearMode ? 12 : 1), 1); onChange(dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0")); };
  // 帯を払って前後の月へ
  const swipe = useSwipe({ stop: true, onCommit: (dir) => shift(dir) });
  return (
    <div className="monthbar" {...swipe.bind}>
      <button type="button" className="mb" aria-label={yearMode ? "前の年" : "前の月"} onClick={() => shift(-1)}><ChevLeft /></button>
      <span className="lbl num">{yearMode ? `${y}年` : monthLabel(month)}</span>
      <button type="button" className="mb" aria-label={yearMode ? "次の年" : "次の月"} onClick={() => shift(1)}><ChevRight /></button>
      {right && <span className="sp">{right}</span>}
    </div>
  );
}

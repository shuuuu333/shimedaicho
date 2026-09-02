import type { ReactNode } from "react";
import { ChevLeft, ChevRight } from "../icons";
import { monthLabel } from "../../domain/format";

interface Props { month: string; onChange: (m: string) => void; right?: ReactNode }

export function MonthBar({ month, onChange, right }: Props) {
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7));
  const shift = (d: number) => { const dt = new Date(y, mo - 1 + d, 1); onChange(dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0")); };
  return (
    <div className="monthbar">
      <button type="button" className="mb" aria-label="前の月" onClick={() => shift(-1)}><ChevLeft /></button>
      <span className="lbl num">{monthLabel(month)}</span>
      <button type="button" className="mb" aria-label="次の月" onClick={() => shift(1)}><ChevRight /></button>
      {right && <span className="sp">{right}</span>}
    </div>
  );
}

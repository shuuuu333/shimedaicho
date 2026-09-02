import { parseNum } from "../../domain/format";

interface Props { value: number | null; onChange: (v: number | null) => void; label?: string }

/** −／＋ で本数を増減する */
export function Stepper({ value, onChange, label }: Props) {
  const v = value ?? 0;
  return (
    <span className="stepper">
      <button type="button" aria-label={`${label ?? ""}を1減らす`} onClick={() => onChange(Math.max(0, v - 1))}>−</button>
      <input type="text" inputMode="numeric" value={value ?? ""} placeholder="0" aria-label={label}
        onChange={(e) => onChange(parseNum(e.target.value))} onFocus={(e) => e.target.select()} />
      <button type="button" aria-label={`${label ?? ""}を1増やす`} onClick={() => onChange(v + 1)}>＋</button>
    </span>
  );
}

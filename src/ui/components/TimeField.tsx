import type { CSSProperties } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  style?: CSSProperties;
}

/** 時刻の入力。見た目は自前のボタンで、その上に OS のピッカーを透明に重ねる。
 *  input[type=time] をそのまま飾ると iPhone で高さや位置が崩れるため。 */
export function TimeField({ value, onChange, ariaLabel, style }: Props) {
  return (
    <label className="timefield" style={style}>
      <span className={`tv num ${value ? "" : "ph"}`}>{value || "--:--"}</span>
      <svg className="ti" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" />
      </svg>
      <input type="time" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

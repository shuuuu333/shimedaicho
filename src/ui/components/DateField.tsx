import type { CSSProperties } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  style?: CSSProperties;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const label = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const d = new Date(v + "T00:00:00");
  return `${v.slice(0, 4)}/${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))}（${WD[d.getDay()]}）`;
};

/** 日付の入力。時刻と同じく、見た目は自前でOSのピッカーを透明に重ねる。
 *  input[type=date] をそのまま飾ると iPhone で欄が重なって見えるため。 */
export function DateField({ value, onChange, ariaLabel, style }: Props) {
  return (
    <label className="timefield" style={style}>
      <span className={`tv num ${value ? "" : "ph"}`}>{label(value) || "----/--/--"}</span>
      <svg className="ti" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" /><path d="M3.5 9.5h17M8 3v3m8-3v3" />
      </svg>
      <input type="date" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

import { useState, type CSSProperties } from "react";
import { parseNum } from "../../domain/format";

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  decimal?: boolean;
  big?: boolean;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
}

/** 数値入力。全角・カンマ・¥ を吸収し、非フォーカス時は桁区切りで表示する */
export function NumberField({ value, onChange, placeholder = "0", decimal = false, big = false, className = "", style, autoFocus, id, ...rest }: Props) {
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState("");
  const shown = focus ? text : value == null ? "" : decimal ? String(value) : value.toLocaleString("ja-JP");
  return (
    <span className="numwrap" style={style}>
      <input
        id={id}
        className={`inp num ${big ? "big" : ""} ${className}`}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={shown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={rest["aria-label"]}
        onFocus={(e) => { setText(value == null ? "" : String(value)); setFocus(true); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => setFocus(false)}
        onChange={(e) => { setText(e.target.value); onChange(parseNum(e.target.value)); }}
      />
      {value != null && !focus && (
        <button type="button" className="clr" aria-label="消す" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(null); setText(""); }}>×</button>
      )}
    </span>
  );
}

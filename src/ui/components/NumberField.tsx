import { useState, type CSSProperties } from "react";
import { caretAfterDigits, digitsBefore, parseNum } from "../../domain/format";

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

/** 数値入力。全角・カンマ・¥ を吸収し、打っている最中から桁区切りを入れる。
 *
 *  打ち終わってから区切るのでは遅い。18800 と 188000 を打ち間違えても、
 *  区切りが無ければ画面を見ても気づけない。1 文字ごとに入れておけば
 *  「1万8千8百」と「18万8千」の違いがその場で目に入る。 */
export function NumberField({ value, onChange, placeholder = "0", decimal = false, big = false, className = "", style, autoFocus, id, ...rest }: Props) {
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState("");
  const fmt = (v: number | null) => (v == null ? "" : v.toLocaleString("ja-JP"));
  const shown = focus ? text : decimal ? (value == null ? "" : String(value)) : fmt(value);

  /** 打つたびに整形して、カーソルを同じ桁の後ろへ戻す */
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const raw = el.value;
    const n = parseNum(raw);
    onChange(n);

    // 小数（手数料の％など）は整形しない。打っている途中の "1." が消えてしまうため
    if (decimal) { setText(raw); return; }

    const before = digitsBefore(raw, el.selectionStart ?? raw.length);
    const next = n == null ? raw.replace(/[^\d-]/g, "") : fmt(n);
    setText(next);
    if (next !== raw) {
      const pos = caretAfterDigits(next, before);
      // 値を書き戻したあとでないと効かないので、描画の次で置き直す
      requestAnimationFrame(() => { try { el.setSelectionRange(pos, pos); } catch { /* 外れていたら何もしない */ } });
    }
  };

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
        onFocus={(e) => { setText(decimal ? (value == null ? "" : String(value)) : fmt(value)); setFocus(true); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => setFocus(false)}
        onChange={handle}
      />
      {value != null && !focus && (
        <button type="button" className="clr" aria-label="消す" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(null); setText(""); }}>×</button>
      )}
    </span>
  );
}

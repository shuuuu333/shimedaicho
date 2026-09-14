import { useEffect, useRef, useState } from "react";
import { yen } from "../../domain/format";

/** いま出す数。行き先を超えたり、手前へ飛んだりしない。
 *
 *  requestAnimationFrame が渡す時刻は「そのコマの開始時刻」なので、
 *  直前に取った performance.now() より前を指すことがある。
 *  割り算をそのまま使うと進み具合が負になり、行き先と逆へ一瞬飛ぶ。
 *  実際に 0 → 50,000 の 2 コマ目が −10,864 と出ていた。
 *  帳簿の画面で、ありもしない赤字が一瞬でも出るのはまずい。 */
export function tweenAt(from: number, to: number, elapsed: number, ms: number): number {
  if (ms <= 0) return to;
  const p = Math.min(1, Math.max(0, elapsed / ms));
  if (p >= 1) return to;
  const e = 1 - Math.pow(1 - p, 4);   // 最初にぐっと動いて、最後だけ静かに止まる
  return Math.round(from + (to - from) * e);
}

/** 動きを減らす設定にしている端末では、数えずにすぐ出す */
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** 数えながら変わる金額。
 *
 *  会計が 1 件通ったときに、今日の売上がすっと動く。数字が入れ替わるだけだと
 *  「変わったこと」に気づけない。動きがあると目が拾う。
 *
 *  画面に出た 1 回目は数えない。タブを行き来するたびに 0 から数え直すのは
 *  ただの演出で、そのあいだ本当の額が読めない。変わったときだけ動かす。
 *
 *  途中の数字は本物ではないので、入力欄と表の桁には使っていない
 *  （読み取る場所で、ありもしない額が一瞬でも出るのはまずい）。 */
export function Num({ value, format = yen, ms = 260, className }: {
  value: number;
  format?: (n: number) => string;
  ms?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  /** いま出ている数。途中で値が変わっても、そこから続けて動かすために持つ */
  const at = useRef(value);
  const raf = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; at.current = value; setShown(value); return; }
    if (at.current === value) return;
    if (reduced()) { at.current = value; setShown(value); return; }

    const a = at.current, b = value, t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const el = t - t0;
      const v = tweenAt(a, b, el, ms);
      at.current = v;
      setShown(v);
      if (el < ms) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);

  return <span className={className}>{format(shown)}</span>;
}

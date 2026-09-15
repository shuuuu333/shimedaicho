/** 月が変わったときに、カレンダーを向きどおりに滑らせる。
 *
 *  払って月を送れるようにしたが、動きが無いと右へ行ったのか左へ行ったのか
 *  目で追えない。数字が入れ替わるだけだと、送れたこと自体に気づかないこともある。
 *
 *  速さと曲線はタブの切り替え（base.css の slidein-l / slidein-r）と同じものを使う。
 *  同じアプリの中で「滑る速さ」が 2 つあると、作りが揃っていないように見える。
 *
 *  戻り値の `key` を要素に渡すと、月ごとに作り直されてアニメーションが
 *  最初からかかる（同じ要素に class を付け替えるだけでは、2 回目が動かない）。 */
import { useRef } from "react";

export function useMonthSlide(month: string): { key: string; className: string } {
  const prev = useRef(month);
  const dir = useRef<"" | "l" | "r">("");
  if (prev.current !== month) {
    // 次の月へ進んだなら、中身は左から入ってくる（タブを左へ送るのと同じ向き）
    dir.current = month > prev.current ? "l" : "r";
    prev.current = month;
  }
  return { key: month, className: dir.current ? `cal-slide-${dir.current}` : "" };
}

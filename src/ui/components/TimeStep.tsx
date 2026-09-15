import { addMinutes } from "../../domain/format";
import { TimeField } from "./TimeField";

/** 時刻 1 つぶん。「−30分 ｜ 21:00 ｜ +30分」。
 *
 *  数字は打たせない。押した回数だけ動く形がいちばん間違えにくい。
 *  細かく合わせたいときは、まん中の時刻を押せば端末のピッカーが出る。
 *
 *  ＋−は直す時刻のすぐ隣に置く。離して並べると、どちらを動かすボタンなのか
 *  押すまで分からない。
 *
 *  店側（シフトの予定）とキャスト側（希望・変更のお願い）で同じものを使う。
 *  同じことをする所が 2 つの形になっていると、片方だけ直されて食い違う。 */
export function TimeStep({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="tstep">
      <span className="k">{label}</span>
      <button type="button" className="sbtn" aria-label={`${label}を30分早める`}
        onClick={() => onChange(addMinutes(value, -30))}>−30分</button>
      <TimeField value={value} ariaLabel={`${label}の時刻`} onChange={onChange} />
      <button type="button" className="sbtn" aria-label={`${label}を30分遅らせる`}
        onClick={() => onChange(addMinutes(value, 30))}>+30分</button>
    </div>
  );
}

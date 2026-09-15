/** シフト希望を出す画面（キャスト本人）。
 *
 *  いまは「来月ここ入れます」を LINE で送って、店がメモ帳に写している。
 *  写し間違いが起きるし、誰がまだ出していないかも分からなくなる。
 *
 *  ここで出したものは店の「希望」に並ぶだけで、**予定にはならない**。
 *  決めるのは店。出した日が勝手に出勤日にならないことが、本人にも分かるように書く。
 *
 *  ■ 触りやすさを最優先にしてある
 *  キャストは毎日触るものではないし、急いでいる所で開く。
 *  ・日は押すだけ。時間は「よく使う時間」から選ぶだけ（数字は打たせない）
 *  ・時間はまとめて入る。5 日ぶんを 1 日ずつ決めさせない
 *  ・今日がどこかは、升を数えなくても分かるようにする */
import { useRef, useState } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { isWishDone, wishDays, wishesOn, wishOf } from "../../domain/wishes";
import { commonShifts, planFor } from "../../domain/plans";
import { WD, dayLabel, daysInMonth, monthLabel, shiftMonth, todayISO } from "../../domain/format";
import { TimeStep } from "./TimeStep";
import { useSwipe } from "../useSwipe";
import { useMonthSlide } from "../useMonthSlide";
import type { Cast } from "../../domain/types";

export function WishCard({ me, month, onMonth }: { me: Cast; month: string; onMonth: (m: string) => void }) {
  const L = useApp((s) => s.ledger);
  const showToast = useApp((s) => s.showToast);
  const wishSet = useCloud((s) => s.wishSet);
  const wishTimes = useCloud((s) => s.wishTimes);
  const wishDoneSet = useCloud((s) => s.wishDoneSet);
  const shopId = useCloud((s) => s.shopId);

  /** 時間を直している日。"*" なら「ぜんぶまとめて」 */
  const [timeFor, setTimeFor] = useState<string | null>(null);

  const days = wishDays(L, month, me.id);
  /** 出した希望のうち、店が予定にしたぶん */
  const fixedCount = days.filter((k) => planFor(L, k, me.id)).length;
  const done = isWishDone(L, me.id, month);
  const dim = daysInMonth(month);
  const lead = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();
  const today = todayISO();
  /** その店がよく使っている時間帯。決め打ちの候補は店によって当たらない */
  const patterns = commonShifts(L, 4);

  /** 升を長押しすると、その日の時間へ直行する。
   *  タップ＝入れる／外す、長押し＝時間、と分けておくと、
   *  下の一覧まで下りなくていい */
  const press = useRef<{ t: number; x: number; y: number; k: string } | null>(null);
  const holdFired = useRef(false);
  const startHold = (k: string, e: React.PointerEvent) => {
    holdFired.current = false;
    const t = window.setTimeout(() => {
      holdFired.current = true;
      if (!wishesOn(L, k).some((w) => w.castId === me.id)) toggle(k);
      setTimeFor(k);
      if (navigator.vibrate) navigator.vibrate(8);
    }, 450);
    press.current = { t, x: e.clientX, y: e.clientY, k };
  };
  const moveHold = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (Math.abs(e.clientX - p.x) > 10 || Math.abs(e.clientY - p.y) > 10) endHold();
  };
  const endHold = () => { if (press.current) { clearTimeout(press.current.t); press.current = null; } };

  const toggle = (k: string) => {
    const on = wishesOn(L, k).some((w) => w.castId === me.id);
    void wishSet(me.id, k, !on);
    // 出し終えたあとに直したなら、出し直しとして扱う。
    // 「出し終えた」のまま中身が変わると、店から見て何が最新か分からなくなる
    if (done) void wishDoneSet(me.id, month, false);
  };

  const setTime = (dates: readonly string[], t: { in?: string; out?: string }) => {
    if (!dates.length) return;
    void wishTimes(me.id, dates, t);
    if (done) void wishDoneSet(me.id, month, false);
    setTimeFor(null);
    showToast(dates.length > 1 ? `${dates.length}日ぶんの時間を決めました` : "時間を決めました");
  };

  const slide = useMonthSlide(month);
  const swipe = useSwipe({ stop: true, onCommit: (dir) => { onMonth(shiftMonth(month, dir)); setTimeFor(null); } });

  /** その日の表示用の時間。空なら店の時間 */
  const timeOf = (k: string) => {
    const w = wishOf(L, k, me.id);
    return { in: w?.in || L.shop.openTime, out: w?.out || L.shop.closeTime, own: !!(w?.in || w?.out) };
  };

  return (
    <div className="card">
      <div className="cardhead">
        <h2>{monthLabel(month)} の希望</h2>
        {done ? <span className="pill ok">出しました</span> : days.length ? <span className="pill warn">下書き</span> : null}
      </div>

      {/* 丸いしるしだけだと、出したのかどうかが読み取れない。1 行の日本語で言う */}
      <div className="wstate">
        {done
          ? fixedCount > 0
            ? <>{days.length}日のうち <b>{fixedCount}日が決まりました</b></>
            : <>{days.length ? <>{monthLabel(month)}ぶん <b>{days.length}日を出しました</b></> : <><b>「入れない」と出しました</b></>}。お店が決めるのを待っています</>
          : days.length
            ? <>下書き・<b>{days.length}日</b>えらんでいます。下のボタンを押すまで、お店には出ません</>
            : <>入れる日をえらんでください</>}
      </div>

      <p className="sub">
        入れる日をタップしてください。押しても<b>予定にはなりません</b>。決めるのはお店です。
        <br /><b>長押し</b>すると、その日の時間をすぐ決められます。<b>左右に払う</b>と月が変わります。
      </p>

      <div className="cal-head">{WD.map((w) => <span key={w}>{w}</span>)}</div>
      {/* 払って前後の月へ。上の月送りまで指を伸ばさなくていい */}
      <div className={`cal-grid mycal ${slide.className}`} key={slide.key} {...swipe.bind}>
        {Array.from({ length: lead }, (_, i) => <div key={"b" + i} className="cal-cell blank" aria-hidden="true" />)}
        {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
          const k = `${month}-${String(d).padStart(2, "0")}`;
          const wished = wishesOn(L, k).some((w) => w.castId === me.id);
          const fixed = !!planFor(L, k, me.id);
          const dow = (lead + d - 1) % 7;
          return (
            <button key={k} type="button"
              onClick={() => { if (holdFired.current) { holdFired.current = false; return; } toggle(k); }}
              onPointerDown={(e) => startHold(k, e)} onPointerMove={moveHold}
              onPointerUp={endHold} onPointerCancel={endHold}
              className={`cal-cell shiftcell ${dow === 0 || dow === 6 ? "wk" : ""} ${fixed ? "done" : wished ? "next" : ""} ${k === today ? "today" : ""}`}
              aria-pressed={wished}
              aria-label={`${Number(month.slice(5, 7))}月${d}日 ${fixed ? "お店が決めた出勤日" : wished ? "入れると出している" : "出していない"}`}>
              <span className="cd">{d}</span>
              {fixed ? <span className="cwho" aria-hidden="true">決まり</span>
                : wished ? <span className="cwho" aria-hidden="true">{timeOf(k).in}</span> : null}
              {k === today ? <span className="cn" aria-hidden="true">今日</span> : null}
            </button>
          );
        })}
      </div>

      <div className="legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: "var(--accent-soft)" }} />入れると出した日</span>
        <span><i style={{ background: "var(--accent)" }} />お店が決めた日</span>
      </div>

      {/* 出している日と、その時間。
          1 日ずつ決めさせない。ふつうは全部同じ時間なので、まとめてを先に出す */}
      {days.length > 0 && (
        <>
          <div className="sechead" style={{ marginTop: 14 }}>
            <div className="t">出している日</div><div className="l" /><div className="n">{days.length}日</div>
          </div>

          <button type="button" className="btn sm wide" onClick={() => setTimeFor(timeFor === "*" ? null : "*")}>
            {timeFor === "*" ? "閉じる" : "ぜんぶ同じ時間にする"}
          </button>
          {timeFor === "*" && <Times patterns={patterns} now={timeOf(days[0])} onPick={(t) => setTime(days, t)} />}

          {days.map((k) => {
            const t = timeOf(k);
            return (
              <div key={k}>
                <button type="button" className="lrow" onClick={() => setTimeFor(timeFor === k ? null : k)}>
                  <div className="g"><div className="t">{dayLabel(k)}</div>
                    <div className="s">{t.own ? "自分で決めた時間" : "お店の時間でいい"}</div></div>
                  <div className="a num">{t.in}-{t.out}</div>
                </button>
                {timeFor === k && <Times patterns={patterns} now={t} onPick={(tt) => setTime([k], tt)} />}
              </div>
            );
          })}
        </>
      )}

      {/* 出し終えたかどうかは、店から見て「催促する相手」を決めるのに要る。
          1 日も入れない月でも、押してもらえれば「入れない」とはっきりする */}
      {done ? (
        <>
          <div className="hint" style={{ marginTop: 12 }}>
            {days.length ? `${days.length}日ぶん` : "「入れない」と"}お店に出しています。直したいときは日をタップしてください。
          </div>
          <button type="button" className="btn sm wide" style={{ marginTop: 8 }}
            onClick={() => { void wishDoneSet(me.id, month, false); showToast("下書きに戻しました"); }}>
            出し直す
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn primary wide" style={{ marginTop: 12, minHeight: 50 }}
            onClick={() => { void wishDoneSet(me.id, month, true); showToast(days.length ? `${days.length}日ぶんを出しました` : "「入れない」と出しました"); }}>
            {days.length ? `${days.length}日ぶんを出す` : "この月は入れないと出す"}
          </button>
          <div className="hint" style={{ marginTop: 6 }}>
            押すまで、お店の一覧では「まだ出していない」ままです。
          </div>
        </>
      )}

      {!shopId && (
        <div className="hint" style={{ marginTop: 8 }}>
          いまはこの端末の中だけに残っています。お店とつながると届きます。
        </div>
      )}
    </div>
  );
}

/** 時間の選び方。
 *
 *  候補と、自分で決める欄を、隠さずに並べる。候補に無い時間は珍しくないし
 *  （「21時に上がりたい」「今日は23時から」）、奥にあると、あきらめて
 *  近い候補を押すことになり、出した希望が本当のことでなくなる。
 *
 *  数字は打たせない。＋−で動かすか、時刻を押して端末のピッカーを出す。
 *  店側のシフトと同じ `TimeStep` を使う（同じことを 2 つの形で持たない）。 */
function Times({ patterns, now, onPick }: {
  patterns: readonly { in: string; out: string }[];
  now: { in: string; out: string };
  onPick: (t: { in?: string; out?: string }) => void;
}) {
  const [from, setFrom] = useState(now.in);
  const [to, setTo] = useState(now.out);
  const changed = from !== now.in || to !== now.out;

  return (
    <div className="timebox">
      <div className="chipgrid">
        {patterns.map((p) => (
          <button key={`${p.in}-${p.out}`} type="button"
            className={`cchip ${p.in === now.in && p.out === now.out ? "on" : ""}`}
            onClick={() => onPick({ in: p.in, out: p.out })}>
            {p.in}-{p.out}
          </button>
        ))}
        <button type="button" className="cchip" onClick={() => onPick({})}>お店の時間でいい</button>
      </div>
      <TimeStep label="入り" value={from} onChange={setFrom} />
      <TimeStep label="上がり" value={to} onChange={setTo} />
      <button type="button" className={`btn wide ${changed ? "primary" : ""}`} style={{ marginTop: 8 }}
        disabled={!from || !to || !changed}
        onClick={() => onPick({ in: from, out: to })}>
        {changed ? `${from}-${to} にする` : "この時間で決まっています"}
      </button>
    </div>
  );
}
